import {
    cleanSignatureLabel,
    legacySignatureExample,
    listSignatureExamples,
    MAX_SIGNATURE_LABEL_LENGTH,
    reorderSignatureExamples,
} from './signatureExamples';

const CDN = 'https://cdn.example';

describe('cleanSignatureLabel', () => {
    it('trims and collapses whitespace', () => {
        expect(cleanSignatureLabel('  Shadow   signature ')).toBe('Shadow signature');
    });

    it.each([undefined, null, '', '   '])('rejects a blank label (%p)', (raw) => {
        expect(() => cleanSignatureLabel(raw)).toThrow(/label/);
    });

    it('rejects labels that are too long', () => {
        expect(() => cleanSignatureLabel('x'.repeat(MAX_SIGNATURE_LABEL_LENGTH + 1))).toThrow(/characters or fewer/);
        expect(cleanSignatureLabel('x'.repeat(MAX_SIGNATURE_LABEL_LENGTH))).toHaveLength(MAX_SIGNATURE_LABEL_LENGTH);
    });
});

describe('listSignatureExamples', () => {
    it('returns stored examples in display order', () => {
        const artist = {
            haveSignature: 'true',
            filename: 'guay',
            signatureExamples: [
                { _id: 'b', imageUrl: `${CDN}/b.jpg`, label: 'Sketch', order: 1 },
                { _id: 'a', imageUrl: `${CDN}/a.jpg`, label: 'Regular', order: 0 },
            ],
        };
        expect(listSignatureExamples(artist, CDN)).toEqual([
            { id: 'a', imageUrl: `${CDN}/a.jpg`, label: 'Regular' },
            { id: 'b', imageUrl: `${CDN}/b.jpg`, label: 'Sketch' },
        ]);
    });

    it('falls back to the legacy single image', () => {
        expect(listSignatureExamples({ haveSignature: 'true', filename: 'guay', signatureExamples: [] }, CDN)).toEqual([
            { id: 'legacy-guay', imageUrl: `${CDN}/signatures/guay.jpg`, label: 'Signature' },
        ]);
    });

    it('is empty when the artist has no signature image', () => {
        expect(listSignatureExamples({ haveSignature: 'false', filename: 'guay' }, CDN)).toEqual([]);
        expect(listSignatureExamples({ haveSignature: 'true' }, CDN)).toEqual([]);
    });
});

describe('legacySignatureExample', () => {
    it('describes the old image so it can be saved as the first example', () => {
        expect(legacySignatureExample({ haveSignature: 'true', filename: 'guay' }, CDN)).toEqual({
            imageUrl: `${CDN}/signatures/guay.jpg`, key: 'signatures/guay.jpg', label: 'Signature', order: 0,
        });
    });

    it('is null once the artist has examples', () => {
        const artist = { haveSignature: 'true', filename: 'guay', signatureExamples: [{ _id: 'a', imageUrl: 'x', label: 'Sketch' }] };
        expect(legacySignatureExample(artist, CDN)).toBeNull();
    });
});

describe('reorderSignatureExamples', () => {
    it('maps each id to its new position', () => {
        expect([...reorderSignatureExamples(['a', 'b', 'c'], ['c', 'a', 'b'])]).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    });

    it.each([
        [['a', 'b']],
        [['a', 'b', 'c', 'd']],
        [['a', 'a', 'b']],
        [['a', 'b', 'x']],
    ])('rejects %p when the stored ids are a, b, c', (requested) => {
        expect(() => reorderSignatureExamples(['a', 'b', 'c'], requested)).toThrow(/changed/);
    });
});
