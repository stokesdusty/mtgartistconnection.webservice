import {
    artistSlots,
    assertOrderTransition,
    assertStatusChange,
    canLeave,
    cardLimitError,
    changedPrices,
    cleanText,
    effectiveOrderStatus,
    GroupOrder,
    gridCell,
    isPaymentDue,
    joinError,
    newInviteToken,
    normalizeDiscordName,
    organizerCan,
    OrderRow,
    participantBalance,
    participantCan,
    publicOrderSummary,
    settingsChangeError,
    sheetSignature,
    validateCheckInCounts,
    validateCustomItem,
    validateGroupOrderRow,
    validateGroupOrderSettings,
    validatePaymentAmount,
    validateRowOutcome,
} from './groupOrders';

// Guay: $5 sig, $15 doodle, sketch TBD. Foglio: $3 sig, no doodle, $40 sketch.
const order: GroupOrder = {
    status: 'open',
    signatureTypes: [{ id: 'sig', label: 'Signature' }, { id: 'doodle', label: 'Sig + doodle' }, { id: 'sketch', label: 'Sketch' }],
    artists: [
        { name: 'Rebecca Guay', cap: 10, prices: [{ signatureTypeId: 'sig', price: 5 }, { signatureTypeId: 'doodle', price: 15 }, { signatureTypeId: 'sketch', price: null }] },
        { name: 'Kaja Foglio', cap: null, prices: [{ signatureTypeId: 'sig', price: 3 }, { signatureTypeId: 'sketch', price: 40 }] },
    ],
    participantFee: 2,
    returnOptions: [{ id: 'pwe', label: 'Plain envelope', price: 1 }, { id: 'bmwt', label: 'Bubble mailer', price: 5 }],
    cutoff: null,
    maxCardsPerParticipant: 20,
    paymentTiming: 'upfront',
    publicTerms: 'Cards back within 3 weeks of the show.',
    privateInstructions: 'Ship to 123 Main Street. Venmo @runner.',
    organizerDiscordName: 'runner',
};

let rowSeq = 0;
const row = (participantId: string, artist: string, signatureTypeId: string, quantity = 1, status = 'collecting'): OrderRow =>
    ({ rowId: `r${++rowSeq}`, participantId, artist, signatureTypeId, quantity, status });

const participant = (id: string, extra: Partial<Parameters<typeof participantBalance>[2]> = {}) =>
    ({ id, payments: [], customItems: [], returnOptionId: null, ...extra });

describe('normalizeDiscordName', () => {
    it('accepts current usernames, lowercasing and dropping a leading @', () => {
        expect(normalizeDiscordName('  @Card.Runner_99 ')).toBe('card.runner_99');
    });

    it('accepts legacy name#1234 names as typed', () => {
        expect(normalizeDiscordName('Card Runner#0420')).toBe('Card Runner#0420');
    });

    it('treats blank as no name', () => {
        expect(normalizeDiscordName('  ')).toBe('');
        expect(normalizeDiscordName(null)).toBe('');
    });

    it.each(['a', 'x'.repeat(33), 'has space', 'two..dots', 'emoji🙂'])('rejects %s', (name) => {
        expect(() => normalizeDiscordName(name)).toThrow(/Discord names/);
    });
});

describe('order lifecycle', () => {
    it('moves forward through the stages', () => {
        expect(() => assertOrderTransition('draft', 'open')).not.toThrow();
        expect(() => assertOrderTransition('closed', 'at-event')).not.toThrow();
        expect(() => assertOrderTransition('returning', 'complete')).not.toThrow();
    });

    it('can reopen a closed order, and cancel only before the event', () => {
        expect(() => assertOrderTransition('closed', 'open')).not.toThrow();
        expect(() => assertOrderTransition('open', 'cancelled')).not.toThrow();
        expect(() => assertOrderTransition('at-event', 'cancelled')).toThrow("can't go from at-event to cancelled");
    });

    it('rejects skipping stages and leaving final states', () => {
        expect(() => assertOrderTransition('draft', 'at-event')).toThrow();
        expect(() => assertOrderTransition('complete', 'open')).toThrow();
        expect(() => assertOrderTransition('cancelled', 'open')).toThrow();
    });

    it('limits participant actions by stage', () => {
        expect(participantCan('join', 'draft')).toBe(false);
        expect(participantCan('join', 'open')).toBe(true);
        expect(participantCan('editCards', 'closed')).toBe(false);
        expect(participantCan('setInboundTracking', 'closed')).toBe(true);
        expect(participantCan('reportPayment', 'complete')).toBe(true);
        expect(participantCan('reportPayment', 'cancelled')).toBe(false);
    });

    it('lets participants leave only until their package arrives', () => {
        expect(canLeave({ status: 'approved', receivedAt: null })).toBe(true);
        expect(canLeave({ status: 'requested', receivedAt: null })).toBe(true);
        expect(canLeave({ status: 'approved', receivedAt: new Date() })).toBe(false);
        expect(canLeave({ status: 'removed', receivedAt: null })).toBe(false);
    });
});

describe('cutoff', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const passed = { status: 'open' as const, cutoff: new Date('2026-11-01T00:00:00Z') };

    it('treats an open order as closed once the cutoff passes', () => {
        expect(effectiveOrderStatus(passed, now)).toBe('closed');
        expect(effectiveOrderStatus({ ...passed, cutoff: new Date('2026-11-05T00:00:00Z') }, now)).toBe('open');
        expect(effectiveOrderStatus({ ...passed, cutoff: null }, now)).toBe('open');
        expect(effectiveOrderStatus({ ...passed, status: 'at-event' }, now)).toBe('at-event');
    });

    it('moves on from the effective status, and only reopens with a later cutoff', () => {
        expect(() => assertStatusChange(passed, 'at-event', now)).not.toThrow();
        expect(() => assertStatusChange(passed, 'open', now)).toThrow('Move it later to reopen');
        expect(() => assertStatusChange({ status: 'closed', cutoff: null }, 'open', now)).not.toThrow();
    });
});

describe('isPaymentDue', () => {
    it('is due from the start for upfront orders', () => {
        expect(isPaymentDue('upfront', 'draft')).toBe(false);
        expect(isPaymentDue('upfront', 'open')).toBe(true);
        expect(isPaymentDue('upfront', 'at-event')).toBe(true);
    });

    it('is due once cards head back for after-signing orders', () => {
        expect(isPaymentDue('after-signing', 'closed')).toBe(false);
        expect(isPaymentDue('after-signing', 'at-event')).toBe(false);
        expect(isPaymentDue('after-signing', 'returning')).toBe(true);
        expect(isPaymentDue('after-signing', 'cancelled')).toBe(false);
    });
});

describe('joinError', () => {
    const open = { status: 'open' as const, cutoff: null };

    it('lets new people and people who left ask to join an open order', () => {
        expect(joinError(open, false, null)).toBeNull();
        expect(joinError(open, false, { status: 'left' })).toBeNull();
    });

    it('turns away the organizer, existing members and people turned down', () => {
        expect(joinError(open, true, null)).toMatch('organizer');
        expect(joinError(open, false, { status: 'requested' })).toMatch('already asked');
        expect(joinError(open, false, { status: 'approved' })).toMatch('already in');
        expect(joinError(open, false, { status: 'declined' })).toMatch("hasn't approved");
        expect(joinError(open, false, { status: 'removed' })).toMatch("hasn't approved");
    });

    it('only takes requests while the order is open', () => {
        expect(joinError({ status: 'draft', cutoff: null }, false, null)).toMatch("isn't taking");
        expect(joinError({ status: 'open', cutoff: new Date('2026-01-01') }, false, null, new Date('2026-02-01'))).toMatch("isn't taking");
    });
});

describe('settingsChangeError', () => {
    const rows = [row('p1', 'Rebecca Guay', 'doodle')];

    it('allows changes that keep every card in an offered cell', () => {
        const repriced = { artists: [{ ...order.artists[0], prices: [{ signatureTypeId: 'doodle', price: 20 }] }] };
        expect(settingsChangeError(order, repriced, rows)).toBeNull();
    });

    it('blocks removing an artist or a signature type that still has cards', () => {
        expect(settingsChangeError(order, { artists: [order.artists[1]] }, rows)).toBe("Rebecca Guay still has cards in this order, so they can't be removed yet.");
        const noDoodle = { artists: [{ ...order.artists[0], prices: [{ signatureTypeId: 'sig', price: 5 }] }] };
        expect(settingsChangeError(order, noDoodle, rows)).toMatch('still has Sig + doodle cards');
    });
});

describe('gridCell', () => {
    it('finds priced, TBD and not-offered cells', () => {
        expect(gridCell(order, 'Rebecca Guay', 'doodle')).toEqual({ offered: true, price: 15 });
        expect(gridCell(order, 'Rebecca Guay', 'sketch')).toEqual({ offered: true, price: null });
        expect(gridCell(order, 'Kaja Foglio', 'doodle')).toEqual({ offered: false });
        expect(gridCell(order, 'Someone Else', 'sig')).toEqual({ offered: false });
    });
});

describe('changedPrices', () => {
    it('reports filled-in TBD cells and price changes only', () => {
        const after = {
            artists: [
                { ...order.artists[0], prices: [{ signatureTypeId: 'sig', price: 5 }, { signatureTypeId: 'doodle', price: 12 }, { signatureTypeId: 'sketch', price: 60 }] },
                // A newly offered cell isn't a price change.
                { ...order.artists[1], prices: [...order.artists[1].prices, { signatureTypeId: 'doodle', price: 8 }] },
            ],
        };
        expect(changedPrices(order, after)).toEqual([
            { artist: 'Rebecca Guay', signatureTypeId: 'doodle', from: 15, to: 12 },
            { artist: 'Rebecca Guay', signatureTypeId: 'sketch', from: null, to: 60 },
        ]);
    });
});

describe('participantBalance', () => {
    it('adds cards from the grid, custom items, the fee and return shipping', () => {
        const rows = [row('p1', 'Rebecca Guay', 'sig', 3), row('p1', 'Kaja Foglio', 'sketch'), row('p2', 'Rebecca Guay', 'doodle', 4)];
        const balance = participantBalance(order, rows, participant('p1', {
            customItems: [{ quantity: 2, price: 7.5, status: 'purchased' }],
            returnOptionId: 'bmwt',
        }));
        expect(balance).toMatchObject({ cardsTotal: 55, customItemsTotal: 15, fee: 2, returnShipping: 5, due: 77, remaining: 77, status: 'unpaid' });
    });

    it('is pending while a card sits in a TBD cell or an item is unpriced', () => {
        const tbd = participantBalance(order, [row('p1', 'Rebecca Guay', 'sig'), row('p1', 'Rebecca Guay', 'sketch')], participant('p1'));
        expect(tbd).toMatchObject({ due: null, remaining: null, pendingCount: 1, status: 'pending', cardsTotal: 5 });

        const item = participantBalance(order, [], participant('p1', { customItems: [{ quantity: 1, price: null, status: 'requested' }] }));
        expect(item.status).toBe('pending');
    });

    it('treats a card whose cell was removed as pending, not free', () => {
        expect(participantBalance(order, [row('p1', 'Kaja Foglio', 'doodle')], participant('p1')).status).toBe('pending');
    });

    it('drops not-signed cards and unavailable items, leaving a refund when already paid', () => {
        const rows = [row('p1', 'Rebecca Guay', 'doodle', 2), row('p1', 'Rebecca Guay', 'doodle', 1, 'not-signed')];
        const balance = participantBalance(order, rows, participant('p1', {
            customItems: [{ quantity: 1, price: 30, status: 'unavailable' }],
            payments: [{ amount: 47, confirmedAt: new Date() }],
        }));
        expect(balance).toMatchObject({ due: 32, confirmedPaid: 47, remaining: -15, status: 'overpaid' });
    });

    it('only counts confirmed payments toward the balance', () => {
        const rows = [row('p1', 'Rebecca Guay', 'sig', 2)];
        const balance = participantBalance(order, rows, participant('p1', {
            payments: [{ amount: 5, confirmedAt: new Date() }, { amount: 7, confirmedAt: null }],
        }));
        expect(balance).toMatchObject({ due: 12, confirmedPaid: 5, reportedPaid: 7, remaining: 7, status: 'partial' });

        const paid = participantBalance(order, rows, participant('p1', { payments: [{ amount: 12, confirmedAt: new Date() }] }));
        expect(paid.status).toBe('paid');
    });

    it('adds money in cents, without float drift', () => {
        const cents = { ...order, artists: [{ name: 'A', cap: null, prices: [{ signatureTypeId: 'sig', price: 0.1 }] }], participantFee: 0.2 };
        expect(participantBalance(cents, [row('p1', 'A', 'sig')], participant('p1')).due).toBe(0.3);
    });

    it('matches ObjectId-like participant ids by value', () => {
        const id = { toString: () => 'abc123' };
        const rows = [{ ...row('x', 'Rebecca Guay', 'sig'), participantId: { toString: () => 'abc123' } }];
        expect(participantBalance(order, rows, participant('x', { id })).cardsTotal).toBe(5);
    });
});

describe('artistSlots', () => {
    it('counts cards per artist against the cap, ignoring not-signed cards', () => {
        const rows = [row('p1', 'Rebecca Guay', 'sig', 6), row('p2', 'Rebecca Guay', 'doodle', 3), row('p2', 'Rebecca Guay', 'sig', 5, 'not-signed'), row('p1', 'Kaja Foglio', 'sig', 4)];
        expect(artistSlots(order, rows)).toEqual([
            { name: 'Rebecca Guay', cap: 10, used: 9, remaining: 1 },
            { name: 'Kaja Foglio', cap: null, used: 4, remaining: null },
        ]);
    });
});

describe('cardLimitError', () => {
    const before = [row('p1', 'Rebecca Guay', 'sig', 6), row('p2', 'Rebecca Guay', 'sig', 3)];

    it('allows adding up to the artist cap', () => {
        expect(cardLimitError(order, before, [...before, row('p2', 'Rebecca Guay', 'doodle', 1)], 'p2')).toBeNull();
    });

    it('blocks going over the artist cap, saying how many are left', () => {
        expect(cardLimitError(order, before, [...before, row('p2', 'Rebecca Guay', 'sig', 2)], 'p2')).toBe('Only 1 more card can go to Rebecca Guay.');
        const full = [...before, row('p3', 'Rebecca Guay', 'sig', 1)];
        expect(cardLimitError(order, full, [...full, row('p2', 'Rebecca Guay', 'sig', 1)], 'p2')).toBe('Rebecca Guay is full for this order.');
    });

    it('blocks going over the per-person maximum', () => {
        const mine = [row('p1', 'Kaja Foglio', 'sig', 19)];
        expect(cardLimitError(order, mine, [...mine, row('p1', 'Kaja Foglio', 'sig', 2)], 'p1')).toBe('Each person can send up to 20 cards in this order.');
        // Someone else's cards don't count toward p2's maximum.
        expect(cardLimitError(order, mine, [...mine, row('p2', 'Kaja Foglio', 'sig', 2)], 'p2')).toBeNull();
    });

    it('never blocks edits that reduce cards, even after the cap was lowered', () => {
        const lowered = { ...order, artists: [{ ...order.artists[0], cap: 2 }, order.artists[1]] };
        const after = [row('p1', 'Rebecca Guay', 'sig', 5), before[1]];
        expect(cardLimitError(lowered, before, after, 'p1')).toBeNull();
    });
});

describe('validateGroupOrderRow', () => {
    it('cleans a valid card', () => {
        expect(validateGroupOrderRow(order, { artist: 'Kaja Foglio', signatureTypeId: 'sketch', quantity: 1, cardName: ' Lotus ', foil: 'foil' }))
            .toEqual({ cardName: 'Lotus', set: '', foil: 'foil', artist: 'Kaja Foglio', signatureTypeId: 'sketch', sigNotes: '', quantity: 1 });
    });

    it('rejects artists and signature types outside the order', () => {
        expect(() => validateGroupOrderRow(order, { artist: 'Someone Else', signatureTypeId: 'sig', quantity: 1 })).toThrow("isn't part of this order");
        expect(() => validateGroupOrderRow(order, { artist: 'Kaja Foglio', signatureTypeId: 'doodle', quantity: 1 })).toThrow("isn't offering");
    });

    it('allows cards in a TBD cell', () => {
        expect(() => validateGroupOrderRow(order, { artist: 'Rebecca Guay', signatureTypeId: 'sketch', quantity: 1 })).not.toThrow();
    });

    it.each([0, 1.5, 101])('rejects quantity %s', (quantity) => {
        expect(() => validateGroupOrderRow(order, { artist: 'Kaja Foglio', signatureTypeId: 'sig', quantity })).toThrow('Quantity');
    });
});

describe('validateGroupOrderSettings', () => {
    const input = {
        signatureTypes: [{ id: 'sig', label: ' Signature ' }, { id: 'sketch', label: 'Sketch' }],
        artists: [{ name: ' Rebecca Guay ', cap: 10, prices: [{ signatureTypeId: 'sig', price: 5.005 }, { signatureTypeId: 'sketch', price: null }] }],
        returnOptions: [{ id: 'pwe', label: 'Plain envelope', price: 1 }],
        cutoff: '2026-11-01',
        organizerDiscordName: '@Runner',
        paymentTiming: 'after-signing',
    };

    it('normalises a valid setup', () => {
        const clean = validateGroupOrderSettings(input);
        expect(clean.signatureTypes[0].label).toBe('Signature');
        expect(clean.artists[0]).toEqual({ name: 'Rebecca Guay', cap: 10, prices: [{ signatureTypeId: 'sig', price: 5.01 }, { signatureTypeId: 'sketch', price: null }] });
        expect(clean).toMatchObject({ participantFee: 0, maxCardsPerParticipant: null, paymentTiming: 'after-signing', organizerDiscordName: 'runner' });
        expect(clean.cutoff).toEqual(new Date('2026-11-01'));
    });

    it.each([
        ['at least one signature type', { signatureTypes: [] }],
        ['different name', { signatureTypes: [{ id: 'a', label: 'Sig' }, { id: 'b', label: 'sig' }] }],
        ['at least one artist', { artists: [] }],
        ['only be listed once', { artists: [input.artists[0], { name: 'rebecca guay', prices: [] }] }],
        ["isn't in this order", { artists: [{ name: 'Guay', prices: [{ signatureTypeId: 'remarque', price: 5 }] }] }],
        ["Guay's prices", { artists: [{ name: 'Guay', prices: [{ signatureTypeId: 'sig', price: -1 }] }] }],
        ["Guay's cap", { artists: [{ name: 'Guay', cap: 0, prices: [] }] }],
        ['per-person fee', { participantFee: 9999 }],
        ['valid cutoff', { cutoff: 'next week' }],
        ['when participants pay', { paymentTiming: undefined }],
        ['when participants pay', { paymentTiming: 'whenever' }],
        ['Public terms', { publicTerms: 'x'.repeat(4001) }],
    ])('rejects bad settings with "%s"', (message, override) => {
        expect(() => validateGroupOrderSettings({ ...input, ...override })).toThrow(message);
    });
});

describe('publicOrderSummary', () => {
    it('shows terms, prices and remaining slots, but nothing private', () => {
        const summary = publicOrderSummary('IX run', { ...order, eventId: 'e1' }, [row('p1', 'Rebecca Guay', 'sig', 4)]);
        expect(summary).toMatchObject({ name: 'IX run', eventId: 'e1', organizerDiscordName: 'runner', publicTerms: order.publicTerms });
        expect(summary.artists[0]).toMatchObject({ name: 'Rebecca Guay', used: 4, remaining: 6 });
        expect(JSON.stringify(summary)).not.toMatch(/Main Street|Venmo|p1/);
    });
});

describe('newInviteToken', () => {
    it('makes URL-safe, unguessable tokens', () => {
        const tokens = new Set(Array.from({ length: 50 }, newInviteToken));
        expect(tokens.size).toBe(50);
        tokens.forEach((t) => expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/));
    });
});

describe('organizerCan', () => {
    it('limits check-in, event-day marking and return tracking to the right stages', () => {
        expect(organizerCan('checkIn', 'draft')).toBe(false);
        expect(organizerCan('checkIn', 'closed')).toBe(true);
        expect(organizerCan('markRows', 'at-event')).toBe(true);
        expect(organizerCan('markRows', 'complete')).toBe(false);
        expect(organizerCan('returnTracking', 'closed')).toBe(false);
        expect(organizerCan('returnTracking', 'returning')).toBe(true);
    });

    it('keeps payments open after the end, for refunds', () => {
        expect(organizerCan('recordPayment', 'complete')).toBe(true);
        expect(organizerCan('recordPayment', 'cancelled')).toBe(true);
        expect(organizerCan('recordPayment', 'draft')).toBe(false);
    });
});

describe('validatePaymentAmount', () => {
    it('rounds to cents', () => {
        expect(validatePaymentAmount(12.345, false)).toBe(12.35);
    });

    it('only lets the organizer record refunds', () => {
        expect(validatePaymentAmount(-5, true)).toBe(-5);
        expect(() => validatePaymentAmount(-5, false)).toThrow('amount you sent');
    });

    it.each([0, NaN, 10001, -10001])('rejects %p', (amount) => {
        expect(() => validatePaymentAmount(amount, true)).toThrow('Enter an amount');
    });
});

describe('cleanText', () => {
    it('trims, and rejects text over the limit', () => {
        expect(cleanText('  hi  ', 'Note', 10)).toBe('hi');
        expect(cleanText(null, 'Note', 10)).toBe('');
        expect(() => cleanText('x'.repeat(11), 'Note', 10)).toThrow('Note is limited to 10 characters.');
    });
});

describe('validateCustomItem', () => {
    it('cleans an item, leaving the price pending when not given', () => {
        expect(validateCustomItem({ label: ' Bolt AP ', quantity: 2, artistName: 'Christopher Rush' })).toEqual({
            label: 'Bolt AP', artistName: 'Christopher Rush', quantity: 2, price: null, status: 'requested', note: '',
        });
        expect(validateCustomItem({ label: 'Print', quantity: 1, price: 25.5, status: 'purchased' })).toMatchObject({ price: 25.5, status: 'purchased' });
    });

    it.each([
        [{ label: ' ', quantity: 1 }, 'Name the item'],
        [{ label: 'AP', quantity: 0 }, 'Quantity'],
        [{ label: 'AP', quantity: 1, price: -1 }, 'Item prices'],
        [{ label: 'AP', quantity: 1, status: 'lost' }, 'Unknown item status'],
    ])('rejects %j', (input, message) => {
        expect(() => validateCustomItem(input)).toThrow(message);
    });
});

describe('validateRowOutcome', () => {
    it('needs a reason for not signed, and drops it otherwise', () => {
        expect(validateRowOutcome('not-signed', " Artist didn't show ")).toEqual({ status: 'not-signed', notSignedReason: "Artist didn't show" });
        expect(validateRowOutcome('signed', 'ignored')).toEqual({ status: 'signed', notSignedReason: '' });
        expect(() => validateRowOutcome('not-signed', '')).toThrow('Say why');
        expect(() => validateRowOutcome('lost', null)).toThrow('Unknown card status');
    });
});

describe('validateCheckInCounts', () => {
    const rows = [row('p1', 'Rebecca Guay', 'sig', 3)];

    it('takes counts for cards in the order', () => {
        expect(validateCheckInCounts(rows, [{ rowId: rows[0].rowId, receivedQuantity: 2 }])).toEqual([{ rowId: rows[0].rowId, receivedQuantity: 2 }]);
    });

    it('rejects unknown cards and bad counts', () => {
        expect(() => validateCheckInCounts(rows, [{ rowId: 'nope', receivedQuantity: 1 }])).toThrow("isn't in their order");
        expect(() => validateCheckInCounts(rows, [{ rowId: rows[0].rowId, receivedQuantity: -1 }])).toThrow('whole numbers');
    });
});

describe('sheetSignature', () => {
    it('depends on artist, type and count, not order or how cards are split', () => {
        const a = sheetSignature([row('p', 'Rebecca Guay', 'sig', 2), row('p', 'Kaja Foglio', 'sig', 1)]);
        const b = sheetSignature([row('p', 'Kaja Foglio', 'sig', 1), row('p', 'Rebecca Guay', 'sig', 1), row('p', 'Rebecca Guay', 'sig', 1)]);
        expect(a).toBe(b);
        expect(sheetSignature([row('p', 'Rebecca Guay', 'sig', 3), row('p', 'Kaja Foglio', 'sig', 1)])).not.toBe(a);
        expect(sheetSignature([row('p', 'Rebecca Guay', 'doodle', 2), row('p', 'Kaja Foglio', 'sig', 1)])).not.toBe(a);
    });
});
