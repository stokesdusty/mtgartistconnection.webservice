import GroupOrderParticipant from '../models/GroupOrderParticipant';
import SigningBatch from '../models/SigningBatch';
import User from '../models/User';
import {
    approvedEmail,
    cancelledEmail,
    cutoffReminderEmail,
    GroupOrderEmail,
    groupOrderReportEmail,
    itemEmail,
    joinRequestEmail,
    packageReceivedEmail,
    PriceChangeLine,
    pricesChangedEmail,
    returnShippedEmail,
    signingResultsEmail,
} from '../templates/groupOrderEmails';
import { sendEmail } from './emailService';
import { CellChange } from './groupOrders';

// Who gets which group order email. Guests have no account (so no email), and anyone can opt
// out per order. Sends run in the background so an email problem never fails a change.

const pending = new Set<Promise<unknown>>();

/** Runs a send without blocking or failing the caller; problems are logged. */
export function notifyInBackground(task: Promise<unknown>): void {
    const tracked = task.catch((err) => console.error('Group order email failed:', err)).finally(() => pending.delete(tracked));
    pending.add(tracked);
}

/** Waits for background sends to finish. For tests. */
export const settleNotifications = async () => {
    while (pending.size) await Promise.all([...pending]);
};

const sendTo = async (userId: unknown, email: GroupOrderEmail) => {
    const user = userId ? await User.findById(userId).select('email').lean() : null;
    if (user?.email) await sendEmail(user.email, email.subject, email.html);
};

/** Participants who should hear about the order: active, with an account, not opted out. */
const recipients = (orderId: unknown, statuses = ['approved']) =>
    GroupOrderParticipant.find({ orderId, status: { $in: statuses }, userId: { $ne: null }, emailOptOut: { $ne: true } }).lean();

const loadOrder = (orderId: unknown) => SigningBatch.findOne({ _id: orderId, groupOrder: { $ne: null } }).lean();

const base = (order: { _id: unknown; name: string }) => ({ orderId: String(order._id), orderName: order.name });

const optedIn = (participant: { userId?: unknown; emailOptOut?: boolean } | null) => !!participant?.userId && !participant.emailOptOut;

/** To the organizer: someone asked to join. */
export async function notifyJoinRequest(orderId: unknown, participantId: unknown) {
    const [order, participant] = await Promise.all([loadOrder(orderId), GroupOrderParticipant.findById(participantId).lean()]);
    if (!order?.groupOrder || order.groupOrder.organizerEmailOptOut || !participant) return;
    await sendTo(order.userId, joinRequestEmail({ ...base(order), requester: participant.discordName || participant.displayName }));
}

export async function notifyApproved(participantId: unknown) {
    const participant = await GroupOrderParticipant.findById(participantId).lean();
    if (!optedIn(participant)) return;
    const order = await loadOrder(participant!.orderId);
    if (!order?.groupOrder) return;
    await sendTo(participant!.userId, approvedEmail({ ...base(order), organizer: order.groupOrder.organizerDiscordName }));
}

/** Only participants with cards in a changed cell hear about it, and only about their cells. */
export async function notifyPriceChanges(orderId: unknown, changes: CellChange[]) {
    const order = await loadOrder(orderId);
    if (!order?.groupOrder || !changes.length) return;
    const typeLabel = (id: string) => order.groupOrder!.signatureTypes.find((t) => t.id === id)?.label ?? id;
    for (const participant of await recipients(orderId)) {
        const theirs = changes.filter((c) => order.rows.some((r) =>
            String(r.participantId) === String(participant._id) && r.artist === c.artist && r.signatureTypeId === c.signatureTypeId && r.status !== 'not-signed'));
        if (!theirs.length) continue;
        const lines: PriceChangeLine[] = theirs.map((c) => ({ artist: c.artist, signatureType: typeLabel(c.signatureTypeId), from: c.from, to: c.to }));
        await sendTo(participant.userId, pricesChangedEmail({ ...base(order), changes: lines }));
    }
}

export async function notifyItem(participantId: unknown, item: { label: string; quantity: number; price: number | null }, added: boolean) {
    const participant = await GroupOrderParticipant.findById(participantId).lean();
    if (!optedIn(participant)) return;
    const order = await loadOrder(participant!.orderId);
    if (!order) return;
    await sendTo(participant!.userId, itemEmail({ ...base(order), ...item, added }));
}

export async function notifyPackageReceived(participantId: unknown) {
    const participant = await GroupOrderParticipant.findById(participantId).lean();
    if (!optedIn(participant)) return;
    const order = await loadOrder(participant!.orderId);
    if (!order) return;
    const mismatches = order.rows
        .filter((r) => String(r.participantId) === String(participant!._id) && r.receivedQuantity != null && r.receivedQuantity !== r.quantity)
        .map((r) => ({ cardName: r.cardName, listed: r.quantity, received: r.receivedQuantity! }));
    await sendTo(participant!.userId, packageReceivedEmail({ ...base(order), mismatches }));
}

/** When cards head back: each participant's signed / not-signed results. */
export async function notifySigningResults(orderId: unknown) {
    const order = await loadOrder(orderId);
    if (!order) return;
    for (const participant of await recipients(orderId)) {
        const results = order.rows
            .filter((r) => String(r.participantId) === String(participant._id) && r.status !== 'collecting')
            .map((r) => ({ cardName: r.cardName, artist: r.artist, quantity: r.quantity, signed: r.status === 'signed', reason: r.notSignedReason }));
        if (results.length) await sendTo(participant.userId, signingResultsEmail({ ...base(order), results }));
    }
}

export async function notifyReturnShipped(participantId: unknown) {
    const participant = await GroupOrderParticipant.findById(participantId).lean();
    if (!optedIn(participant) || !participant!.returnTracking) return;
    const order = await loadOrder(participant!.orderId);
    if (!order) return;
    await sendTo(participant!.userId, returnShippedEmail({ ...base(order), tracking: participant!.returnTracking }));
}

/** Everyone who was in or waiting to get in. */
export async function notifyCancelled(orderId: unknown) {
    const order = await loadOrder(orderId);
    if (!order) return;
    for (const participant of await recipients(orderId, ['requested', 'approved'])) {
        await sendTo(participant.userId, cancelledEmail(base(order)));
    }
}

/** To every admin: someone reported an order. */
export async function notifyAdminsOfReport(orderId: unknown, reporterId: unknown, reason: string) {
    const [order, reporter, admins] = await Promise.all([
        loadOrder(orderId),
        User.findById(reporterId).select('name email').lean(),
        User.find({ role: 'admin' }).select('email').lean(),
    ]);
    if (!order) return;
    const organizer = await User.findById(order.userId).select('name email').lean();
    const email = groupOrderReportEmail({
        ...base(order),
        organizer: `${organizer?.name ?? 'unknown'} (${organizer?.email ?? 'no email'})${order.groupOrder?.organizerDiscordName ? `, Discord ${order.groupOrder.organizerDiscordName}` : ''}`,
        reporter: `${reporter?.name ?? 'Someone'} (${reporter?.email ?? 'no email'})`,
        reason,
    });
    for (const admin of admins) if (admin.email) await sendEmail(admin.email, email.subject, email.html);
}

const CUTOFF_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Reminds approved participants once, about 48 hours before an open order's cutoff. Marks
 * the order first, so overlapping runs can't send twice. Returns how many orders it covered.
 */
export async function sendCutoffReminders(now: Date = new Date()): Promise<number> {
    const due = await SigningBatch.find({
        'groupOrder.status': 'open',
        'groupOrder.cutoff': { $gt: now, $lte: new Date(now.getTime() + CUTOFF_WINDOW_MS) },
        'groupOrder.cutoffReminderSentAt': null,
        'groupOrder.disabledAt': null,
    }).lean();
    let covered = 0;
    for (const order of due) {
        const claimed = await SigningBatch.updateOne(
            { _id: order._id, 'groupOrder.cutoffReminderSentAt': null },
            { $set: { 'groupOrder.cutoffReminderSentAt': now } },
        );
        if (!claimed.modifiedCount) continue;
        covered += 1;
        for (const participant of await recipients(order._id)) {
            await sendTo(participant.userId, cutoffReminderEmail({ ...base(order), cutoff: order.groupOrder!.cutoff! }));
        }
    }
    return covered;
}
