import { parseProductDetails, ProductStore, resolveTcgplayerProducts, TcgplayerProductInfo } from './tcgplayerProducts';

const now = new Date('2026-10-11T00:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const zimone: TcgplayerProductInfo = { productId: 686633, name: 'Zimone, Infinite Analyst (Borderless)', setCode: 'SOC', number: '10' };
const aang: TcgplayerProductInfo = { productId: 111, name: 'Aang, at the Crossroads (Showcase)', setCode: 'TLA', number: '346' };

const makeStore = (cached: (TcgplayerProductInfo & { fetchedAt: Date })[], remote: Record<number, TcgplayerProductInfo | Error>) => {
  const store = {
    loadCached: jest.fn(async (ids: number[]) => cached.filter((p) => ids.includes(p.productId))),
    fetchOne: jest.fn(async (id: number) => {
      const hit = remote[id];
      if (hit instanceof Error) throw hit;
      return hit ?? null;
    }),
    save: jest.fn(async () => {}),
  } satisfies ProductStore;
  return store;
};

describe('parseProductDetails', () => {
  it("pulls TCGplayer's name, set and number", () => {
    const body = { productName: zimone.name, setCode: 'SOC', customAttributes: { number: '10' } };
    expect(parseProductDetails(686633, body)).toEqual(zimone);
  });

  it('rejects responses without a name or set', () => {
    expect(parseProductDetails(1, { setCode: 'SOC' })).toBeNull();
    expect(parseProductDetails(1, { productName: 'X' })).toBeNull();
    expect(parseProductDetails(1, null)).toBeNull();
  });

  it('treats a missing number as undefined', () => {
    expect(parseProductDetails(1, { productName: 'X', setCode: 'Y', customAttributes: {} })?.number).toBeUndefined();
  });
});

describe('resolveTcgplayerProducts', () => {
  it('serves fresh cache hits without fetching', async () => {
    const store = makeStore([{ ...zimone, fetchedAt: daysAgo(1) }], {});
    expect(await resolveTcgplayerProducts([686633], store, now)).toEqual([zimone]);
    expect(store.fetchOne).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('fetches misses and stale entries, saves them, and keeps request order', async () => {
    const renamed = { ...zimone, name: 'Zimone, Infinite Analyst (Borderless) (Renamed)' };
    const store = makeStore([{ ...zimone, fetchedAt: daysAgo(30) }], { 686633: renamed, 111: aang });

    expect(await resolveTcgplayerProducts([111, 686633, 111], store, now)).toEqual([aang, renamed]);
    expect(store.fetchOne).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenCalledWith([aang, renamed], now);
  });

  it('skips products that fail to fetch, keeping stale data when there is some', async () => {
    const store = makeStore([{ ...zimone, fetchedAt: daysAgo(30) }], { 686633: new Error('timeout'), 111: new Error('404') });
    expect(await resolveTcgplayerProducts([686633, 111], store, now)).toEqual([zimone]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('ignores invalid IDs and caps the request size', async () => {
    const store = makeStore([], {});
    await resolveTcgplayerProducts([0, -5, 1.5, ...Array.from({ length: 150 }, (_, i) => i + 1)], store, now);
    expect(store.loadCached.mock.calls[0][0]).toHaveLength(100);
    expect(store.loadCached.mock.calls[0][0][0]).toBe(1);
  });
});
