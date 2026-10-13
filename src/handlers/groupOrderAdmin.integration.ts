import GroupOrderParticipant from '../models/GroupOrderParticipant';
import GroupOrderReport from '../models/GroupOrderReport';
import SigningBatch from '../models/SigningBatch';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { settleNotifications } from '../services/groupOrderNotifications';
import { addCard, createOrder, invite, join, openOrderWithAlice, run, setStatus, users, useTestDatabase } from './groupOrderTestHarness';

// Reports, admin review and disabling, and deleting orders, against a real MongoDB.

jest.mock('../services/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined), sendWelcomeEmail: jest.fn() }));

useTestDatabase();

let admin: string;
beforeAll(async () => {
    admin = String((await User.create({ name: 'admin', email: 'admin@test.local', password: 'not-a-real-hash', role: 'admin' }))._id);
});
afterEach(() => GroupOrderReport.deleteMany({}));

const REPORT = `mutation($o: ID!, $r: String!) { reportGroupOrder(orderId: $o, reason: $r) { success message } }`;
const ADMIN_LIST = `query($r: Boolean) { adminGroupOrders(reportedOnly: $r) { id name status organizerEmail participantCount openReportCount disabled disabledReason
    reports { reason reporterEmail resolvedAt } } }`;
const asAdmin = (source: string, variables: Record<string, unknown> = {}) => run(source, variables, admin, 'admin');
const report = (orderId: string, userId: string, reason = 'This organizer is asking for payment outside the order.') => run(REPORT, { o: orderId, r: reason }, userId);

describe('reports', () => {
    it('takes one report per person, never from the organizer, and emails admins', async () => {
        const { order } = await openOrderWithAlice();
        await settleNotifications();  // the join and approval emails from setting up
        (sendEmail as jest.Mock).mockClear();

        await expect(report(order.id, users.alice, 'bad')).rejects.toThrow('a sentence or two');
        expect((await report(order.id, users.alice)).reportGroupOrder).toMatchObject({ success: true });
        await expect(report(order.id, users.alice)).rejects.toThrow('already reported');
        await expect(report(order.id, users.organizer)).rejects.toThrow("can't report your own");

        await settleNotifications();
        expect((sendEmail as jest.Mock).mock.calls.map(([to, subject]) => [to, subject])).toEqual([['admin@test.local', 'Group order reported: IX run']]);
    });

    it('lists reported orders for admins only, with the reports', async () => {
        const { order } = await openOrderWithAlice();
        await createOrder();  // never reported
        await report(order.id, users.alice);

        await expect(run(ADMIN_LIST, {}, users.alice)).rejects.toThrow('Admin privileges required');
        const reported = (await asAdmin(ADMIN_LIST, { r: true })).adminGroupOrders;
        expect(reported).toEqual([expect.objectContaining({
            id: order.id, organizerEmail: 'runner@test.local', participantCount: 1, openReportCount: 1,
            reports: [expect.objectContaining({ reporterEmail: 'alice@test.local', resolvedAt: null })],
        })]);
        expect((await asAdmin(ADMIN_LIST)).adminGroupOrders).toHaveLength(2);

        const resolved = (await asAdmin(`mutation($o: ID!) { resolveGroupOrderReports(orderId: $o) { openReportCount reports { resolvedAt } } }`, { o: order.id })).resolveGroupOrderReports;
        expect(resolved.openReportCount).toBe(0);
        expect(resolved.reports[0].resolvedAt).toBeTruthy();
    });
});

describe('disabling', () => {
    const DISABLE = `mutation($o: ID!, $d: Boolean!, $r: String) { setGroupOrderDisabled(orderId: $o, disabled: $d, reason: $r) { disabled disabledReason } }`;

    it('makes the order read-only for everyone and turns the invite link off, until re-enabled', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        await expect(run(DISABLE, { o: order.id, d: true }, users.organizer)).rejects.toThrow('Admin privileges required');
        expect((await asAdmin(DISABLE, { o: order.id, d: true, r: 'Suspected scam' })).setGroupOrderDisabled).toEqual({ disabled: true, disabledReason: 'Suspected scam' });

        expect(await invite(order.inviteToken)).toBeNull();
        await expect(join(order.inviteToken, users.bob)).rejects.toThrow("isn't active");
        await expect(addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rejects.toThrow('disabled by an admin');
        await expect(setStatus(order.id, 'closed')).rejects.toThrow('disabled by an admin');
        await expect(run(`mutation($o: ID!) { resetGroupOrderInvite(orderId: $o) { id } }`, { o: order.id }, users.organizer)).rejects.toThrow('disabled by an admin');
        await expect(run(`mutation($p: ID!) { recordGroupOrderPayment(participantId: $p, amount: 5) { id } }`, { p: aliceId }, users.organizer)).rejects.toThrow('disabled by an admin');
        // Everyone can still see it, with the reason.
        const mine = (await run(`query($o: ID!) { myGroupOrder(orderId: $o) { disabled disabledReason } }`, { o: order.id }, users.alice)).myGroupOrder;
        expect(mine).toEqual({ disabled: true, disabledReason: 'Suspected scam' });

        await asAdmin(DISABLE, { o: order.id, d: false });
        expect(await invite(order.inviteToken)).toMatchObject({ status: 'open' });
        await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
    });
});

describe('deleting orders', () => {
    const DELETE = `mutation($o: ID!) { deleteGroupOrder(orderId: $o) { success } }`;

    it('deletes drafts, with any participants', async () => {
        const order = await createOrder();
        await run(DELETE, { o: order.id }, users.organizer);
        expect(await SigningBatch.exists({ _id: order.id })).toBeNull();
        await expect(run(DELETE, { o: order.id }, users.alice)).rejects.toThrow('not found');
    });

    it("only deletes cancelled orders that never received cards and weren't reported", async () => {
        const { order, aliceId } = await openOrderWithAlice();
        await expect(run(DELETE, { o: order.id }, users.organizer)).rejects.toThrow('Cancel the order');
        await setStatus(order.id, 'cancelled');

        await GroupOrderParticipant.updateOne({ _id: aliceId }, { $set: { receivedAt: new Date() } });
        await expect(run(DELETE, { o: order.id }, users.organizer)).rejects.toThrow("received someone's cards");
        await GroupOrderParticipant.updateOne({ _id: aliceId }, { $set: { receivedAt: null } });

        await report(order.id, users.alice);
        await expect(run(DELETE, { o: order.id }, users.organizer)).rejects.toThrow('was reported');
        await GroupOrderReport.deleteMany({});

        expect((await run(DELETE, { o: order.id }, users.organizer)).deleteGroupOrder.success).toBe(true);
        expect(await GroupOrderParticipant.countDocuments({ orderId: order.id })).toBe(0);
    });
});
