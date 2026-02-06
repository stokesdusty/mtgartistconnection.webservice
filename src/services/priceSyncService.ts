import axios from "axios";
import cron from "node-cron";
import CardPrice from "../models/CardPrice";

const MANAPOOL_API_URL = "https://manapool.com/api/v1/prices/singles";
const BATCH_SIZE = 5000;

export const fetchAndStorePrices = async (): Promise<void> => {
    console.log(`[${new Date().toISOString()}] Starting price data fetch from Manapool...`);

    try {
        const response = await axios.get(MANAPOOL_API_URL, {
            timeout: 300000, // 5 minute timeout for large file
            maxContentLength: 100 * 1024 * 1024, // 100MB max
            responseType: 'json',
        });

        const priceData = response.data;
        const cards = priceData.data;
        const fetchedAt = new Date();

        console.log(`[${new Date().toISOString()}] Received ${cards.length} card records`);

        // Delete old records from previous syncs before inserting new ones
        const deleteResult = await CardPrice.deleteMany({});
        console.log(`[${new Date().toISOString()}] Cleared ${deleteResult.deletedCount} old price records`);

        // Insert in batches to avoid memory issues
        for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE).map((card: any) => ({
                ...card,
                fetchedAt,
            }));

            await CardPrice.insertMany(batch, { ordered: false });

            console.log(`[${new Date().toISOString()}] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cards.length / BATCH_SIZE)}`);
        }

        console.log(`[${new Date().toISOString()}] Successfully stored ${cards.length} price records in MongoDB`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching price data:`, error);
    }
};

export const startPriceSyncScheduler = (): void => {
    // Run daily at 3:00 AM
    cron.schedule("0 3 * * *", () => {
        fetchAndStorePrices();
    });

    console.log("Price sync scheduler started - will run daily at 3:00 AM");
};
