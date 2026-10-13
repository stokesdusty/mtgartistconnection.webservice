import { artistSlots, effectiveOrderStatus, GroupOrder, isPaymentDue, OrderRow, participantBalance, ParticipantForBalance, publicOrderSummary, sheetSignature } from './groupOrders';

// What each kind of viewer gets back from the API. Organizers see everything; participants
// see the order, slot counts and only their own cards, never anyone else's name or cards.

export interface OrderBatch {
    _id: unknown;
    name: string;
    rows: (OrderRow & Record<string, unknown>)[];
    groupOrder: GroupOrder & {
        eventId: unknown;
        inviteToken: string | null;
        disabledAt?: Date | null;
        disabledReason?: string;
        organizerEmailOptOut?: boolean;
    };
}

export interface OrderParticipant extends Omit<ParticipantForBalance, 'id'> {
    _id: unknown;
    userId: unknown;
    status: string;
    [field: string]: unknown;
}

const sameId = (a: unknown, b: unknown) => a !== null && a !== undefined && String(a) === String(b);

/** Fields every viewer of the order shares (minus what's private to the organizer or members). */
function sharedFields(batch: OrderBatch, now: Date) {
    const order = batch.groupOrder;
    const status = effectiveOrderStatus(order, now);
    const slots = artistSlots(order, batch.rows);
    return {
        id: String(batch._id),
        ...publicOrderSummary(batch.name, order, batch.rows),
        status,
        paymentDue: isPaymentDue(order.paymentTiming, status),
        disabled: !!order.disabledAt,
        disabledReason: order.disabledAt ? order.disabledReason || '' : null,
        artists: order.artists.map((a, i) => ({ ...a, used: slots[i].used, remaining: slots[i].remaining })),
    };
}

const withBalance = (order: GroupOrder, rows: OrderRow[], participant: OrderParticipant) => {
    const own = rows.filter((r) => sameId(r.participantId, participant._id));
    return {
        ...participant,
        id: String(participant._id),
        isGuest: !participant.userId,
        cardCount: own.reduce((sum, r) => sum + r.quantity, 0),
        balance: participantBalance(order, own, { ...participant, id: participant._id }),
        // Their cards changed after they marked ready to ship, so the printed sheet is out of date.
        sheetChanged: !!participant.readyToShipAt && participant.readyToShipSignature !== sheetSignature(own),
        // Cards the organizer counted differently from what was listed.
        mismatchCount: own.filter((r) => r.receivedQuantity != null && r.receivedQuantity !== r.quantity).length,
    };
};

/** Anyone holding the invite link. `viewerStatus` is 'organizer', their membership status, or null. */
export function inviteView(batch: OrderBatch, viewerStatus: string | null, now: Date = new Date()) {
    return { ...sharedFields(batch, now), viewerStatus };
}

export function organizerView(batch: OrderBatch, participants: OrderParticipant[], now: Date = new Date()) {
    return {
        ...sharedFields(batch, now),
        savedStatus: batch.groupOrder.status,
        organizerEmailOptOut: !!batch.groupOrder.organizerEmailOptOut,
        inviteToken: batch.groupOrder.inviteToken,
        privateInstructions: batch.groupOrder.privateInstructions,
        rows: batch.rows,
        participants: participants.map((p) => withBalance(batch.groupOrder, batch.rows, p)),
    };
}

/** Private instructions (address, payment handles) only once the organizer has approved them. */
export function participantView(batch: OrderBatch, participant: OrderParticipant, now: Date = new Date()) {
    const rows = batch.rows.filter((r) => sameId(r.participantId, participant._id));
    return {
        ...sharedFields(batch, now),
        privateInstructions: participant.status === 'approved' ? batch.groupOrder.privateInstructions : null,
        rows,
        me: withBalance(batch.groupOrder, rows, participant),
    };
}
