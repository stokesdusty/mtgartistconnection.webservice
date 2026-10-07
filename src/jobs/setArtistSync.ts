import axios from 'axios';
import SetArtists from '../models/SetArtists';
import { MAJOR_SET_TYPES, collectArtists, shouldRefreshSet } from '../services/setArtists';

// Scryfall asks for a descriptive User-Agent and 50–100ms between requests.
const SCRYFALL_HEADERS = { 'User-Agent': 'mtgartistconnection/1.0', Accept: 'application/json' };
const REQUEST_DELAY_MS = 110;

interface ScryfallSet {
    code: string;
    name: string;
    set_type: string;
    released_at?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** All artist names credited in a set (one entry per unique artwork). */
const fetchSetArtists = async (code: string): Promise<string[]> => {
    const names = new Set<string>();
    let url: string | null =
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${code}`)}&unique=art`;

    while (url) {
        try {
            const { data } = await axios.get(url, { headers: SCRYFALL_HEADERS });
            collectArtists(data.data ?? []).forEach(name => names.add(name));
            url = data.has_more ? data.next_page : null;
        } catch (error: any) {
            // Scryfall answers 404 when a set has no cards yet (e.g. just announced).
            if (error?.response?.status === 404) break;
            throw error;
        }
        if (url) await delay(REQUEST_DELAY_MS);
    }

    return Array.from(names);
};

/**
 * Refreshes the set → artists index used by the homepage "Set" filter.
 * Fetches any set we don't have yet, plus recent and upcoming sets whose
 * artist lists are still growing. Older sets are left as stored.
 */
export const runSetArtistSync = async (): Promise<void> => {
    console.log('Starting set artist sync job...');

    const { data } = await axios.get<{ data: ScryfallSet[] }>('https://api.scryfall.com/sets', { headers: SCRYFALL_HEADERS });
    const sets = data.data.filter(set => MAJOR_SET_TYPES.has(set.set_type));

    const stored = new Set((await SetArtists.find({}, { code: 1 }).lean()).map(doc => doc.code));
    const toRefresh = sets.filter(set => shouldRefreshSet(set.released_at, stored.has(set.code)));
    console.log(`Set artist sync: ${sets.length} major sets, refreshing ${toRefresh.length}`);

    let updated = 0;
    let failed = 0;
    for (const set of toRefresh) {
        try {
            const artists = await fetchSetArtists(set.code);
            await SetArtists.updateOne(
                { code: set.code },
                { $set: { name: set.name, released_at: set.released_at, scryfall_artists: artists, updatedAt: new Date() } },
                { upsert: true },
            );
            updated++;
        } catch (error) {
            // Keep the previously stored list; try again on the next run.
            failed++;
            console.error(`Set artist sync: failed to refresh ${set.code}:`, error);
        }
        await delay(REQUEST_DELAY_MS);
    }

    console.log(`Set artist sync complete: ${updated} sets updated, ${failed} failed`);
};
