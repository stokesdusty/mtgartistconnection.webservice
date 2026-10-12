// Rules for the artist dashboard: which fields a verified artist may edit on
// their own page, and how their input is cleaned before it's saved.
// name, scryfall_name, alternate_names, filename, haveSignature, signingComment
// and the signing-service flags stay admin-only.

export const MAX_NOTE_LENGTH = 1000;
export const MAX_URL_LENGTH = 300;
export const MAX_LOCATION_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Social fields only accept links to their own site so a link labelled
// "Instagram" can't point somewhere else. Subdomains (www., m.) are allowed.
const LINK_HOSTS = {
    url:        null,
    omalink:    null,
    facebook:   ['facebook.com', 'fb.com', 'fb.me'],
    instagram:  ['instagram.com'],
    twitter:    ['twitter.com', 'x.com'],
    patreon:    ['patreon.com'],
    youtube:    ['youtube.com', 'youtu.be'],
    artstation: ['artstation.com'],
    bluesky:    ['bsky.app'],
    inprnt:     ['inprnt.com'],
} as const;

type LinkField = keyof typeof LINK_HOSTS;
const LINK_FIELDS = Object.keys(LINK_HOSTS) as LinkField[];

const LINK_LABELS: Record<LinkField, string> = {
    url: 'Website',
    omalink: 'Original Magic Art link',
    facebook: 'Facebook',
    instagram: 'Instagram',
    twitter: 'Twitter / X',
    patreon: 'Patreon',
    youtube: 'YouTube',
    artstation: 'ArtStation',
    bluesky: 'Bluesky',
    inprnt: 'INPRNT link',
};

// Same "true"/"false" strings the admin edit form writes.
const YES_NO_FIELDS = ['signing', 'artistProofs'] as const;

export const ARTIST_EDITABLE_FIELDS = [
    ...LINK_FIELDS,
    ...YES_NO_FIELDS,
    'email',
    'location',
    'artistNote',
] as const;

export type ArtistEditableField = typeof ARTIST_EDITABLE_FIELDS[number];
export type ArtistProfileInput = Partial<Record<ArtistEditableField, string | null>>;
export type CleanArtistProfile = Partial<Record<ArtistEditableField, string>>;

function cleanLink(field: LinkField, raw: string): string {
    if (raw.length > MAX_URL_LENGTH) throw new Error(`${LINK_LABELS[field]} is too long.`);
    // Accept "instagram.com/name" without a scheme.
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw new Error(`${LINK_LABELS[field]} must be a valid link.`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(`${LINK_LABELS[field]} must start with https://`);
    }
    const hosts = LINK_HOSTS[field];
    const host = parsed.hostname.toLowerCase();
    if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        throw new Error(`${LINK_LABELS[field]} must be a link to ${hosts[0]}.`);
    }
    return withScheme;
}

function cleanNote(raw: string): string {
    const note = raw
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (note.length > MAX_NOTE_LENGTH) throw new Error(`Your note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
    return note;
}

/**
 * Validates a dashboard update. Fields left undefined are untouched; null or
 * blank clears the field. Throws an Error with a user-facing message.
 */
export function validateArtistProfileUpdate(input: ArtistProfileInput): CleanArtistProfile {
    const clean: CleanArtistProfile = {};
    for (const field of ARTIST_EDITABLE_FIELDS) {
        const value = input[field];
        if (value === undefined) continue;
        const raw = (value ?? '').trim();

        if (field === 'artistNote') {
            clean.artistNote = cleanNote(value ?? '');
        } else if (raw === '') {
            if ((YES_NO_FIELDS as readonly string[]).includes(field)) clean[field] = 'false';
            else clean[field] = '';
        } else if (field in LINK_HOSTS) {
            clean[field] = cleanLink(field as LinkField, raw);
        } else if ((YES_NO_FIELDS as readonly string[]).includes(field)) {
            if (raw !== 'true' && raw !== 'false') throw new Error(`Invalid value for ${field}.`);
            clean[field] = raw;
        } else if (field === 'email') {
            if (!EMAIL_REGEX.test(raw) || raw.length > MAX_EMAIL_LENGTH) throw new Error('Enter a valid contact email.');
            clean.email = raw;
        } else if (field === 'location') {
            if (raw.length > MAX_LOCATION_LENGTH) throw new Error(`Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`);
            clean.location = raw;
        }
    }
    return clean;
}

export interface ArtistProfileChange {
    field: ArtistEditableField;
    before: string;
    after: string;
}

/** The cleaned fields whose values differ from what's stored now. */
export function diffArtistProfile(current: Record<string, any>, clean: CleanArtistProfile): ArtistProfileChange[] {
    return (Object.entries(clean) as [ArtistEditableField, string][])
        .map(([field, after]) => ({ field, before: current[field] == null ? '' : String(current[field]), after }))
        .filter(({ before, after }) => before !== after);
}

export interface ArtistAccessUser {
    isVerifiedArtist?: boolean;
    artistId?: unknown;
}

/** True when this (non-admin) user has been verified by an admin as the given artist. */
export function hasArtistAccess(user: ArtistAccessUser | null | undefined, artistId: unknown): boolean {
    if (!user?.isVerifiedArtist || !user.artistId || !artistId) return false;
    return String(user.artistId) === String(artistId);
}
