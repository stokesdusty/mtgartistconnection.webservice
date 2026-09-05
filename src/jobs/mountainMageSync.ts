import axios from 'axios';
import Artist from '../models/Artist';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { generateMountainMageSyncEmail } from '../templates/mountainMageSyncEmail';

const MOUNTAIN_MAGE_PRODUCTS_URL = 'https://mountainmagesigs.com/collections/artists/products.json';
const PAGE_LIMIT = 250;
const MAX_PAGES = 20; // safety cap (5,000 products) in case pagination ever misbehaves

// Mountain Mage listing titles to skip entirely (won't be flagged as unmatched or used for
// URL matching). Useful for special-event/duplicate listings (e.g. "Artist Name - MagicCon City")
// that don't correspond 1:1 with an artist row. Review the report and add entries here as needed.
// NOTE: All entries must be lowercase for case-insensitive matching.
const IGNORED_MOUNTAINMAGE_NAMES = new Set<string>([
]);

interface ShopifyProduct {
  title: string;
  handle: string;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

const fetchAllMountainMageArtists = async (): Promise<{ name: string; url: string }[]> => {
  const artists: { name: string; url: string }[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await axios.get<ShopifyProductsResponse>(MOUNTAIN_MAGE_PRODUCTS_URL, {
      params: { limit: PAGE_LIMIT, page },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MTGArtistConnectionBot/1.0)' }
    });
    const products = response.data.products;

    if (!products || products.length === 0) {
      break;
    }

    for (const product of products) {
      artists.push({
        name: product.title,
        url: `https://mountainmagesigs.com/products/${product.handle}`
      });
    }

    if (products.length < PAGE_LIMIT) {
      break;
    }
  }

  return artists;
};

export const runMountainMageSync = async (): Promise<void> => {
  console.log('Starting Mountain Mage Signatures sync job...');

  try {
    // 1. Fetch all artist products from Mountain Mage's "artists" collection
    console.log('Fetching artist list from Mountain Mage Signatures...');
    const mountainMageArtists = await fetchAllMountainMageArtists();
    console.log(`Fetched ${mountainMageArtists.length} artists from Mountain Mage Signatures`);

    // 2. Get all artists from our database
    const dbArtists = await Artist.find({}, { name: 1, mountainmage: 1 });
    console.log(`Found ${dbArtists.length} artists in database`);

    const dbArtistsByNameLower = new Map<string, (typeof dbArtists)[number]>();
    for (const artist of dbArtists) {
      dbArtistsByNameLower.set(artist.name.trim().toLowerCase(), artist);
    }

    // 3. Compare each Mountain Mage artist against our database
    const urlMismatches: { name: string; currentUrl: string; expectedUrl: string }[] = [];
    const unmatchedArtists: { name: string; url: string }[] = [];

    for (const mmArtist of mountainMageArtists) {
      const nameLower = mmArtist.name.trim().toLowerCase();
      if (IGNORED_MOUNTAINMAGE_NAMES.has(nameLower)) {
        continue;
      }

      const dbArtist = dbArtistsByNameLower.get(nameLower);

      if (!dbArtist) {
        unmatchedArtists.push(mmArtist);
        continue;
      }

      if ((dbArtist.mountainmage || '') !== mmArtist.url) {
        urlMismatches.push({
          name: dbArtist.name,
          currentUrl: dbArtist.mountainmage || '',
          expectedUrl: mmArtist.url
        });
      }
    }

    console.log(`Found ${urlMismatches.length} mountainmage URL mismatches`);
    console.log(`Found ${unmatchedArtists.length} Mountain Mage artists not matched in database`);

    // 4. Email the admins if there's anything to report
    if (urlMismatches.length > 0 || unmatchedArtists.length > 0) {
      const adminUsers = await User.find({ role: 'admin' });

      if (adminUsers.length === 0) {
        console.log('No admin users found to notify');
        return;
      }

      urlMismatches.sort((a, b) => a.name.localeCompare(b.name));
      unmatchedArtists.sort((a, b) => a.name.localeCompare(b.name));

      const html = generateMountainMageSyncEmail(
        urlMismatches,
        unmatchedArtists,
        mountainMageArtists.length,
        dbArtists.length
      );

      const today = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      let emailsSent = 0;
      for (const admin of adminUsers) {
        try {
          await sendEmail(
            admin.email,
            `Mountain Mage Signatures Sync Report - ${today}`,
            html
          );
          emailsSent++;
          console.log(`Report sent to user ${admin._id}`);
        } catch (error) {
          console.error(`Failed to send report to user ${admin._id}:`, error);
        }
      }

      console.log(`Mountain Mage sync complete: ${emailsSent} emails sent`);
    } else {
      console.log('Mountain Mage sync complete: No discrepancies found');
    }

  } catch (error) {
    console.error('Error running Mountain Mage sync:', error);
    throw error;
  }
};
