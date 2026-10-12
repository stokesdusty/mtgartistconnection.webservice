import axios from "axios";
import TcgplayerProduct, { ITcgplayerProduct } from "../models/TcgplayerProduct";

// Undocumented endpoint behind tcgplayer.com product pages. No key needed, but it
// sends no CORS headers, so the frontend can't call it directly.
const DETAILS_URL = (productId: number) => `https://mp-search-api.tcgplayer.com/v2/product/${productId}/details`;

// Presale products get renamed up to release, so cached entries are re-fetched after this.
export const CACHE_TTL_DAYS = 7;
const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 5000;
export const MAX_IDS_PER_REQUEST = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TcgplayerProductInfo = Pick<ITcgplayerProduct, 'productId' | 'name' | 'setCode' | 'number'>;

/** Pulls what Mass Entry needs out of a product-details response; null if it's missing. */
export const parseProductDetails = (productId: number, body: any): TcgplayerProductInfo | null => {
    const name = body?.productName;
    const setCode = body?.setCode;
    if (typeof name !== 'string' || !name || typeof setCode !== 'string' || !setCode) return null;
    const number = body?.customAttributes?.number;
    return { productId, name, setCode, number: typeof number === 'string' && number ? number : undefined };
};

export const isFresh = (fetchedAt: Date, now: Date = new Date()): boolean =>
    now.getTime() - fetchedAt.getTime() < CACHE_TTL_DAYS * DAY_MS;

export interface ProductStore {
    loadCached(ids: number[]): Promise<(TcgplayerProductInfo & { fetchedAt: Date })[]>;
    fetchOne(productId: number): Promise<TcgplayerProductInfo | null>;
    save(products: TcgplayerProductInfo[], fetchedAt: Date): Promise<void>;
}

/**
 * Resolves TCGplayer product IDs to TCGplayer's name/set/number, serving fresh
 * cache hits and fetching the rest. Products that can't be fetched are omitted
 * (stale cache entries are still returned rather than dropped).
 */
export async function resolveTcgplayerProducts(
    ids: number[],
    store: ProductStore,
    now: Date = new Date(),
): Promise<TcgplayerProductInfo[]> {
    const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).slice(0, MAX_IDS_PER_REQUEST);
    if (unique.length === 0) return [];

    const cached = new Map((await store.loadCached(unique)).map((p) => [p.productId, p]));
    const toFetch = unique.filter((id) => {
        const hit = cached.get(id);
        return !hit || !isFresh(hit.fetchedAt, now);
    });

    const fetched: TcgplayerProductInfo[] = [];
    for (let i = 0; i < toFetch.length; i += FETCH_CONCURRENCY) {
        const batch = toFetch.slice(i, i + FETCH_CONCURRENCY);
        const results = await Promise.all(batch.map((id) => store.fetchOne(id).catch(() => null)));
        results.forEach((product) => { if (product) fetched.push(product); });
    }
    if (fetched.length > 0) await store.save(fetched, now);

    const byId = new Map<number, TcgplayerProductInfo>();
    cached.forEach(({ productId, name, setCode, number }) => byId.set(productId, { productId, name, setCode, number }));
    fetched.forEach((product) => byId.set(product.productId, product));
    return unique.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}

export const mongoProductStore: ProductStore = {
    async loadCached(ids) {
        return TcgplayerProduct.find({ productId: { $in: ids } }).lean().exec();
    },
    async fetchOne(productId) {
        const res = await axios.get(DETAILS_URL(productId), { timeout: FETCH_TIMEOUT_MS });
        return parseProductDetails(productId, res.data);
    },
    async save(products, fetchedAt) {
        await TcgplayerProduct.bulkWrite(products.map((product) => ({
            updateOne: {
                filter: { productId: product.productId },
                update: { $set: { ...product, fetchedAt } },
                upsert: true,
            },
        })));
    },
};
