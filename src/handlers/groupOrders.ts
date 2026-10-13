import { randomUUID } from "crypto";
import { GraphQLBoolean, GraphQLFieldConfigMap, GraphQLID, GraphQLList, GraphQLNonNull, GraphQLString } from "graphql";
import GroupOrderParticipant from "../models/GroupOrderParticipant";
import SigningBatch from "../models/SigningBatch";
import User from "../models/User";
import { requireAuth } from "../middleware/auth";
import { MutationResponseType, UserType } from "../schema/schema";
import {
    GroupOrderInviteType,
    GroupOrderRowInput,
    GroupOrderSettingsInput,
    OrganizerGroupOrderType,
    ParticipantGroupOrderType,
} from "../schema/groupOrderSchema";
import {
    assertStatusChange,
    canLeave,
    changedPrices,
    joinError,
    newInviteToken,
    normalizeDiscordName,
    settingsChangeError,
    validateGroupOrderSettings,
} from "../services/groupOrders";
import { inviteView, organizerView, participantView } from "../services/groupOrderViews";
import {
    notifyApproved,
    notifyCancelled,
    notifyInBackground,
    notifyJoinRequest,
    notifyPriceChanges,
    notifySigningResults,
} from "../services/groupOrderNotifications";
import {
    ACTIVE,
    FINISHED,
    addRowChange,
    approvedParticipant,
    asBatch,
    asParticipant,
    assertOrganizerCanEdit,
    assertParticipantCanEdit,
    atVersion,
    changeRows,
    checkEvent,
    cleanName,
    isDuplicateKey,
    loadOrganizerOrder,
    loadOrganizerOrderForChange,
    loadParticipantAsOrganizer,
    newRow,
    objectId,
    organizerResult,
    participantResult,
    pullRows,
    removeRowChange,
    settingsUpdate,
    updateOrganizerOrder,
    updateRowChange,
    withOrganizerDiscordName,
} from "./groupOrderAccess";

// Group order ("signing run") API. Every rule lives in services/groupOrders.ts and every
// response is shaped by services/groupOrderViews.ts; these resolvers load, check and write.
// Each change is its own atomic update, so organizer and participants never overwrite each other.

export const groupOrderQueries: GraphQLFieldConfigMap<any, any> = {
    /** Public: the summary behind an invite link. Drafts and revoked links come back null. */
    groupOrderByInvite: {
        type: GroupOrderInviteType,
        args: { token: { type: GraphQLNonNull(GraphQLString) } },
        async resolve(_parent, { token }, context) {
            if (typeof token !== 'string' || token.length > 64) return null;
            const batch = await SigningBatch.findOne({ "groupOrder.inviteToken": token }).lean();
            if (!batch || batch.groupOrder?.status === 'draft' || batch.groupOrder?.disabledAt) return null;

            let viewerStatus: string | null = null;
            if (context.isAuthenticated) {
                if (String(batch.userId) === String(context.userId)) viewerStatus = 'organizer';
                else viewerStatus = (await GroupOrderParticipant.findOne({ orderId: batch._id, userId: context.userId }).select('status').lean())?.status ?? null;
            }
            return inviteView(asBatch(batch), viewerStatus);
        },
    },
    organizedGroupOrders: {
        type: GraphQLList(OrganizerGroupOrderType),
        async resolve(_parent, _args, context) {
            requireAuth(context.isAuthenticated);
            const batches = await SigningBatch.find({ userId: context.userId, groupOrder: { $ne: null } }).sort({ sortOrder: 1, createdAt: -1 }).lean();
            const participants = await GroupOrderParticipant.find({ orderId: { $in: batches.map((b) => b._id) } }).sort({ createdAt: 1 }).lean();
            return batches.map((b) => organizerView(asBatch(b), participants.filter((p) => String(p.orderId) === String(b._id)).map(asParticipant)));
        },
    },
    organizedGroupOrder: {
        type: OrganizerGroupOrderType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAuth(context.isAuthenticated);
            return organizerResult(await loadOrganizerOrder(orderId, context.userId));
        },
    },
    /** "Shared with me": orders the caller has joined or asked to join. */
    myGroupOrders: {
        type: GraphQLList(ParticipantGroupOrderType),
        async resolve(_parent, _args, context) {
            requireAuth(context.isAuthenticated);
            const memberships = await GroupOrderParticipant.find({ userId: context.userId, status: { $in: ACTIVE } }).sort({ sortOrder: 1, createdAt: -1 }).lean();
            const batches = await SigningBatch.find({ _id: { $in: memberships.map((m) => m.orderId) }, groupOrder: { $ne: null } }).lean();
            return memberships.flatMap((m) => {
                const batch = batches.find((b) => String(b._id) === String(m.orderId));
                return batch ? [participantView(asBatch(batch), asParticipant(m))] : [];
            });
        },
    },
    myGroupOrder: {
        type: ParticipantGroupOrderType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAuth(context.isAuthenticated);
            return participantResult(objectId(orderId), context.userId);
        },
    },
};

export const groupOrderMutations: GraphQLFieldConfigMap<any, any> = {
    // ─── Organizer ───────────────────────────────────────────────────────────
    createGroupOrder: {
        type: OrganizerGroupOrderType,
        args: {
            name:     { type: GraphQLNonNull(GraphQLString) },
            eventId:  { type: GraphQLID },
            settings: { type: GraphQLNonNull(GroupOrderSettingsInput) },
        },
        async resolve(_parent, { name, eventId, settings }, context) {
            requireAuth(context.isAuthenticated);
            const clean = await withOrganizerDiscordName(validateGroupOrderSettings(settings), context.userId);
            const batch = await SigningBatch.create({
                userId: context.userId,
                batchId: `group-${randomUUID()}`,
                name: cleanName(name),
                createdAt: new Date().toISOString(),
                rows: [],
                groupOrder: { ...clean, status: 'draft', eventId: await checkEvent(eventId), inviteToken: newInviteToken() },
            });
            return organizerView(asBatch(batch.toObject()), []);
        },
    },
    updateGroupOrder: {
        type: OrganizerGroupOrderType,
        args: {
            orderId:  { type: GraphQLNonNull(GraphQLID) },
            name:     { type: GraphQLNonNull(GraphQLString) },
            eventId:  { type: GraphQLID },
            settings: { type: GraphQLNonNull(GroupOrderSettingsInput) },
        },
        async resolve(_parent, { orderId, name, eventId, settings }, context) {
            requireAuth(context.isAuthenticated);
            const batch = await loadOrganizerOrderForChange(orderId, context.userId);
            if (FINISHED.includes(batch.groupOrder.status)) throw new Error(`This order is ${batch.groupOrder.status} and can't be changed.`);
            const clean = await withOrganizerDiscordName(validateGroupOrderSettings(settings), context.userId);
            const blocked = settingsChangeError(batch.groupOrder, clean, batch.rows);
            if (blocked) throw new Error(blocked);
            // Only applies if no cards changed since the check above, so a card can't land in a cell being removed.
            const updated = await SigningBatch.findOneAndUpdate(
                { _id: batch._id, userId: context.userId, 'groupOrder.rowsVersion': atVersion((batch.groupOrder as any).rowsVersion) },
                { $set: { name: cleanName(name), 'groupOrder.eventId': await checkEvent(eventId), ...settingsUpdate(clean) } },
                { new: true },
            ).lean();
            if (!updated) throw new Error('Cards changed while you were saving. Check the order and save again.');
            // Tell people with cards in a cell whose price was filled in or changed.
            const priceChanges = batch.groupOrder.status === 'draft' ? [] : changedPrices(batch.groupOrder, clean);
            if (priceChanges.length) notifyInBackground(notifyPriceChanges(batch._id, priceChanges));
            return organizerResult(updated);
        },
    },
    setGroupOrderStatus: {
        type: OrganizerGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            status:  { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { orderId, status }, context) {
            requireAuth(context.isAuthenticated);
            const batch = await loadOrganizerOrderForChange(orderId, context.userId);
            assertStatusChange(batch.groupOrder, status);
            // Only applies if nobody changed the status in between.
            const updated = await SigningBatch.findOneAndUpdate(
                { _id: batch._id, userId: context.userId, 'groupOrder.status': batch.groupOrder.status },
                { $set: { 'groupOrder.status': status } },
                { new: true },
            ).lean();
            if (!updated) throw new Error('The order changed while you were updating it. Refresh and try again.');
            if (status === 'returning') notifyInBackground(notifySigningResults(batch._id));
            if (status === 'cancelled') notifyInBackground(notifyCancelled(batch._id));
            return organizerResult(updated);
        },
    },
    /** New invite link (the old one stops working), or `revoke` to switch the link off. */
    resetGroupOrderInvite: {
        type: OrganizerGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            revoke:  { type: GraphQLBoolean },
        },
        async resolve(_parent, { orderId, revoke }, context) {
            requireAuth(context.isAuthenticated);
            await loadOrganizerOrderForChange(orderId, context.userId);
            return updateOrganizerOrder(orderId, context.userId, { $set: { 'groupOrder.inviteToken': revoke ? null : newInviteToken() } });
        },
    },
    reviewGroupOrderRequest: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            approve:       { type: GraphQLNonNull(GraphQLBoolean) },
        },
        async resolve(_parent, { participantId, approve }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await loadParticipantAsOrganizer(participantId, context.userId);
            const updated = await GroupOrderParticipant.updateOne(
                { _id: participant._id, status: 'requested' },
                { $set: { status: approve ? 'approved' : 'declined' } },
            );
            if (!updated.modifiedCount) throw new Error('That request was already handled, or they left.');
            if (approve) notifyInBackground(notifyApproved(participant._id));
            return organizerResult(await SigningBatch.findById(participant.orderId).lean());
        },
    },
    /** Removes someone before their package arrives. Their cards leave the order with them. */
    removeGroupOrderParticipant: {
        type: OrganizerGroupOrderType,
        args: { participantId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { participantId }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await loadParticipantAsOrganizer(participantId, context.userId);
            const updated = await GroupOrderParticipant.updateOne(
                { _id: participant._id, status: { $in: ACTIVE }, receivedAt: null },
                { $set: { status: 'removed' } },
            );
            if (!updated.modifiedCount) throw new Error("You already have their package, so they can't be removed. Return their cards first.");
            await pullRows(participant.orderId, participant._id);
            return organizerResult(await SigningBatch.findById(participant.orderId).lean());
        },
    },
    /** Someone without an account, e.g. a friend handing over cards in person. */
    addGroupOrderGuest: {
        type: OrganizerGroupOrderType,
        args: {
            orderId:     { type: GraphQLNonNull(GraphQLID) },
            displayName: { type: GraphQLNonNull(GraphQLString) },
            discordName: { type: GraphQLString },
        },
        async resolve(_parent, { orderId, displayName, discordName }, context) {
            requireAuth(context.isAuthenticated);
            const batch = await loadOrganizerOrderForChange(orderId, context.userId);
            if (FINISHED.includes(batch.groupOrder.status)) throw new Error(`This order is ${batch.groupOrder.status}.`);
            const name = (displayName ?? '').trim();
            if (!name || name.length > 60) throw new Error('Guest names need 1–60 characters.');
            await GroupOrderParticipant.create({
                orderId: batch._id, userId: null, displayName: name, discordName: normalizeDiscordName(discordName), status: 'approved',
            });
            return organizerResult(batch);
        },
    },

    /** Organizer adds a card for anyone in the order, e.g. a guest, until the order is finished. */
    organizerAddGroupOrderRow: {
        type: OrganizerGroupOrderType,
        args: {
            participantId: { type: GraphQLNonNull(GraphQLID) },
            row:           { type: GraphQLNonNull(GroupOrderRowInput) },
        },
        async resolve(_parent, { participantId, row }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await loadParticipantAsOrganizer(participantId, context.userId);
            if (participant.status !== 'approved') throw new Error('Approve them before adding cards for them.');
            await changeRows(participant.orderId, (batch) => {
                assertOrganizerCanEdit(batch, context.userId);
                return addRowChange(batch, newRow(batch, row, participant));
            });
            return organizerResult(await SigningBatch.findById(participant.orderId).lean());
        },
    },
    organizerUpdateGroupOrderRow: {
        type: OrganizerGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            rowId:   { type: GraphQLNonNull(GraphQLString) },
            row:     { type: GraphQLNonNull(GroupOrderRowInput) },
        },
        async resolve(_parent, { orderId, rowId, row }, context) {
            requireAuth(context.isAuthenticated);
            await changeRows(objectId(orderId), (batch) => {
                assertOrganizerCanEdit(batch, context.userId);
                return updateRowChange(batch, rowId, row);
            });
            return organizerResult(await loadOrganizerOrder(orderId, context.userId));
        },
    },
    organizerDeleteGroupOrderRow: {
        type: OrganizerGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            rowId:   { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { orderId, rowId }, context) {
            requireAuth(context.isAuthenticated);
            await changeRows(objectId(orderId), (batch) => {
                assertOrganizerCanEdit(batch, context.userId);
                return removeRowChange(batch, rowId);
            });
            return organizerResult(await loadOrganizerOrder(orderId, context.userId));
        },
    },

    // ─── Participants ────────────────────────────────────────────────────────
    /** Approved participants manage their own cards while the order is open. */
    addGroupOrderRow: {
        type: ParticipantGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            row:     { type: GraphQLNonNull(GroupOrderRowInput) },
        },
        async resolve(_parent, { orderId, row }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await approvedParticipant(orderId, context.userId);
            await changeRows(participant.orderId, (batch) => {
                assertParticipantCanEdit(batch);
                return addRowChange(batch, newRow(batch, row, participant));
            });
            return participantResult(participant.orderId, context.userId);
        },
    },
    updateGroupOrderRow: {
        type: ParticipantGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            rowId:   { type: GraphQLNonNull(GraphQLString) },
            row:     { type: GraphQLNonNull(GroupOrderRowInput) },
        },
        async resolve(_parent, { orderId, rowId, row }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await approvedParticipant(orderId, context.userId);
            await changeRows(participant.orderId, (batch) => {
                assertParticipantCanEdit(batch);
                return updateRowChange(batch, rowId, row, participant._id);
            });
            return participantResult(participant.orderId, context.userId);
        },
    },
    deleteGroupOrderRow: {
        type: ParticipantGroupOrderType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            rowId:   { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { orderId, rowId }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await approvedParticipant(orderId, context.userId);
            await changeRows(participant.orderId, (batch) => {
                assertParticipantCanEdit(batch);
                return removeRowChange(batch, rowId, participant._id);
            });
            return participantResult(participant.orderId, context.userId);
        },
    },
    joinGroupOrder: {
        type: ParticipantGroupOrderType,
        args: {
            token:       { type: GraphQLNonNull(GraphQLString) },
            discordName: { type: GraphQLString },
            acceptTerms: { type: GraphQLNonNull(GraphQLBoolean) },
        },
        async resolve(_parent, { token, discordName, acceptTerms }, context) {
            requireAuth(context.isAuthenticated);
            if (!acceptTerms) throw new Error("Accept the organizer's terms to join.");
            const batch = typeof token === 'string' && token.length <= 64
                ? await SigningBatch.findOne({ "groupOrder.inviteToken": token }).lean()
                : null;
            if (!batch?.groupOrder || batch.groupOrder.disabledAt) throw new Error("This invite link isn't active.");

            const existing = await GroupOrderParticipant.findOne({ orderId: batch._id, userId: context.userId }).select('status').lean();
            const blocked = joinError(batch.groupOrder as any, String(batch.userId) === String(context.userId), existing);
            if (blocked) throw new Error(blocked);

            const user = await User.findById(context.userId).select('name discordName').lean();
            if (!user) throw new Error('User not found.');
            const discord = normalizeDiscordName(discordName) || user.discordName || '';
            if (discord && !user.discordName) await User.updateOne({ _id: context.userId }, { $set: { discordName: discord } });

            let request;
            try {
                // Matches nobody (insert) or someone who left (ask again). Anyone else hits the
                // unique index, so a request that raced with a decline can't undo it.
                request = await GroupOrderParticipant.findOneAndUpdate(
                    { orderId: batch._id, userId: context.userId, status: { $in: ['left'] } },
                    { $set: { status: 'requested', displayName: user.name, discordName: discord, termsAcceptedAt: new Date() } },
                    { upsert: true, setDefaultsOnInsert: true, new: true },
                ).lean();
            } catch (err) {
                if (isDuplicateKey(err)) throw new Error("You've already asked to join this order.");
                throw err;
            }
            if (request) notifyInBackground(notifyJoinRequest(batch._id, request._id));
            return participantResult(batch._id, context.userId);
        },
    },
    leaveGroupOrder: {
        type: MutationResponseType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAuth(context.isAuthenticated);
            const participant = await GroupOrderParticipant.findOne({ orderId: objectId(orderId), userId: context.userId }).lean();
            if (!participant || !canLeave(participant)) {
                return { success: false, message: "You can't leave this order now. The organizer already has your cards." };
            }
            const updated = await GroupOrderParticipant.updateOne(
                { _id: participant._id, status: { $in: ACTIVE }, receivedAt: null },
                { $set: { status: 'left' } },
            );
            if (!updated.modifiedCount) return { success: false, message: "You can't leave this order now." };
            await pullRows(participant.orderId, participant._id);
            return { success: true };
        },
    },
    updateDiscordName: {
        type: UserType,
        args: { discordName: { type: GraphQLString } },
        async resolve(_parent, { discordName }, context) {
            requireAuth(context.isAuthenticated);
            return User.findByIdAndUpdate(context.userId, { $set: { discordName: normalizeDiscordName(discordName) } }, { new: true });
        },
    },
};
