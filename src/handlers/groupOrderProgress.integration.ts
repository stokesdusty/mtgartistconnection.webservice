import SigningBatch from '../models/SigningBatch';
import { addCard, createOrder, join, myView, openOrderWithAlice, run, setStatus, users, useTestDatabase } from './groupOrderTestHarness';

// Payments, shipping and check-in, custom items and event day, against a real MongoDB.

useTestDatabase();

const PEOPLE = `participants { id status notesToOrganizer receivedAt mismatchCount returnTracking emailOptOut
    payments { id amount source confirmedAt } customItems { id label quantity price status }
    balance { due confirmedPaid reportedPaid remaining status pendingCount } }
    rows { rowId status notSignedReason receivedQuantity quantity }`;
const ME = `me { id readyToShipAt sheetChanged inboundTracking returnOptionId notesToOrganizer emailOptOut
    payments { id amount source confirmedAt } balance { due confirmedPaid reportedPaid remaining status returnShipping } }
    rows { rowId artist quantity status }`;

const asAlice = (source: string, variables: Record<string, unknown>) => run(source, variables, users.alice);
const asRunner = (source: string, variables: Record<string, unknown>) => run(source, variables, users.organizer);
const organizerPeople = async (orderId: string) =>
    (await asRunner(`query($o: ID!) { organizedGroupOrder(orderId: $o) { id organizerEmailOptOut ${PEOPLE} } }`, { o: orderId })).organizedGroupOrder;
const person = (view: any, id: string) => view.participants.find((p: any) => p.id === id);
const myViewWithMe = async (orderId: string) =>
    (await asAlice(`query($o: ID!) { myGroupOrder(orderId: $o) { ${ME} } }`, { o: orderId })).myGroupOrder;

describe('payments', () => {
    it('takes reports, confirmations and refunds', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });  // $3 + $2 fee

        const reported = (await asAlice(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: 5, note: "venmo 123") { ${ME} } }`, { o: order.id })).reportGroupOrderPayment;
        expect(reported.me.balance).toMatchObject({ due: 5, reportedPaid: 5, confirmedPaid: 0, status: 'unpaid' });
        const paymentId = reported.me.payments[0].id;

        const confirmed = (await asRunner(`mutation($p: ID!, $id: String!) { confirmGroupOrderPayment(participantId: $p, paymentId: $id) { ${PEOPLE} } }`,
            { p: aliceId, id: paymentId })).confirmGroupOrderPayment;
        expect(person(confirmed, aliceId).balance).toMatchObject({ confirmedPaid: 5, status: 'paid' });
        await expect(asAlice(`mutation($o: ID!, $id: String!) { withdrawGroupOrderPayment(orderId: $o, paymentId: $id) { id } }`,
            { o: order.id, id: paymentId })).rejects.toThrow("hasn't confirmed");

        const refunded = (await asRunner(`mutation($p: ID!) { recordGroupOrderPayment(participantId: $p, amount: -2, note: "fee waived") { ${PEOPLE} } }`,
            { p: aliceId })).recordGroupOrderPayment;
        expect(person(refunded, aliceId).balance).toMatchObject({ confirmedPaid: 3, remaining: 2, status: 'partial' });
        await expect(asAlice(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: -1) { id } }`, { o: order.id })).rejects.toThrow('amount you sent');
    });

    it('lets participants withdraw an unconfirmed report, and keeps requests out', async () => {
        const { order } = await openOrderWithAlice();
        const reported = (await asAlice(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: 4) { ${ME} } }`, { o: order.id })).reportGroupOrderPayment;
        const withdrawn = (await asAlice(`mutation($o: ID!, $id: String!) { withdrawGroupOrderPayment(orderId: $o, paymentId: $id) { ${ME} } }`,
            { o: order.id, id: reported.me.payments[0].id })).withdrawGroupOrderPayment;
        expect(withdrawn.me.payments).toEqual([]);

        await join(order.inviteToken, users.bob);
        await expect(run(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: 4) { id } }`, { o: order.id }, users.bob)).rejects.toThrow('Only approved participants');
    });

    it('lets the organizer remove a payment that never arrived', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        const reported = (await asAlice(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: 4) { ${ME} } }`, { o: order.id })).reportGroupOrderPayment;
        const removed = (await asRunner(`mutation($p: ID!, $id: String!) { removeGroupOrderPayment(participantId: $p, paymentId: $id) { ${PEOPLE} } }`,
            { p: aliceId, id: reported.me.payments[0].id })).removeGroupOrderPayment;
        expect(person(removed, aliceId).payments).toEqual([]);
    });
});

describe('shipping and check-in', () => {
    const READY = `mutation($o: ID!) { markGroupOrderReadyToShip(orderId: $o) { ${ME} } }`;
    const CHECK_IN = `mutation($p: ID!, $c: [GroupOrderCheckInInput!]!) { checkInGroupOrderPackage(participantId: $p, counts: $c) { ${PEOPLE} } }`;

    it('marks ready to ship, and flags the sheet when cards change afterwards', async () => {
        const { order } = await openOrderWithAlice();
        await expect(asAlice(READY, { o: order.id })).rejects.toThrow('Add your cards');

        await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
        const first = (await asAlice(READY, { o: order.id })).markGroupOrderReadyToShip.me;
        expect(first.sheetChanged).toBe(false);
        expect(first.readyToShipAt).toBeTruthy();

        await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 2 });
        expect((await myViewWithMe(order.id)).me.sheetChanged).toBe(true);
        const reprinted = (await asAlice(READY, { o: order.id })).markGroupOrderReadyToShip.me;
        expect(reprinted).toMatchObject({ sheetChanged: false, readyToShipAt: first.readyToShipAt });
    });

    it('records tracking and return shipping, which joins the balance', async () => {
        const { order } = await openOrderWithAlice({ returnOptions: [{ id: 'pwe', label: 'Plain envelope', price: 1 }] });
        await asAlice(`mutation($o: ID!) { setGroupOrderInboundTracking(orderId: $o, tracking: " 9400 1111 ") { id } }`, { o: order.id });
        await expect(asAlice(`mutation($o: ID!) { setGroupOrderReturnOption(orderId: $o, returnOptionId: "nope") { id } }`, { o: order.id }))
            .rejects.toThrow("isn't offered");
        const view = (await asAlice(`mutation($o: ID!) { setGroupOrderReturnOption(orderId: $o, returnOptionId: "pwe") { ${ME} } }`, { o: order.id })).setGroupOrderReturnOption;
        expect(view.me).toMatchObject({ inboundTracking: '9400 1111', returnOptionId: 'pwe', balance: { returnShipping: 1, due: 3 } });
    });

    it('checks packages in with counts, flags mismatches, and then keeps them from leaving', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        const card = (await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 2 })).rows[0];

        const view = (await asRunner(CHECK_IN, { p: aliceId, c: [{ rowId: card.rowId, receivedQuantity: 1 }] })).checkInGroupOrderPackage;
        expect(person(view, aliceId).mismatchCount).toBe(1);
        expect(person(view, aliceId).receivedAt).toBeTruthy();
        expect(view.rows[0]).toMatchObject({ receivedQuantity: 1, quantity: 2 });

        const recount = (await asRunner(CHECK_IN, { p: aliceId, c: [{ rowId: card.rowId, receivedQuantity: 2 }] })).checkInGroupOrderPackage;
        expect(person(recount, aliceId).mismatchCount).toBe(0);

        const left = await asAlice(`mutation($o: ID!) { leaveGroupOrder(orderId: $o) { success message } }`, { o: order.id });
        expect(left.leaveGroupOrder.success).toBe(false);
        await expect(asRunner(CHECK_IN, { p: aliceId, c: [{ rowId: 'someone-else', receivedQuantity: 1 }] })).rejects.toThrow("isn't in their order");
    });

    it('adds return tracking once the event starts', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        const track = `mutation($p: ID!) { setGroupOrderReturnTracking(participantId: $p, tracking: "1Z999") { ${PEOPLE} } }`;
        await expect(asRunner(track, { p: aliceId })).rejects.toThrow('once the event starts');
        await setStatus(order.id, 'closed');
        await setStatus(order.id, 'at-event');
        expect(person((await asRunner(track, { p: aliceId })).setGroupOrderReturnTracking, aliceId).returnTracking).toBe('1Z999');
    });
});

describe('custom items', () => {
    it('stays pending until priced, then counts unless unavailable', async () => {
        const { aliceId } = await openOrderWithAlice({ participantFee: 0 });
        const add = `mutation($p: ID!, $i: GroupOrderCustomItemInput!) { addGroupOrderCustomItem(participantId: $p, item: $i) { ${PEOPLE} } }`;
        const added = (await asRunner(add, { p: aliceId, i: { label: 'Bolt AP', artistName: 'Rebecca Guay', quantity: 2 } })).addGroupOrderCustomItem;
        expect(person(added, aliceId).balance).toMatchObject({ status: 'pending', pendingCount: 1 });
        const itemId = person(added, aliceId).customItems[0].id;

        const update = `mutation($p: ID!, $id: String!, $i: GroupOrderCustomItemInput!) { updateGroupOrderCustomItem(participantId: $p, itemId: $id, item: $i) { ${PEOPLE} } }`;
        const priced = (await asRunner(update, { p: aliceId, id: itemId, i: { label: 'Bolt AP', quantity: 2, price: 12.5, status: 'purchased' } })).updateGroupOrderCustomItem;
        expect(person(priced, aliceId).balance).toMatchObject({ due: 25 });

        const gone = (await asRunner(update, { p: aliceId, id: itemId, i: { label: 'Bolt AP', quantity: 2, price: 12.5, status: 'unavailable' } })).updateGroupOrderCustomItem;
        expect(person(gone, aliceId).balance).toMatchObject({ due: 0 });

        await expect(asAlice(add, { p: aliceId, i: { label: 'Sneaky', quantity: 1 } })).rejects.toThrow('Participant not found');
        const removed = (await asRunner(`mutation($p: ID!, $id: String!) { removeGroupOrderCustomItem(participantId: $p, itemId: $id) { ${PEOPLE} } }`,
            { p: aliceId, id: itemId })).removeGroupOrderCustomItem;
        expect(person(removed, aliceId).customItems).toEqual([]);
    });
});

describe('event day', () => {
    it('marks cards signed or not signed, dropping not-signed cards from the bill', async () => {
        const { order, aliceId } = await openOrderWithAlice({ participantFee: 0 });
        await addCard(order.id, users.alice, { artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2 });
        const view = await addCard(order.id, users.alice, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity: 1 });
        const guay = view.rows.find((r: any) => r.artist === 'Rebecca Guay').rowId;
        const foglio = view.rows.find((r: any) => r.artist === 'Kaja Foglio').rowId;
        await setStatus(order.id, 'closed');
        await setStatus(order.id, 'at-event');

        const mark = `mutation($o: ID!, $ids: [String!]!, $s: String!, $r: String) { setGroupOrderRowStatus(orderId: $o, rowIds: $ids, status: $s, reason: $r) { ${PEOPLE} } }`;
        await expect(asRunner(mark, { o: order.id, ids: [foglio], s: 'not-signed' })).rejects.toThrow('Say why');
        await asRunner(mark, { o: order.id, ids: [guay], s: 'signed' });
        const result = (await asRunner(mark, { o: order.id, ids: [foglio], s: 'not-signed', r: "Artist didn't show" })).setGroupOrderRowStatus;

        expect(result.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowId: guay, status: 'signed', notSignedReason: '' }),
            expect.objectContaining({ rowId: foglio, status: 'not-signed', notSignedReason: "Artist didn't show" }),
        ]));
        expect(person(result, aliceId).balance).toMatchObject({ due: 10 });
        await expect(asAlice(mark, { o: order.id, ids: [guay], s: 'collecting' })).rejects.toThrow('not found');
    });
});

describe('notes, email opt-outs and disabled orders', () => {
    it('lets people waiting for approval leave notes for the organizer', async () => {
        const order = await createOrder();
        await setStatus(order.id, 'open');
        await join(order.inviteToken, users.bob);
        await run(`mutation($o: ID!) { updateGroupOrderNotes(orderId: $o, notes: "Could you grab 2 Guay APs?") { id } }`, { o: order.id }, users.bob);
        expect((await organizerPeople(order.id)).participants[0].notesToOrganizer).toBe('Could you grab 2 Guay APs?');
    });

    it('saves email opt-outs for the organizer and participants separately', async () => {
        const { order, aliceId } = await openOrderWithAlice();
        const optOut = `mutation($o: ID!) { setGroupOrderEmailOptOut(orderId: $o, optOut: true) { success } }`;
        await asAlice(optOut, { o: order.id });
        const before = await organizerPeople(order.id);
        expect(before.organizerEmailOptOut).toBe(false);
        expect(person(before, aliceId).emailOptOut).toBe(true);
        await asRunner(optOut, { o: order.id });
        expect((await organizerPeople(order.id)).organizerEmailOptOut).toBe(true);
    });

    it('makes disabled orders read-only', async () => {
        const { order } = await openOrderWithAlice();
        await SigningBatch.updateOne({ _id: order.id }, { $set: { 'groupOrder.disabledAt': new Date() } });
        await expect(asAlice(`mutation($o: ID!) { reportGroupOrderPayment(orderId: $o, amount: 4) { id } }`, { o: order.id })).rejects.toThrow('disabled by an admin');
        expect(await myView(order.id, users.alice)).toMatchObject({ status: 'open' });
    });
});
