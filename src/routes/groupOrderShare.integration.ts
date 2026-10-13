import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import SigningBatch from '../models/SigningBatch';
import SigningEvent from '../models/SigningEvent';
import groupOrderShareRouter, { eventDateRange } from './groupOrderShare';
import { addCard, createOrder, openOrderWithAlice, run, setStatus, users, useTestDatabase } from '../handlers/groupOrderTestHarness';

// The Discord preview page, served over real HTTP against a real MongoDB.

useTestDatabase();

let server: Server;
let base: string;

beforeAll(async () => {
    process.env.FRONTEND_URL = 'http://site.test';
    const app = express();
    app.use('/share/group-order', groupOrderShareRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const get = async (token: string) => {
    const res = await fetch(`${base}/share/group-order/${token}`, { redirect: 'manual' });
    return { status: res.status, html: await res.text() };
};

describe('share page', () => {
    it("previews an open order with its event and slots, and forwards to the invite page", async () => {
        const event = await SigningEvent.create({ name: 'IX Art Show', city: 'Reading', startDate: 'Wed, 21 Oct 2026 12:00:00 GMT', endDate: 'Sat, 24 Oct 2026 12:00:00 GMT' });
        const { order } = await openOrderWithAlice();
        await SigningBatch.updateOne({ _id: order.id }, { $set: { 'groupOrder.eventId': event._id } });
        await addCard(order.id, users.alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2 });

        const { status, html } = await get(order.inviteToken);
        expect(status).toBe(200);
        expect(html).toContain('<meta property="og:title" content="IX run · Group order">');
        expect(html).toContain('Run by card.runner (Discord, unverified) · IX Art Show, Oct 21–24 · Artists: Rebecca Guay (1 left), Kaja Foglio');
        expect(html).toContain(`url=http://site.test/tracker/join/${order.inviteToken}`);
        expect(html).not.toMatch(/Main Street|alice/);
    });

    it('treats drafts, revoked links and disabled orders as inactive, but still forwards', async () => {
        const draft = await createOrder();
        expect((await get(draft.inviteToken)).status).toBe(404);

        await setStatus(draft.id, 'open');
        expect((await get(draft.inviteToken)).status).toBe(200);
        await SigningBatch.updateOne({ _id: draft.id }, { $set: { 'groupOrder.disabledAt': new Date() } });
        const disabled = await get(draft.inviteToken);
        expect(disabled.status).toBe(404);
        expect(disabled.html).toContain(`url=http://site.test/tracker/join/${draft.inviteToken}`);

        const { order } = await openOrderWithAlice();
        await run(`mutation($o: ID!) { resetGroupOrderInvite(orderId: $o, revoke: true) { id } }`, { o: order.id }, users.organizer);
        expect((await get(order.inviteToken)).status).toBe(404);
    });

    it('handles junk tokens', async () => {
        expect((await get('x'.repeat(80))).status).toBe(404);
        expect((await get('nope')).html).toContain("isn&#39;t active");
    });
});

describe('eventDateRange', () => {
    it('formats event dates the way they are stored', () => {
        expect(eventDateRange('Wed, 21 Oct 2026 12:00:00 GMT', 'Sat, 24 Oct 2026 12:00:00 GMT')).toBe('Oct 21–24');
        expect(eventDateRange('Fri, 30 Oct 2026 12:00:00 GMT', 'Mon, 02 Nov 2026 12:00:00 GMT')).toBe('Oct 30 – Nov 2');
        expect(eventDateRange('Sat, 24 Oct 2026 12:00:00 GMT', 'Sat, 24 Oct 2026 12:00:00 GMT')).toBe('Oct 24');
    });
});
