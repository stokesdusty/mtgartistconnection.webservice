import { inviteView, OrderBatch, OrderParticipant, organizerView, participantView } from './groupOrderViews';

const now = new Date('2026-10-20T12:00:00Z');

const batch: OrderBatch = {
    _id: 'order1',
    name: 'IX run',
    rows: [
        { rowId: 'r1', participantId: 'alice', artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 3, status: 'collecting', cardName: 'Gaea\'s Liege' },
        { rowId: 'r2', participantId: 'bob', artist: 'Rebecca Guay', signatureTypeId: 'sig', quantity: 2, status: 'collecting', cardName: 'Bob Secret Card' },
    ],
    groupOrder: {
        status: 'open',
        eventId: 'event1',
        inviteToken: 'tok',
        signatureTypes: [{ id: 'sig', label: 'Signature' }],
        artists: [{ name: 'Rebecca Guay', cap: 10, prices: [{ signatureTypeId: 'sig', price: 5 }] }],
        participantFee: 0,
        returnOptions: [],
        cutoff: null,
        maxCardsPerParticipant: null,
        paymentTiming: 'upfront',
        publicTerms: 'Back in 3 weeks.',
        privateInstructions: 'Ship to 123 Main Street. Venmo @runner.',
        organizerDiscordName: 'runner',
    },
};

const person = (id: string, status: string, extra: Partial<OrderParticipant> = {}): OrderParticipant => ({
    _id: id, userId: `user-${id}`, status, displayName: `${id} name`, discordName: `${id}_discord`,
    payments: [], customItems: [], returnOptionId: null, ...extra,
});

const alice = person('alice', 'approved', { payments: [{ amount: 5, confirmedAt: new Date() }] });
const bob = person('bob', 'approved');

describe('participantView', () => {
    const view = participantView(batch, alice, now);

    it('shows only their own cards and balance', () => {
        expect(view.rows.map((r) => r.rowId)).toEqual(['r1']);
        expect(view.me).toMatchObject({ id: 'alice', cardCount: 3, isGuest: false });
        expect(view.me.balance).toMatchObject({ due: 15, confirmedPaid: 5, remaining: 10, status: 'partial' });
    });

    it('still counts everyone toward slots, without saying whose cards they are', () => {
        expect(view.artists[0]).toMatchObject({ used: 5, remaining: 5 });
        expect(JSON.stringify(view)).not.toMatch(/bob|Bob Secret Card|tok/);
    });

    it('shows private instructions only once approved', () => {
        expect(view.privateInstructions).toMatch('Main Street');
        expect(participantView(batch, person('carol', 'requested'), now).privateInstructions).toBeNull();
    });

    it('reports whether payment is due yet', () => {
        expect(view.paymentDue).toBe(true);
        const afterSigning = { ...batch, groupOrder: { ...batch.groupOrder, paymentTiming: 'after-signing' as const } };
        expect(participantView(afterSigning, alice, now).paymentDue).toBe(false);
    });
});

describe('inviteView', () => {
    it('shows the public summary with the viewer status, and nothing private', () => {
        const view = inviteView(batch, null, now);
        expect(view).toMatchObject({ id: 'order1', name: 'IX run', status: 'open', viewerStatus: null, organizerDiscordName: 'runner' });
        expect(JSON.stringify(view)).not.toMatch(/Main Street|alice|bob|Secret|tok/);
    });

    it('reports a passed cutoff as closed', () => {
        const passed = { ...batch, groupOrder: { ...batch.groupOrder, cutoff: new Date('2026-10-01') } };
        expect(inviteView(passed, null, now).status).toBe('closed');
    });
});

describe('organizerView', () => {
    it('includes every participant with their balance, all rows, and the invite token', () => {
        const view = organizerView(batch, [alice, bob, person('guest', 'approved', { userId: null })], now);
        expect(view).toMatchObject({ inviteToken: 'tok', savedStatus: 'open', privateInstructions: batch.groupOrder.privateInstructions });
        expect(view.rows).toHaveLength(2);
        expect(view.participants.map((p) => [p.id, p.cardCount, p.balance.due, p.isGuest])).toEqual([
            ['alice', 3, 15, false],
            ['bob', 2, 10, false],
            ['guest', 0, 0, true],
        ]);
    });
});
