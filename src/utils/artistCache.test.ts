import { cacheGet, cacheSet, invalidateArtistCache, ARTIST_CACHE_TTL_MS } from './artistCache';

beforeEach(() => {
  invalidateArtistCache();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// cacheGet
// ---------------------------------------------------------------------------
describe('cacheGet', () => {
  it('returns undefined for a key that has never been set', () => {
    expect(cacheGet('artistNames')).toBeUndefined();
  });

  it('returns undefined for a key that has been invalidated', () => {
    cacheSet('artistNames', ['Alice']);
    invalidateArtistCache();
    expect(cacheGet('artistNames')).toBeUndefined();
  });

  it('returns the stored value within the TTL window', () => {
    cacheSet('artistNames', ['Alice', 'Bob']);
    expect(cacheGet<string[]>('artistNames')).toEqual(['Alice', 'Bob']);
  });

  it('returns undefined and evicts the entry once the TTL has elapsed', () => {
    cacheSet('artistNames', ['Alice'], 5000);
    jest.advanceTimersByTime(5001);
    expect(cacheGet('artistNames')).toBeUndefined();
  });

  it('still returns the value one millisecond before expiry', () => {
    cacheSet('artistNames', ['Alice'], 5000);
    jest.advanceTimersByTime(4999);
    expect(cacheGet<string[]>('artistNames')).toEqual(['Alice']);
  });

  it('works independently for each cache key', () => {
    cacheSet('artistNames', ['Alice']);
    cacheSet('artistFilterFlags', { flags: 7 });
    expect(cacheGet('artistNames')).toEqual(['Alice']);
    expect(cacheGet('artistFilterFlags')).toEqual({ flags: 7 });
  });

  it('works with a templated artistsPage key', () => {
    cacheSet('artistsPage:0:60', { artists: ['Alice'], total: 1 });
    cacheSet('artistsPage:60:60', { artists: ['Bob'], total: 1 });
    expect(cacheGet('artistsPage:0:60')).toEqual({ artists: ['Alice'], total: 1 });
    expect(cacheGet('artistsPage:60:60')).toEqual({ artists: ['Bob'], total: 1 });
  });
});

// ---------------------------------------------------------------------------
// cacheSet
// ---------------------------------------------------------------------------
describe('cacheSet', () => {
  it('stores any serialisable value', () => {
    const value = { nested: { count: 42 } };
    cacheSet('artistFilterFlags', value);
    expect(cacheGet('artistFilterFlags')).toEqual(value);
  });

  it('overwrites the previous value for the same key', () => {
    cacheSet('artistNames', ['Alice']);
    cacheSet('artistNames', ['Bob']);
    expect(cacheGet<string[]>('artistNames')).toEqual(['Bob']);
  });

  it('uses ARTIST_CACHE_TTL_MS as the default TTL', () => {
    cacheSet('artistNames', ['Alice']);
    jest.advanceTimersByTime(ARTIST_CACHE_TTL_MS - 1);
    expect(cacheGet('artistNames')).toBeDefined();
    jest.advanceTimersByTime(2);
    expect(cacheGet('artistNames')).toBeUndefined();
  });

  it('respects a custom TTL', () => {
    cacheSet('artistNames', ['Alice'], 1000);
    jest.advanceTimersByTime(1001);
    expect(cacheGet('artistNames')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// invalidateArtistCache
// ---------------------------------------------------------------------------
describe('invalidateArtistCache', () => {
  it('clears both cache keys at once', () => {
    cacheSet('artistNames', ['Alice']);
    cacheSet('artistFilterFlags', { flags: 3 });
    invalidateArtistCache();
    expect(cacheGet('artistNames')).toBeUndefined();
    expect(cacheGet('artistFilterFlags')).toBeUndefined();
  });

  it('clears templated artistsPage entries too', () => {
    cacheSet('artistsPage:0:60', { artists: ['Alice'], total: 1 });
    invalidateArtistCache();
    expect(cacheGet('artistsPage:0:60')).toBeUndefined();
  });

  it('is safe to call when the cache is already empty', () => {
    expect(() => invalidateArtistCache()).not.toThrow();
  });

  it('is idempotent — calling twice has the same effect as calling once', () => {
    cacheSet('artistNames', ['Alice']);
    invalidateArtistCache();
    invalidateArtistCache();
    expect(cacheGet('artistNames')).toBeUndefined();
  });
});
