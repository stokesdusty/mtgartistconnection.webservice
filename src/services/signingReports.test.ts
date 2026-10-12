import {
    containsContactDetails,
    median,
    needsReview,
    rateLimitMessage,
    summarizeReports,
    validateSigningReport,
} from './signingReports';

const now = new Date('2026-10-11T12:00:00Z');
const base = { signedOn: '2026-08-15', method: 'convention', pricePerSig: 4 };

describe('containsContactDetails', () => {
    it.each([
        'email me at someone@gmail.com',
        'someone (at) gmail (dot) com',
        'call 555-123-4567',
        'text (555) 123 4567',
        'see https://example.com/prices',
        'her shop is artist.store',
        'mail to 123 Main Street',
        'PO Box 42',
    ])('flags %s', (text) => {
        expect(containsContactDetails(text)).toBe(true);
    });

    it.each([
        '$4 each, first 2 free, 10 per person',
        'signed on 2026-08-15 at the booth',
        'drove 2 hours down the road for this',
        'very kind, did a quick sketch too',
    ])('allows %s', (text) => {
        expect(containsContactDetails(text)).toBe(false);
    });
});

describe('validateSigningReport', () => {
    it('normalises a valid report', () => {
        const clean = validateSigningReport({ ...base, pricePerSig: 3.499, note: '  great  ', extras: [{ kind: 'playmat', price: 20 }] }, now);
        expect(clean).toMatchObject({ method: 'convention', pricePerSig: 3.5, note: 'great', extras: [{ kind: 'playmat', price: 20 }] });
        expect(clean.signedOn.toISOString().slice(0, 10)).toBe('2026-08-15');
    });

    it('drops fields that do not apply to the method', () => {
        const clean = validateSigningReport({ ...base, turnaroundWeeks: 4, serviceName: 'X' }, now);
        expect(clean.turnaroundWeeks).toBeUndefined();
        expect(clean.serviceName).toBeUndefined();

        const mail = validateSigningReport({ ...base, method: 'mail_in', turnaroundWeeks: 4, eventId: 'abc' }, now);
        expect(mail.turnaroundWeeks).toBe(4);
        expect(mail.eventId).toBeUndefined();
    });

    it('treats a blank note as no note', () => {
        expect(validateSigningReport({ ...base, note: '   ' }, now).note).toBeUndefined();
    });

    it.each([
        [{ method: 'carrier_pigeon' }, 'Pick how'],
        [{ signedOn: 'nope' }, 'date'],
        [{ signedOn: '2026-12-01' }, 'future'],
        [{ signedOn: '2020-01-01' }, 'last 5 years'],
        [{ pricePerSig: -1 }, 'between'],
        [{ pricePerSig: 501 }, 'between'],
        [{ freeCount: 1.5 }, 'whole number'],
        [{ extras: [{ kind: 'tattoo', price: 1 }] }, 'Unknown extra'],
        [{ extras: [{ kind: 'sketch', price: 1 }, { kind: 'sketch', price: 2 }] }, 'only once'],
        [{ note: 'x'.repeat(281) }, '280'],
        [{ note: 'reach them at a@b.com' }, 'Contact info'],
    ])('rejects %j', (override, message) => {
        expect(() => validateSigningReport({ ...base, ...override } as any, now)).toThrow(message);
    });
});

describe('rateLimitMessage', () => {
    it('enforces the daily cap and per-artist cooldown', () => {
        expect(rateLimitMessage(0, 0)).toBeNull();
        expect(rateLimitMessage(5, 0)).toMatch('5 reports a day');
        expect(rateLimitMessage(1, 1)).toMatch('last 7 days');
    });
});

describe('median', () => {
    it('handles empty, odd and even lists', () => {
        expect(median([])).toBeNull();
        expect(median([5, 1, 3])).toBe(3);
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
});

describe('needsReview', () => {
    it('reviews notes and new reporters', () => {
        expect(needsReview({ pricePerSig: 4, note: 'hi' }, 10, 4)).toBe(true);
        expect(needsReview({ pricePerSig: 4 }, 2, 4)).toBe(true);
    });

    it('lets trusted reporters through unless the price is an outlier', () => {
        expect(needsReview({ pricePerSig: 5 }, 3, 4)).toBe(false);
        expect(needsReview({ pricePerSig: 13 }, 3, 4)).toBe(true);
        expect(needsReview({ pricePerSig: 1 }, 3, 4)).toBe(true);
        expect(needsReview({ pricePerSig: 5 }, 3, null)).toBe(false);
        expect(needsReview({ pricePerSig: 2 }, 3, 0)).toBe(true);
        expect(needsReview({ pricePerSig: 0 }, 3, 0)).toBe(false);
    });
});

describe('summarizeReports', () => {
    it('summarises recent reports and ignores ones outside the window', () => {
        const summary = summarizeReports([
            { signedOn: new Date('2026-08-01'), method: 'convention', pricePerSig: 3 },
            { signedOn: new Date('2026-06-01'), method: 'convention', pricePerSig: 5 },
            { signedOn: new Date('2026-09-01'), method: 'mail_in', pricePerSig: 10 },
            { signedOn: new Date('2023-01-01'), method: 'convention', pricePerSig: 1 },
        ], now);

        expect(summary).toEqual({
            count: 3,
            medianPrice: 5,
            minPrice: 3,
            maxPrice: 10,
            latestSignedOn: new Date('2026-09-01').toISOString(),
            byMethod: [
                { method: 'convention', count: 2, medianPrice: 4 },
                { method: 'mail_in', count: 1, medianPrice: 10 },
            ],
        });
    });

    it('returns an empty summary when there are no reports', () => {
        expect(summarizeReports([], now)).toEqual({
            count: 0, medianPrice: null, minPrice: null, maxPrice: null, latestSignedOn: null, byMethod: [],
        });
    });
});
