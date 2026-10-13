import SigningBatch from '../models/SigningBatch';
import User from '../models/User';
import {
    addCard, createOrder, invite, join, myView, openOrderWithAlice, organizerView, ORDER, review, run, setStatus, settings, users, useTestDatabase, MINE,
} from './groupOrderTestHarness';

// End-to-end group order flows: the real schema and resolvers against a real MongoDB.
// Run with `npm run test:integration` (downloads a MongoDB binary on first run).

useTestDatabase();
let organizer: string;
let alice: string;
let bob: string;
beforeAll(() => ({ organizer, alice, bob } = users));

describe('group order lifecycle', () => {
    it('hides drafts, then shows the public summary once open', async () => {
        const order = await createOrder();
        expect(order).toMatchObject({ status: 'draft', participants: [] });
        expect(await invite(order.inviteToken)).toBeNull();

        await setStatus(order.id, 'open');
        expect(await invite(order.inviteToken)).toMatchObject({ name: 'IX run', status: 'open', viewerStatus: null });
        expect(await invite(order.inviteToken, organizer)).toMatchObject({ viewerStatus: 'organizer' });
    });

    it('takes join requests, shows private instructions only after approval', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');

        const requested = await join(order.inviteToken, bob, 'Bob.Builds');
        expect(requested).toMatchObject({ status: 'open', privateInstructions: null, me: { status: 'requested' } });
        expect(await invite(order.inviteToken, bob)).toMatchObject({ viewerStatus: 'requested' });
        // The Discord name given at join is saved to their profile, cleaned up.
        expect((await User.findById(bob).lean())?.discordName).toBe('bob.builds');
        await expect(join(order.inviteToken, bob)).rejects.toThrow('already asked');

        const view = await organizerView(order.id);
        expect(view.participants).toEqual([expect.objectContaining({ displayName: 'bob', discordName: 'bob.builds', status: 'requested' })]);

        await review(requested.me.id, true);
        expect(await myView(order.id, bob)).toMatchObject({ privateInstructions: 'Ship to 123 Main Street.', me: { status: 'approved' } });
    });

    it("doesn't let the organizer join, or declined people back in", async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        await expect(join(order.inviteToken, organizer)).rejects.toThrow('organizer');

        const requested = await join(order.inviteToken, bob);
        await review(requested.me.id, false);
        await expect(join(order.inviteToken, bob)).rejects.toThrow("hasn't approved");
        await expect(myView(order.id, bob)).rejects.toThrow('not found');
    });

    it('lets people who left ask again', async () => {
        const { order } = await openOrderWithAlice();
        const left = await run(`mutation($o: ID!) { leaveGroupOrder(orderId: $o) { success message } }`, { o: order.id }, alice);
        expect(left.leaveGroupOrder.success).toBe(true);
        expect(await join(order.inviteToken, alice)).toMatchObject({ me: { status: 'requested' } });
    });

    it("won't open an order whose cutoff has already passed", async () => {
        const order = await createOrder({ cutoff: new Date(Date.now() - 60_000).toISOString() });
        await expect(setStatus(order.id, 'open')).rejects.toThrow('The cutoff has passed');
    });

    it('stops taking people and card changes once the cutoff passes', async () => {
        const { order } = await openOrderWithAlice({ cutoff: new Date(Date.now() + 86_400_000).toISOString() });
        // Time passes: the cutoff is now behind us, with the order still saved as open.
        await SigningBatch.updateOne({ _id: order.id }, { $set: { 'groupOrder.cutoff': new Date(Date.now() - 60_000) } });

        expect(await invite(order.inviteToken)).toMatchObject({ status: 'closed' });
        await expect(join(order.inviteToken, bob)).rejects.toThrow("isn't taking new people");
        await expect(addCard(order.id, alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rejects.toThrow("isn't taking card changes");
        await expect(setStatus(order.id, 'open')).rejects.toThrow('Move it later to reopen');
        expect((await setStatus(order.id, 'at-event')).setGroupOrderStatus).toMatchObject({ status: 'at-event' });
    });

    it('turns off the invite link', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        await run(`mutation($o: ID!) { resetGroupOrderInvite(orderId: $o, revoke: true) { id } }`, { o: order.id }, organizer);
        expect(await invite(order.inviteToken)).toBeNull();
        await expect(join(order.inviteToken, bob)).rejects.toThrow("isn't active");
    });

    it("keeps other people's orders out of reach", async () => {
        const order = await createOrder();
        await expect(run(`query($o: ID!) { organizedGroupOrder(orderId: $o) { id } }`, { o: order.id }, alice)).rejects.toThrow('not found');
        await expect(run(`mutation($o: ID!) { setGroupOrderStatus(orderId: $o, status: "open") { id } }`, { o: order.id }, alice)).rejects.toThrow('not found');
    });
});

describe('cards', () => {
    it('prices cards from the grid and adds up the balance', async () => {
        const { order } = await openOrderWithAlice();
        await addCard(order.id, alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2, cardName: "Gaea's Liege" });
        const mine = await addCard(order.id, alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
        expect(mine.me.balance).toMatchObject({ cardsTotal: 13, due: 15, status: 'unpaid' });

        const pending = await addCard(order.id, alice, { artist: 'Rebecca Guay', signatureTypeId: 'sketch', quantity: 1 });
        expect(pending.me.balance).toMatchObject({ due: null, status: 'pending', pendingCount: 1 });
    });

    it('enforces artist caps and refuses cells the artist doesn\'t offer', async () => {
        const { order } = await openOrderWithAlice();
        await addCard(order.id, alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2 });
        await expect(addCard(order.id, alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2 })).rejects.toThrow('Only 1 more card');
        await expect(addCard(order.id, alice, { artist: 'Kaja Foglio', signatureTypeId: 'sketch', quantity: 1 })).rejects.toThrow("isn't offering");
    });

    it('holds the cap when people add cards at the same time', async () => {
        const { order } = await openOrderWithAlice();
        const bobJoin = await join(order.inviteToken, bob);
        await review(bobJoin.me.id, true);

        const attempts = await Promise.allSettled([alice, bob, alice, bob, alice].map((user) =>
            addCard(order.id, user, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 1 })));
        expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(3);
        expect((await organizerView(order.id)).artists[0]).toMatchObject({ cap: 3, used: 3, remaining: 0 });
    });

    it("shows participants only their own cards, and won't let them touch anyone else's", async () => {
        const { order } = await openOrderWithAlice();
        const bobJoin = await join(order.inviteToken, bob);
        await review(bobJoin.me.id, true);
        const aliceCard = (await addCard(order.id, alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rows[0];
        const bobView = await addCard(order.id, bob, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 2 });

        expect(bobView.rows).toHaveLength(1);
        expect(bobView.artists[1]).toMatchObject({ used: 3 });
        await expect(run(`mutation($o: ID!, $r: String!) { deleteGroupOrderRow(orderId: $o, rowId: $r) { id } }`,
            { o: order.id, r: aliceCard.rowId }, bob)).rejects.toThrow('Card not found');
    });

    it('lets participants edit and remove their cards while the order is open', async () => {
        const { order } = await openOrderWithAlice();
        const card = (await addCard(order.id, alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rows[0];

        const edited = await run(`mutation($o: ID!, $id: String!, $r: GroupOrderRowInput!) { updateGroupOrderRow(orderId: $o, rowId: $id, row: $r) { ${MINE} } }`,
            { o: order.id, id: card.rowId, r: { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 3 } }, alice);
        expect(edited.updateGroupOrderRow.rows).toEqual([expect.objectContaining({ rowId: card.rowId, artist: 'Rebecca Guay', quantity: 3 })]);

        await setStatus(order.id, 'closed');
        await expect(run(`mutation($o: ID!, $id: String!) { deleteGroupOrderRow(orderId: $o, rowId: $id) { id } }`,
            { o: order.id, id: card.rowId }, alice)).rejects.toThrow("isn't taking card changes");
    });

    it('only lets approved participants add cards', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        await join(order.inviteToken, bob);
        await expect(addCard(order.id, bob, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 })).rejects.toThrow('Only approved participants');
    });

    it('lets the organizer add cards for a guest, even after the cutoff', async () => {
        const { order } = await openOrderWithAlice();
        const withGuest = (await run(`mutation($o: ID!) { addGroupOrderGuest(orderId: $o, displayName: "Sam", discordName: "sam.hands") { ${ORDER} } }`,
            { o: order.id }, organizer)).addGroupOrderGuest;
        const guest = withGuest.participants.find((p: any) => p.isGuest);
        await setStatus(order.id, 'closed');

        const view = (await run(`mutation($p: ID!, $r: GroupOrderRowInput!) { organizerAddGroupOrderRow(participantId: $p, row: $r) { ${ORDER} } }`,
            { p: guest.id, r: { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 2 } }, organizer)).organizerAddGroupOrderRow;
        expect(view.rows).toEqual([expect.objectContaining({ participantId: guest.id, owner: 'sam.hands', quantity: 2 })]);
        expect(view.participants.find((p: any) => p.id === guest.id)).toMatchObject({ cardCount: 2, balance: { due: 8 } });
    });

    it("blocks removing a cell that has cards, and frees slots when someone leaves", async () => {
        const { order } = await openOrderWithAlice();
        await addCard(order.id, alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2 });
        const withoutGuay = settings({ artists: [settings().artists[1]] });
        await expect(run(`mutation($o: ID!, $s: GroupOrderSettingsInput!) { updateGroupOrder(orderId: $o, name: "IX run", settings: $s) { id } }`,
            { o: order.id, s: withoutGuay }, organizer)).rejects.toThrow('still has cards');

        await run(`mutation($o: ID!) { leaveGroupOrder(orderId: $o) { success } }`, { o: order.id }, alice);
        expect((await organizerView(order.id)).artists[0]).toMatchObject({ used: 0, remaining: 3 });
    });
});

describe('Signing Tracker', () => {
    it("keeps group orders out of the private batch list and its whole-batch save", async () => {
        const order = await createOrder();
        const batches = (await run(`query { signingBatches { batchId } }`, {}, organizer)).signingBatches;
        expect(batches).toEqual([]);

        const { batchId } = (await SigningBatch.findById(order.id).lean())!;
        await expect(run(`mutation($b: String!) { saveSigningBatch(batchId: $b, name: "x", createdAt: "now", rows: []) { batchId } }`,
            { b: batchId }, organizer)).rejects.toThrow("can't be saved from the Signing Tracker");
        await run(`mutation($b: String!) { deleteSigningBatch(batchId: $b) { success } }`, { b: batchId }, organizer);
        expect(await SigningBatch.exists({ _id: order.id })).toBeTruthy();
    });
});
