const KEYS = ['artistFilterFlags', 'artistNames'] as const;
type Key = typeof KEYS[number];

interface Entry<T> { value: T; expiresAt: number; }

const store = new Map<Key, Entry<unknown>>();

export const ARTIST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function cacheGet<T>(key: Key): T | undefined {
    const entry = store.get(key) as Entry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
    return entry.value;
}

export function cacheSet<T>(key: Key, value: T, ttlMs: number = ARTIST_CACHE_TTL_MS): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateArtistCache(): void {
    KEYS.forEach(k => store.delete(k));
}
