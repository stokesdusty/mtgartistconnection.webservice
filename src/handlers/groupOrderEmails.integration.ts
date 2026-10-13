import SigningBatch from '../models/SigningBatch';
import { sendEmail } from '../services/emailService';
import { sendCutoffReminders, settleNotifications } from '../services/groupOrderNotifications';
import { addCard, createOrder, join, openOrderWithAlice, review, run, setStatus, settings, users, useTestDatabase } from './groupOrderTestHarness';

// Who gets which group order email, against a real MongoDB. Sending itself is mocked.

jest.mock('../services/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined), sendWelcomeEmail: jest.fn() }));

useTestDatabase();

const sendMock = sendEmail as jest.Mock;
/** [recipient, subject] for everything sent since the last check. */
const sent = async () => {
    await settleNotifications();
    const calls = sendMock.mock.calls.map(([to, subject]) => [to, subject]);
    sendMock.mockClear();
    return calls;
};

beforeEach(() => sendMock.mockClear());

/** An open order with alice approved, ignoring the join and approval emails that setting it up sends. */
const quietOrderWithAlice = async (overrides: Record<string, unknown> = {}) => {
    const result = await openOrderWithAlice(overrides);
    await sent();
    return result;
};

const asRunner = (source: string, variables: Record<string, unknown>) => run(source, variables, users.organizer);
const optOut = (orderId: string, userId: string) =>
    run(`mutation($o: ID!) { setGroupOrderEmailOptOut(orderId: $o, optOut: true) { success } }`, { o: orderId }, userId);
const participantsOf = async (orderId: string) =>
    (await asRunner(`query($o: ID!) { organizedGroupOrder(orderId: $o) { participants { id status customItems { id } } rows { rowId participantId } } }`, { o: orderId })).organizedGroupOrder;

describe('joining', () => {
    it('emails the organizer about join requests, unless they opted out', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        await join(order.inviteToken, users.bob, 'bob.builds');
        expect(await sent()).toEqual([['runner@test.local', 'bob.builds asked to join IX run']]);

        const second = await createOrder();
        await setStatus(second.id, 'open');
        await optOut(second.id, users.organizer);
        await join(second.inviteToken, users.bob);
        expect(await sent()).toEqual([]);
    });

    it('emails people when they are approved, unless they opted out', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        const alice = await join(order.inviteToken, users.alice);
        const bob = await join(order.inviteToken, users.bob);
        await optOut(order.id, users.bob);
        await sent();

        await review(alice.me.id, true);
        await review(bob.me.id, true);
        expect(await sent()).toEqual([['alice@test.local', "You're in: IX run"]]);
    });
});

describe('prices', () => {
    it('only tells people with cards in a cell that changed', async () => {
        const { order } = await openOrderWithAlice();
        const bob = await join(order.inviteToken, users.bob);
        await review(bob.me.id, true);
        await addCard(order.id, users.alice, { artist: 'Rebecca Guay', signatureTypeId: 'sketch', quantity: 1 });
        await addCard(order.id, users.bob, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
        await sent();

        const repriced = settings({
            artists: [
                { name: 'Rebecca Guay', cap: 3, prices: [{ signatureTypeId: 'sig', price: 5 }, { signatureTypeId: 'sketch', price: 60 }] },
                { name: 'Kaja Foglio', prices: [{ signatureTypeId: 'sig', price: 3 }] },
            ],
        });
        await asRunner(`mutation($o: ID!, $s: GroupOrderSettingsInput!) { updateGroupOrder(orderId: $o, name: "IX run", settings: $s) { id } }`, { o: order.id, s: repriced });
        expect(await sent()).toEqual([['alice@test.local', 'Prices updated in IX run']]);
    });
});

describe('progress', () => {
    it('emails about items once they are added or priced, not for status changes', async () => {
        const { aliceId } = await quietOrderWithAlice();
        const added = (await asRunner(`mutation($p: ID!, $i: GroupOrderCustomItemInput!) { addGroupOrderCustomItem(participantId: $p, item: $i) { participants { id customItems { id } } } }`,
            { p: aliceId, i: { label: 'Bolt AP', quantity: 1 } })).addGroupOrderCustomItem;
        expect(await sent()).toEqual([['alice@test.local', 'Bolt AP added to your order']]);

        const itemId = added.participants.find((p: any) => p.id === aliceId).customItems[0].id;
        const update = (item: Record<string, unknown>) => asRunner(
            `mutation($p: ID!, $id: String!, $i: GroupOrderCustomItemInput!) { updateGroupOrderCustomItem(participantId: $p, itemId: $id, item: $i) { id } }`,
            { p: aliceId, id: itemId, i: { label: 'Bolt AP', quantity: 1, ...item } });
        await update({ price: 12 });
        expect(await sent()).toEqual([['alice@test.local', 'Bolt AP is priced']]);
        await update({ price: 12, status: 'purchased' });
        expect(await sent()).toEqual([]);
    });

    it('emails on the first check-in only, flagging counts that are off', async () => {
        const { order, aliceId } = await quietOrderWithAlice();
        const card = (await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 2, cardName: 'Mana Vault' })).rows[0];
        const checkIn = (received: number) => asRunner(
            `mutation($p: ID!, $c: [GroupOrderCheckInInput!]!) { checkInGroupOrderPackage(participantId: $p, counts: $c) { id } }`,
            { p: aliceId, c: [{ rowId: card.rowId, receivedQuantity: received }] });

        await checkIn(1);
        expect(await sent()).toEqual([['alice@test.local', 'Your package arrived (check the counts): IX run']]);
        await checkIn(2);
        expect(await sent()).toEqual([]);
    });

    it('sends signing results when cards head back, to people with marked cards', async () => {
        const { order } = await quietOrderWithAlice();
        const bob = await join(order.inviteToken, users.bob);
        await review(bob.me.id, true);
        const card = (await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rows[0];
        await addCard(order.id, users.bob, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
        await setStatus(order.id, 'closed');
        await setStatus(order.id, 'at-event');
        await asRunner(`mutation($o: ID!, $ids: [String!]!) { setGroupOrderRowStatus(orderId: $o, rowIds: $ids, status: "signed") { id } }`, { o: order.id, ids: [card.rowId] });
        await sent();

        await setStatus(order.id, 'returning');
        expect(await sent()).toEqual([['alice@test.local', 'Signing results: IX run']]);
    });

    it('emails return tracking when it is set or changed', async () => {
        const { order, aliceId } = await quietOrderWithAlice();
        await setStatus(order.id, 'closed');
        await setStatus(order.id, 'at-event');
        const track = (tracking: string) => asRunner(`mutation($p: ID!, $t: String) { setGroupOrderReturnTracking(participantId: $p, tracking: $t) { id } }`, { p: aliceId, t: tracking });

        await track('1Z999');
        expect(await sent()).toEqual([['alice@test.local', 'Your cards are on the way back: IX run']]);
        await track('1Z999');
        expect(await sent()).toEqual([]);
    });

    it('tells everyone in the order, or waiting to get in, when it is cancelled', async () => {
        const { order } = await quietOrderWithAlice();
        await join(order.inviteToken, users.bob);
        await sent();

        await setStatus(order.id, 'cancelled');
        expect((await sent()).sort()).toEqual([['alice@test.local', 'IX run was cancelled'], ['bob@test.local', 'IX run was cancelled']]);
    });

    it('never emails guests, who have no account', async () => {
        const { order } = await quietOrderWithAlice();
        await asRunner(`mutation($o: ID!) { addGroupOrderGuest(orderId: $o, displayName: "Sam") { id } }`, { o: order.id });
        await sent();
        await setStatus(order.id, 'cancelled');
        expect(await sent()).toEqual([['alice@test.local', 'IX run was cancelled']]);
        expect((await participantsOf(order.id)).participants).toHaveLength(2);
    });
});

describe('cutoff reminders', () => {
    it('reminds approved participants once, about two days before the cutoff', async () => {
        const now = new Date();
        const { order } = await quietOrderWithAlice({ cutoff: new Date(now.getTime() + 30 * 3600_000).toISOString() });
        const later = await createOrder({ cutoff: new Date(now.getTime() + 72 * 3600_000).toISOString() });
        await setStatus(later.id, 'open');
        await sent();

        expect(await sendCutoffReminders(now)).toBe(1);
        expect(await sent()).toEqual([['alice@test.local', 'IX run closes soon']]);
        expect(await sendCutoffReminders(now)).toBe(0);
        expect((await SigningBatch.findById(order.id).lean())?.groupOrder?.cutoffReminderSentAt).toBeTruthy();
    });
});
