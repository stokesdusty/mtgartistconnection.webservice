import { diffArtistProfile, hasArtistAccess, MAX_NOTE_LENGTH, validateArtistProfileUpdate } from './artistProfile';

describe('validateArtistProfileUpdate', () => {
    it('only returns fields that were sent', () => {
        expect(validateArtistProfileUpdate({ location: ' Seattle, WA ' })).toEqual({ location: 'Seattle, WA' });
    });

    it('ignores fields artists are not allowed to edit', () => {
        const clean = validateArtistProfileUpdate({ location: 'Ohio', name: 'Someone Else', signingComment: 'x' } as any);
        expect(clean).toEqual({ location: 'Ohio' });
    });

    it('adds https:// to links without a scheme', () => {
        expect(validateArtistProfileUpdate({ instagram: 'instagram.com/artist' }).instagram).toBe('https://instagram.com/artist');
    });

    it.each([
        ['instagram', 'https://www.instagram.com/artist'],
        ['twitter', 'https://x.com/artist'],
        ['bluesky', 'https://bsky.app/profile/artist.bsky.social'],
        ['youtube', 'https://youtu.be/abc'],
        ['url', 'https://my-portfolio.art'],
    ] as const)('accepts %s link %s', (field, url) => {
        expect(validateArtistProfileUpdate({ [field]: url })[field]).toBe(url);
    });

    it.each([
        ['instagram', 'https://evil.example/instagram.com'],
        ['instagram', 'https://notinstagram.com/artist'],
        ['url', 'javascript:alert(1)'],
        ['url', 'ftp://files.example.com'],
    ] as const)('rejects %s link %s', (field, url) => {
        expect(() => validateArtistProfileUpdate({ [field]: url })).toThrow();
    });

    it('clears a field when blank or null', () => {
        expect(validateArtistProfileUpdate({ twitter: '  ', patreon: null })).toEqual({ twitter: '', patreon: '' });
    });

    it('only accepts true/false for yes/no fields and treats blank as false', () => {
        expect(validateArtistProfileUpdate({ signing: 'true', artistProofs: '' })).toEqual({ signing: 'true', artistProofs: 'false' });
        expect(() => validateArtistProfileUpdate({ signing: 'maybe' })).toThrow();
    });

    it('validates the contact email', () => {
        expect(validateArtistProfileUpdate({ email: 'me@art.com' }).email).toBe('me@art.com');
        expect(() => validateArtistProfileUpdate({ email: 'not-an-email' })).toThrow('Enter a valid contact email.');
    });

    it('tidies the note and enforces its length', () => {
        expect(validateArtistProfileUpdate({ artistNote: '  Hi!  \r\n\r\n\r\n\r\nSigning at GP  ' }).artistNote).toBe('Hi!\n\nSigning at GP');
        expect(() => validateArtistProfileUpdate({ artistNote: 'a'.repeat(MAX_NOTE_LENGTH + 1) })).toThrow();
    });
});

describe('diffArtistProfile', () => {
    it('returns only fields whose value changed, treating missing as blank', () => {
        const current = { location: 'Ohio', twitter: undefined, signing: 'true' };
        expect(diffArtistProfile(current, { location: 'Ohio', twitter: '', signing: 'false', artistNote: 'Hello' })).toEqual([
            { field: 'signing', before: 'true', after: 'false' },
            { field: 'artistNote', before: '', after: 'Hello' },
        ]);
    });
});

describe('hasArtistAccess', () => {
    const artistId = '64b000000000000000000001';

    it('allows a verified user linked to that artist', () => {
        expect(hasArtistAccess({ isVerifiedArtist: true, artistId }, artistId)).toBe(true);
    });

    it.each([
        ['not verified', { isVerifiedArtist: false, artistId }],
        ['no artist linked', { isVerifiedArtist: true }],
        ['a different artist', { isVerifiedArtist: true, artistId: '64b000000000000000000002' }],
        ['no user', null],
    ])('denies %s', (_label, user) => {
        expect(hasArtistAccess(user as any, artistId)).toBe(false);
    });
});
