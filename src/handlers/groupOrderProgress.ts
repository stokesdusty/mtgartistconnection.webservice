import { randomUUID } from "crypto";
import { GraphQLBoolean, GraphQLFieldConfigMap, GraphQLFloat, GraphQLID, GraphQLList, GraphQLNonNull, GraphQLString } from "graphql";
import GroupOrderParticipant from "../models/GroupOrderParticipant";
import SigningBatch from "../models/SigningBatch";
import { requireAuth } from "../middleware/auth";
import { MutationResponseType } from "../schema/schema";
import {
    GroupOrderCheckInInput,
    GroupOrderCustomItemInput,
    OrganizerGroupOrderType,
    ParticipantGroupOrderType,
} from "../schema/groupOrderSchema";
import {
    cleanText,
    effectiveOrderStatus,
    MAX_NOTE,
    MAX_NOTES_TO_ORGANIZER,
    MAX_TRACKING,
    organizerCan,
    OrganizerAction,
    participantCan,
    ParticipantAction,
    sheetSignature,
    validateCheckInCounts,
    validateCustomItem,
    validatePaymentAmount,
    validateRowOutcome,
} from "../services/groupOrders";
import {
    asBatch,
    asParticipant,
    assertNotDisabled,
    changeRows,
    loadParticipantAsOrganizer,
    notFound,
    objectId,
    organizerResult,
    participantResult,
    sameId,
} from "./groupOrderAccess";
import { notifyInBackground, notifyItem, notifyPackageReceived, notifyReturnShipped } from "../services/groupOrderNotifications";

// Group order progress after people join: payments, shipping and check-in, custom items,
// and marking cards signed at the event. Rules live in services/groupOrders.ts.

const MAX_PAYMENTS = 100;
const MAX_CUSTOM_ITEMS = 50;

/** The caller's membership in an order, with the order, for participant actions. */
async function asMember(orderId: string, userId: string, statuses = ['approved']) {
    const participant = await GroupOrderParticipant.findOne({ orderId: objectId(orderId), userId, status: { $in: statuses } }).lean();
    if (!participant) throw new Error('Only approved participants can do that.');
    const batch = await SigningBatch.findOne({ _id: participant.orderId, groupOrder: { $ne: null } }).lean();
    if (!batch) throw notFound();
    assertNotDisabled(batch);
    return { batch: asBatch(batch), participant: asParticipant(participant) };
}

/** A participant the caller organizes, with their order, for organizer actions. */
async function asOrganizerOf(participantId: string, userId: string) {
    const participant = await loadParticipantAsOrganizer(participantId, userId);
    const batch = await SigningBatch.findById(participant.orderId).lean();
    if (!batch) throw notFound();
    assertNotDisabled(batch);
    return { batch: asBatch(batch), participant };
}

const PARTICIPANT_BLOCKED: Partial<Record<ParticipantAction, string>> = {
    reportPayment: "This order isn't taking payment reports right now.",
    markReadyToShip: "It's too late to ship cards for this order.",
    setInboundTracking: "It's too late to add shipping tracking for this order.",
    setReturnOption: "Return shipping can't be changed for this order anymore.",
    updateNotes: "Notes can't be changed for this order anymore.",
};

const ORGANIZER_BLOCKED: Record<OrganizerAction, string> = {
    recordPayment: "Payments can't be recorded on a draft order.",
    checkIn: 'Packages are checked in before the cards head back.',
    returnTracking: 'Return tracking is added once the event starts.',
    customItems: 'Custom items can only change before the cards head back.',
    markRows: 'Cards are marked signed between the cutoff and the end of the order.',
};

const requireParticipant = (batch: ReturnType<typeof asBatch>, action: ParticipantAction) => {
    if (!participantCan(action, effectiveOrderStatus(batch.groupOrder))) throw new Error(PARTICIPANT_BLOCKED[action]);
};

const requireOrganizer = (batch: ReturnType<typeof asBatch>, action: OrganizerAction) => {
    if (!organizerCan(action, effectiveOrderStatus(batch.groupOrder))) throw new Error(ORGANIZER_BLOCKED[action]);
};

const reloadOrganizer = async (orderId: unknown) => organizerResult(await SigningBatch.findById(orderId).lean());

/** Updates a participant record, failing clearly if it no longer matches (e.g. they left). */
async function updateParticipant(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { arrayFilters: Record<string, unknown>[] }, message = 'That changed in the meantime. Refresh and try again.') {
    const result = await GroupOrderParticipant.updateOne(filter, update, options);
    if (!result.matchedCount) throw new Error(message);
}

const customItemSet = (item: ReturnType<typeof validateCustomItem>) =>
    Object.fromEntries(Object.entries(item).map(([key, value]) => [`customItems.$[item].${key}`, value]));

export const groupOrderProgressMutations: GraphQLFieldConfigMap<any, any> = {
    // ─── Participants ────────────────────────────────────────────────────────
    /** "I've sent $X", for the organizer to confirm. */
    reportGroupOrderPayment: {
        type: ParticipantGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            amount:  { type: GraphQLNonNull(GraphQLFloat) },
            note:    { type: GraphQLString },
        },
        async resolve(_parent, { orderId, amount, note }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId);
            requireParticipant(batch, 'reportPayment');
            const payment = {
                id: randomUUID(), amount: validatePaymentAmount(amount, false), note: cleanText(note, 'The note', MAX_NOTE),
                source: 'participant', recordedBy: context.userId, createdAt: new Date(), confirmedAt: null,
            };
            await updateParticipant(
                { _id: participant._id, status: 'approved', [`payments.${MAX_PAYMENTS - 1}`]: { $exists: false } },
                { $push: { payments: payment } }, undefined, 'This order has too many payment entries. Ask the organizer to tidy them up.',
            );
            return participantResult(batch._id, context.userId);
        },
    },
    /** Takes back a report the organizer hasn't confirmed yet. */
    withdrawGroupOrderPayment: {
        type: ParticipantGroupOrderType,
        args: {
            orderId:   { type: GraphQLNonNull(GraphQLID) },
            paymentId: { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { orderId, paymentId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId);
            const result = await GroupOrderParticipant.updateOne(
                { _id: participant._id },
                { $pull: { payments: { id: paymentId, source: 'participant', confirmedAt: null } } },
            );
            if (!result.modifiedCount) throw new Error('Only payments you reported that the organizer hasn\'t confirmed can be withdrawn.');
            return participantResult(batch._id, context.userId);
        },
    },
    /**
     * Records that their package is ready, which reveals the shipping address and produces their
     * artist sheet. Calling it again after changing cards refreshes the sheet.
     */
    markGroupOrderReadyToShip: {
        type: ParticipantGroupOrderType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId);
            requireParticipant(batch, 'markReadyToShip');
            const own = batch.rows.filter((r) => sameId(r.participantId, participant._id));
            if (own.length === 0) throw new Error('Add your cards before marking them ready to ship.');
            await updateParticipant({ _id: participant._id, status: 'approved' }, {
                $set: { readyToShipAt: participant.readyToShipAt ?? new Date(), readyToShipSignature: sheetSignature(own) },
            });
            return participantResult(batch._id, context.userId);
        },
    },
    setGroupOrderInboundTracking: {
        type: ParticipantGroupOrderType,
        args: {
            orderId:  { type: GraphQLNonNull(GraphQLID) },
            tracking: { type: GraphQLString },
        },
        async resolve(_parent, { orderId, tracking }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId);
            requireParticipant(batch, 'setInboundTracking');
            await updateParticipant({ _id: participant._id, status: 'approved' }, { $set: { inboundTracking: cleanText(tracking, 'Tracking', MAX_TRACKING) } });
            return participantResult(batch._id, context.userId);
        },
    },
    /** Picks one of the organizer's return shipping options; null clears it. */
    setGroupOrderReturnOption: {
        type: ParticipantGroupOrderType,
        args: {
            orderId:        { type: GraphQLNonNull(GraphQLID) },
            returnOptionId: { type: GraphQLString },
        },
        async resolve(_parent, { orderId, returnOptionId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId);
            requireParticipant(batch, 'setReturnOption');
            if (returnOptionId && !batch.groupOrder.returnOptions.some((o) => o.id === returnOptionId)) {
                throw new Error("That return shipping option isn't offered anymore.");
            }
            await updateParticipant({ _id: participant._id, status: 'approved' }, { $set: { returnOptionId: returnOptionId || null } });
            return participantResult(batch._id, context.userId);
        },
    },
    /** Free text for the organizer, e.g. asking them to pick up artist proofs. */
    updateGroupOrderNotes: {
        type: ParticipantGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            notes:   { type: GraphQLString },
        },
        async resolve(_parent, { orderId, notes }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asMember(orderId, context.userId, ['requested', 'approved']);
            requireParticipant(batch, 'updateNotes');
            await updateParticipant({ _id: participant._id }, { $set: { notesToOrganizer: cleanText(notes, 'Notes', MAX_NOTES_TO_ORGANIZER) } });
            return participantResult(batch._id, context.userId);
        },
    },
    /** Per-order email opt-out, for the organizer (join requests) or a participant (updates). */
    setGroupOrderEmailOptOut: {
        type: MutationResponseType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            optOut:  { type: GraphQLNonNull(GraphQLBoolean) },
        },
        async resolve(_parent, { orderId, optOut }, context) {
            requireAuth(context.isAuthenticated);
            const asOrganizer = await SigningBatch.updateOne(
                { _id: objectId(orderId), userId: context.userId, groupOrder: { $ne: null } },
                { $set: { 'groupOrder.organizerEmailOptOut': optOut } },
            );
            if (asOrganizer.matchedCount) return { success: true };
            const asParticipant = await GroupOrderParticipant.updateOne(
                { orderId, userId: context.userId, status: { $in: ['requested', 'approved'] } },
                { $set: { emailOptOut: optOut } },
            );
            if (!asParticipant.matchedCount) throw notFound();
            return { success: true };
        },
    },

    // ─── Organizer ───────────────────────────────────────────────────────────
    /** A payment the organizer received (confirmed immediately), or a refund as a negative amount. */
    recordGroupOrderPayment: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            amount:        { type: GraphQLNonNull(GraphQLFloat) },
            note:          { type: GraphQLString },
        },
        async resolve(_parent, { participantId, amount, note }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'recordPayment');
            const now = new Date();
            const payment = {
                id: randomUUID(), amount: validatePaymentAmount(amount, true), note: cleanText(note, 'The note', MAX_NOTE),
                source: 'organizer', recordedBy: context.userId, createdAt: now, confirmedAt: now,
            };
            await updateParticipant(
                { _id: participant._id, [`payments.${MAX_PAYMENTS - 1}`]: { $exists: false } },
                { $push: { payments: payment } }, undefined, 'This person has too many payment entries. Remove some first.',
            );
            return reloadOrganizer(batch._id);
        },
    },
    confirmGroupOrderPayment: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            paymentId:     { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { participantId, paymentId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'recordPayment');
            await updateParticipant(
                { _id: participant._id, payments: { $elemMatch: { id: paymentId, confirmedAt: null } } },
                { $set: { 'payments.$[p].confirmedAt': new Date() } },
                { arrayFilters: [{ 'p.id': paymentId }] },
                'That payment was already confirmed or withdrawn.',
            );
            return reloadOrganizer(batch._id);
        },
    },
    /** Removes a payment entry, e.g. a report for money that never arrived. */
    removeGroupOrderPayment: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            paymentId:     { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { participantId, paymentId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'recordPayment');
            const result = await GroupOrderParticipant.updateOne({ _id: participant._id }, { $pull: { payments: { id: paymentId } } });
            if (!result.modifiedCount) throw new Error('That payment was already removed.');
            return reloadOrganizer(batch._id);
        },
    },
    /** Marks a package received with a count for each card; calling it again updates the counts. */
    checkInGroupOrderPackage: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            counts:        { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GroupOrderCheckInInput))) },
        },
        async resolve(_parent, { participantId, counts }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'checkIn');
            if (participant.status !== 'approved') throw new Error('Only approved participants have packages to check in.');

            if (counts.length) {
                await changeRows(batch._id, (fresh) => {
                    const own = fresh.rows.filter((r) => sameId(r.participantId, participant._id));
                    const clean = validateCheckInCounts(own, counts);
                    return {
                        update: { $set: Object.fromEntries(clean.map((c, i) => [`rows.$[r${i}].receivedQuantity`, c.receivedQuantity])) },
                        options: { arrayFilters: clean.map((c, i) => ({ [`r${i}.rowId`]: c.rowId })) },
                    };
                });
            }
            await updateParticipant({ _id: participant._id, status: 'approved' }, { $set: { receivedAt: participant.receivedAt ?? new Date() } });
            // Only the first check-in emails them; recounts are corrections.
            if (!participant.receivedAt) notifyInBackground(notifyPackageReceived(participant._id));
            return reloadOrganizer(batch._id);
        },
    },
    setGroupOrderReturnTracking: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            tracking:      { type: GraphQLString },
        },
        async resolve(_parent, { participantId, tracking }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'returnTracking');
            const clean = cleanText(tracking, 'Tracking', MAX_TRACKING);
            await updateParticipant({ _id: participant._id }, { $set: { returnTracking: clean } });
            if (clean && clean !== participant.returnTracking) notifyInBackground(notifyReturnShipped(participant._id));
            return reloadOrganizer(batch._id);
        },
    },
    addGroupOrderCustomItem: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            item:          { type: GraphQLNonNull(GroupOrderCustomItemInput) },
        },
        async resolve(_parent, { participantId, item }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'customItems');
            if (participant.status !== 'approved') throw new Error('Approve them before adding items for them.');
            const clean = validateCustomItem(item);
            await updateParticipant(
                { _id: participant._id, status: 'approved', [`customItems.${MAX_CUSTOM_ITEMS - 1}`]: { $exists: false } },
                { $push: { customItems: { id: randomUUID(), ...clean } } },
                undefined, `Each person can have up to ${MAX_CUSTOM_ITEMS} items.`,
            );
            notifyInBackground(notifyItem(participant._id, clean, true));
            return reloadOrganizer(batch._id);
        },
    },
    /** Edits an item, including pricing it or marking it purchased / unavailable. */
    updateGroupOrderCustomItem: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            itemId:        { type: GraphQLNonNull(GraphQLString) },
            item:          { type: GraphQLNonNull(GroupOrderCustomItemInput) },
        },
        async resolve(_parent, { participantId, itemId, item }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'customItems');
            const clean = validateCustomItem(item);
            const before = participant.customItems.find((i) => i.id === itemId);
            await updateParticipant(
                { _id: participant._id, 'customItems.id': itemId },
                { $set: customItemSet(clean) },
                { arrayFilters: [{ 'item.id': itemId }] },
                'That item was already removed.',
            );
            // Let them know once an item has a price, or its price changes. Status changes at the
            // event come in the signing results instead.
            if (clean.price !== null && clean.price !== before?.price) notifyInBackground(notifyItem(participant._id, clean, false));
            return reloadOrganizer(batch._id);
        },
    },
    removeGroupOrderCustomItem: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            itemId:        { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { participantId, itemId }, context) {
            requireAuth(context.isAuthenticated);
            const { batch, participant } = await asOrganizerOf(participantId, context.userId);
            requireOrganizer(batch, 'customItems');
            const result = await GroupOrderParticipant.updateOne({ _id: participant._id }, { $pull: { customItems: { id: itemId } } });
            if (!result.modifiedCount) throw new Error('That item was already removed.');
            return reloadOrganizer(batch._id);
        },
    },
    /** Event day: marks cards signed or not signed (with a reason), or back to waiting. Several at once. */
    setGroupOrderRowStatus: {
        type: OrganizerGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            rowIds:  { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) },
            status:  { type: GraphQLNonNull(GraphQLString) },
            reason:  { type: GraphQLString },
        },
        async resolve(_parent, { orderId, rowIds, status, reason }, context) {
            requireAuth(context.isAuthenticated);
            const outcome = validateRowOutcome(status, reason);
            if (rowIds.length === 0) throw new Error('Pick the cards to mark.');
            await changeRows(objectId(orderId), (batch) => {
                if (!sameId(batch.userId, context.userId)) throw notFound();
                assertNotDisabled(batch);
                requireOrganizer(batch, 'markRows');
                const known = new Set(batch.rows.map((r) => r.rowId));
                if (rowIds.some((id: string) => !known.has(id))) throw new Error('Some of those cards were removed. Refresh and try again.');
                return {
                    update: { $set: { 'rows.$[r].status': outcome.status, 'rows.$[r].notSignedReason': outcome.notSignedReason } },
                    options: { arrayFilters: [{ 'r.rowId': { $in: rowIds } }] },
                };
            });
            return reloadOrganizer(orderId);
        },
    },
};
