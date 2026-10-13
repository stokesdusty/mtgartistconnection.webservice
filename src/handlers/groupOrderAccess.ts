import { randomUUID } from "crypto";
import { isValidObjectId } from "mongoose";
import GroupOrderParticipant from "../models/GroupOrderParticipant";
import SigningBatch, { GroupOrderStatus } from "../models/SigningBatch";
import SigningEvent from "../models/SigningEvent";
import User from "../models/User";
import {
    cardLimitError,
    effectiveOrderStatus,
    GroupOrderRowInput as RowInput,
    GroupOrderSettings,
    participantCan,
    validateGroupOrderRow,
} from "../services/groupOrders";
import { OrderBatch, OrderParticipant, organizerView, participantView } from "../services/groupOrderViews";

// Loading, access checks and atomic writes shared by the group order resolvers.
// Each change is its own atomic update, so organizer and participants never overwrite each other.

export const ACTIVE = ['requested', 'approved'];
export const FINISHED: GroupOrderStatus[] = ['complete', 'cancelled'];

export const notFound = () => new Error('Group order not found.');
export const objectId = (id: string) => {
    if (!isValidObjectId(id)) throw notFound();
    return id;
};
export const isDuplicateKey = (err: any) => err?.code === 11000;

export const asBatch = (doc: unknown) => doc as OrderBatch & { userId: unknown };
export const asParticipant = (doc: unknown) => doc as OrderParticipant & { orderId: unknown; receivedAt: Date | null };

export const cleanName = (name: string) => {
    const clean = (name ?? '').trim();
    if (!clean) throw new Error('Give the order a name.');
    if (clean.length > 100) throw new Error('Order names are limited to 100 characters.');
    return clean;
};

export const checkEvent = async (eventId: string | null | undefined) => {
    if (!eventId) return null;
    if (!isValidObjectId(eventId) || !(await SigningEvent.exists({ _id: eventId }))) throw new Error('That signing event no longer exists.');
    return eventId;
};

export const settingsUpdate = (settings: GroupOrderSettings) =>
    Object.fromEntries(Object.entries(settings).map(([key, value]) => [`groupOrder.${key}`, value]));

/** Uses the organizer's saved Discord name when they leave it blank, and saves it when they have none. */
export async function withOrganizerDiscordName(settings: GroupOrderSettings, userId: string): Promise<GroupOrderSettings> {
    const user = await User.findById(userId).select('discordName').lean();
    if (!settings.organizerDiscordName) return { ...settings, organizerDiscordName: user?.discordName ?? '' };
    if (user && !user.discordName) await User.updateOne({ _id: userId }, { $set: { discordName: settings.organizerDiscordName } });
    return settings;
}

export async function loadOrganizerOrder(orderId: string, userId: string) {
    const batch = await SigningBatch.findOne({ _id: objectId(orderId), userId, groupOrder: { $ne: null } }).lean();
    if (!batch) throw notFound();
    return asBatch(batch);
}

/** The caller's order, for a change: it must not be disabled. */
export async function loadOrganizerOrderForChange(orderId: string, userId: string) {
    const batch = await loadOrganizerOrder(orderId, userId);
    assertNotDisabled(batch);
    return batch;
}

export async function organizerResult(batch: unknown) {
    if (!batch) throw notFound();
    const order = asBatch(batch);
    const participants = await GroupOrderParticipant.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
    return organizerView(order, participants.map(asParticipant));
}

/** Runs an atomic update on an order the caller organizes and returns the organizer's view. */
export const updateOrganizerOrder = async (orderId: string, userId: string, update: object) =>
    organizerResult(await SigningBatch.findOneAndUpdate(
        { _id: objectId(orderId), userId, groupOrder: { $ne: null } },
        update,
        { new: true },
    ).lean());

export async function participantResult(orderId: unknown, userId: string) {
    const [batch, participant] = await Promise.all([
        SigningBatch.findOne({ _id: orderId, groupOrder: { $ne: null } }).lean(),
        GroupOrderParticipant.findOne({ orderId, userId, status: { $in: ACTIVE } }).lean(),
    ]);
    if (!batch || !participant) throw notFound();
    return participantView(asBatch(batch), asParticipant(participant));
}

/** Loads a participant for an organizer change, checking the caller organizes their order and it isn't disabled. */
export async function loadParticipantAsOrganizer(participantId: string, userId: string) {
    const participant = await GroupOrderParticipant.findById(objectId(participantId)).lean();
    const batch = participant && await SigningBatch.findOne({ _id: participant.orderId, userId, groupOrder: { $ne: null } }).select('groupOrder.disabledAt').lean();
    if (!participant || !batch) throw new Error('Participant not found.');
    assertNotDisabled(batch);
    return asParticipant(participant);
}

export const pullRows = (orderId: unknown, participantId: unknown) =>
    SigningBatch.updateOne({ _id: orderId }, { $pull: { rows: { participantId } }, $inc: { 'groupOrder.rowsVersion': 1 } });

// Matches the version a change was computed from. Orders created before the counter
// existed have no field, which counts as 0.
export const atVersion = (version: number | undefined) =>
    version ? version : { $in: [0, null] };

export type RowChange = { update: Record<string, unknown>; options?: { arrayFilters: Record<string, unknown>[] } };

/**
 * Applies one card change computed from the current cards. If someone else changed the
 * cards in between (so caps might no longer hold), it recomputes from fresh data.
 */
export async function changeRows(orderId: unknown, compute: (batch: OrderBatch & { userId: unknown }) => RowChange) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const doc = await SigningBatch.findOne({ _id: orderId, groupOrder: { $ne: null } }).lean();
        if (!doc) throw notFound();
        const batch = asBatch(doc);
        assertNotDisabled(batch);
        const { update, options } = compute(batch);
        const result = await SigningBatch.updateOne(
            { _id: batch._id, 'groupOrder.rowsVersion': atVersion((batch.groupOrder as any).rowsVersion) },
            { ...update, $inc: { 'groupOrder.rowsVersion': 1 } },
            options,
        );
        if (result.modifiedCount) return;
    }
    throw new Error('Lots of people are changing cards right now. Try again.');
}

export const sameId = (a: unknown, b: unknown) => a !== null && a !== undefined && String(a) === String(b);

/** A validated new card for a participant, labelled with the name the organizer coordinates by. */
export const newRow = (batch: OrderBatch, input: RowInput, participant: { _id: unknown; discordName?: unknown; displayName?: unknown }) => ({
    rowId: randomUUID(),
    ...validateGroupOrderRow(batch.groupOrder, input),
    participantId: participant._id,
    owner: String(participant.discordName || participant.displayName || ''),
    status: 'collecting',
    signingMethod: 'event',
});

/** Adds `row` after checking caps. */
export function addRowChange(batch: OrderBatch, row: ReturnType<typeof newRow>): RowChange {
    const blocked = cardLimitError(batch.groupOrder, batch.rows, [...batch.rows, row], row.participantId);
    if (blocked) throw new Error(blocked);
    return { update: { $push: { rows: row } } };
}

/** Replaces the editable fields of an existing card after checking caps. */
export function updateRowChange(batch: OrderBatch, rowId: string, input: RowInput, ownerId?: unknown): RowChange {
    const existing = batch.rows.find((r) => r.rowId === rowId && (ownerId === undefined || sameId(r.participantId, ownerId)));
    if (!existing) throw new Error('Card not found.');
    const clean = validateGroupOrderRow(batch.groupOrder, input);
    const after = batch.rows.map((r) => (r.rowId === rowId ? { ...r, ...clean } : r));
    const blocked = cardLimitError(batch.groupOrder, batch.rows, after, existing.participantId);
    if (blocked) throw new Error(blocked);
    return {
        update: { $set: Object.fromEntries(Object.entries(clean).map(([key, value]) => [`rows.$[row].${key}`, value])) },
        options: { arrayFilters: [{ 'row.rowId': rowId }] },
    };
}

export function removeRowChange(batch: OrderBatch, rowId: string, ownerId?: unknown): RowChange {
    const existing = batch.rows.find((r) => r.rowId === rowId && (ownerId === undefined || sameId(r.participantId, ownerId)));
    if (!existing) throw new Error('Card not found.');
    return { update: { $pull: { rows: { rowId } } } };
}

/** The caller's approved membership, for card changes. */
export async function approvedParticipant(orderId: string, userId: string) {
    const participant = await GroupOrderParticipant.findOne({ orderId: objectId(orderId), userId, status: 'approved' }).lean();
    if (!participant) throw new Error('Only approved participants can change cards in this order.');
    return asParticipant(participant);
}

export const assertParticipantCanEdit = (batch: OrderBatch) => {
    if (!participantCan('editCards', effectiveOrderStatus(batch.groupOrder))) {
        throw new Error("This order isn't taking card changes right now.");
    }
};

export const assertOrganizerCanEdit = (batch: OrderBatch & { userId: unknown }, userId: string) => {
    if (!sameId(batch.userId, userId)) throw notFound();
    if (FINISHED.includes(batch.groupOrder.status)) throw new Error(`This order is ${batch.groupOrder.status}.`);
};

/** Orders an admin has disabled are read-only for everyone. */
export const assertNotDisabled = (batch: { groupOrder?: { disabledAt?: Date | null } | null }) => {
    if (batch.groupOrder?.disabledAt) throw new Error('This order was disabled by an admin and can\'t be changed.');
};
