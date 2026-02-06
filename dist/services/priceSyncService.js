"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPriceSyncScheduler = exports.fetchAndStorePrices = void 0;
const axios_1 = __importDefault(require("axios"));
const node_cron_1 = __importDefault(require("node-cron"));
const CardPrice_1 = __importDefault(require("../models/CardPrice"));
const MANAPOOL_API_URL = "https://manapool.com/api/v1/prices/singles";
const BATCH_SIZE = 5000;
const fetchAndStorePrices = async () => {
    console.log(`[${new Date().toISOString()}] Starting price data fetch from Manapool...`);
    try {
        const response = await axios_1.default.get(MANAPOOL_API_URL, {
            timeout: 300000, // 5 minute timeout for large file
            maxContentLength: 100 * 1024 * 1024, // 100MB max
            responseType: 'json',
        });
        const priceData = response.data;
        const cards = priceData.data;
        const fetchedAt = new Date();
        console.log(`[${new Date().toISOString()}] Received ${cards.length} card records`);
        // Delete old records from previous syncs before inserting new ones
        const deleteResult = await CardPrice_1.default.deleteMany({});
        console.log(`[${new Date().toISOString()}] Cleared ${deleteResult.deletedCount} old price records`);
        // Insert in batches to avoid memory issues
        for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE).map((card) => ({
                ...card,
                fetchedAt,
            }));
            await CardPrice_1.default.insertMany(batch, { ordered: false });
            console.log(`[${new Date().toISOString()}] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cards.length / BATCH_SIZE)}`);
        }
        console.log(`[${new Date().toISOString()}] Successfully stored ${cards.length} price records in MongoDB`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching price data:`, error);
    }
};
exports.fetchAndStorePrices = fetchAndStorePrices;
const startPriceSyncScheduler = () => {
    // Run daily at 3:00 AM
    node_cron_1.default.schedule("0 3 * * *", () => {
        (0, exports.fetchAndStorePrices)();
    });
    console.log("Price sync scheduler started - will run daily at 3:00 AM");
};
exports.startPriceSyncScheduler = startPriceSyncScheduler;
//# sourceMappingURL=priceSyncService.js.map