// Pure helpers for the set → artists index (see jobs/setArtistSync.ts).

// Same set types the homepage "Set" filter offers.
export const MAJOR_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'starter']);

// Sets released within this window (or not yet released) are re-fetched daily,
// since previews and late printings keep adding artists.
export const RECENT_SET_WINDOW_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Artist A & Artist B" → ["Artist A", "Artist B"]. */
export const splitArtistCredit = (credit: string): string[] =>
    credit.split(' & ').map(name => name.trim()).filter(Boolean);

/** Unique artist names from a page of Scryfall cards, including both faces of DFCs. */
export const collectArtists = (cards: { artist?: string; card_faces?: { artist?: string }[] }[]): string[] => {
    const names = new Set<string>();
    for (const card of cards) {
        const credits = [card.artist, ...(card.card_faces ?? []).map(face => face.artist)];
        for (const credit of credits) {
            if (credit) splitArtistCredit(credit).forEach(name => names.add(name));
        }
    }
    return Array.from(names);
};

/** Whether a set's artist list should be (re)fetched today. */
export const shouldRefreshSet = (
    releasedAt: string | undefined,
    alreadyStored: boolean,
    now: Date = new Date(),
): boolean => {
    if (!alreadyStored) return true;
    if (!releasedAt) return true;
    const released = new Date(releasedAt).getTime();
    if (Number.isNaN(released)) return true;
    return released >= now.getTime() - RECENT_SET_WINDOW_DAYS * DAY_MS;
};

/** Lowercase, whitespace-free key used for loose name comparison. */
export const normalizeName = (name: string): string =>
    name.normalize('NFC').toLowerCase().replace(/\s/g, '');

/**
 * Maps Scryfall artist names to our artists' display names. Matches on the
 * artist's scryfall_name first, then falls back to their display name.
 */
export const matchSetArtists = (
    scryfallArtists: string[],
    dbArtists: { name: string; scryfall_name?: string | null }[],
): string[] => {
    const byKey = new Map<string, string>();
    // Display names first so an explicit scryfall_name wins any collision.
    for (const artist of dbArtists) byKey.set(normalizeName(artist.name), artist.name);
    for (const artist of dbArtists) {
        if (artist.scryfall_name) byKey.set(normalizeName(artist.scryfall_name), artist.name);
    }

    const matched = new Set<string>();
    for (const scryfallName of scryfallArtists) {
        const name = byKey.get(normalizeName(scryfallName));
        if (name) matched.add(name);
    }
    return Array.from(matched).sort((a, b) => a.localeCompare(b));
};
