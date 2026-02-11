import axios from "axios";
import cron from "node-cron";
import CardKingdomPrice from "../models/CardKingdomPrice";

const CARDKINGDOM_API_URL = "https://api.cardkingdom.com/api/pricelist";
const BATCH_SIZE = 5000;

export const fetchAndStoreCardKingdomPrices = async (): Promise<void> => {
    console.log(`[${new Date().toISOString()}] Starting CardKingdom price data fetch...`);

    try {
        const response = await axios.get(CARDKINGDOM_API_URL, {
            timeout: 300000, // 5 minute timeout for large file
            maxContentLength: 100 * 1024 * 1024, // 100MB max
            responseType: 'json',
            headers: {
                'User-Agent': 'MTGArtistConnection/1.0',
                'Accept': 'application/json'
            }
        });

        const priceData = response.data;
        const fetchedAt = new Date();

        // CardKingdom API structure may vary, adapt based on actual response
        // Expected format: array of card objects or { data: [...] }
        const cards = Array.isArray(priceData) ? priceData : (priceData.data || priceData);

        console.log(`[${new Date().toISOString()}] Received ${cards.length} CardKingdom card records`);

        // Delete old records from previous syncs before inserting new ones
        const deleteResult = await CardKingdomPrice.deleteMany({});
        console.log(`[${new Date().toISOString()}] Cleared ${deleteResult.deletedCount} old CardKingdom price records`);

        // Insert in batches to avoid memory issues
        for (let i = 0; i < cards.length; i += BATCH_SIZE) {
            const batch = cards.slice(i, i + BATCH_SIZE).map((card: any) => {
                // Map CardKingdom API fields to our schema
                // Adjust field mapping based on actual API response
                return {
                    name: card.name,
                    edition: card.edition || card.set_name,
                    condition: card.condition || 'NM',
                    language: card.language || 'English',
                    foil: card.is_foil || card.foil || false,
                    signed: card.is_signed || card.signed || false,
                    artistProof: card.is_artist_proof || card.artist_proof || false,
                    alteredArt: card.is_altered || card.altered_art || false,
                    misprint: card.is_misprint || card.misprint || false,
                    promo: card.is_promo || card.promo || false,
                    textless: card.is_textless || card.textless || false,
                    printingId: card.printing_id || card.id,
                    id: card.id || card.ck_id,
                    price: Math.round((card.price || card.retail_price || 0) * 100), // Convert to cents
                    url: card.url || `https://www.cardkingdom.com/mtg/${card.name?.toLowerCase().replace(/\s+/g, '-')}`,
                    fetchedAt,
                };
            });

            await CardKingdomPrice.insertMany(batch, { ordered: false });

            console.log(`[${new Date().toISOString()}] Inserted CardKingdom batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cards.length / BATCH_SIZE)}`);
        }

        console.log(`[${new Date().toISOString()}] Successfully stored ${cards.length} CardKingdom price records in MongoDB`);

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`[${new Date().toISOString()}] CardKingdom API Error:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
        } else {
            console.error(`[${new Date().toISOString()}] Error fetching CardKingdom price data:`, error);
        }
    }
};

export const startCardKingdomPriceSyncScheduler = (): void => {
    // Run daily at 3:30 AM (30 minutes after Manapool sync)
    cron.schedule("30 3 * * *", () => {
        fetchAndStoreCardKingdomPrices();
    });

    console.log("CardKingdom price sync scheduler started - will run daily at 3:30 AM");
};
