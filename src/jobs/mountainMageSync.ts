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

// Normalizes a Mountain Mage URL so equivalent links compare equal regardless of protocol,
// "www.", query string, trailing slash, casing, or a /collections/<x>/ prefix. Product URLs
// reduce to their handle; anything else falls back to the cleaned-up URL.
const normalizeMountainMageUrl = (url: string): string => {
  const cleaned = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

  const productMatch = cleaned.match(/\/products\/([^/]+)$/);
  return productMatch ? `product:${productMatch[1]}` : cleaned;
};

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

    // 2. Get all artists from our database (lean: plain objects, no Mongoose document overhead)
    const dbArtists = await Artist.find({}, { name: 1, mountainmage: 1 }).lean();
    console.log(`Found ${dbArtists.length} artists in database`);

    // Build lookup tables once so every check below is an O(1) Map/Set lookup,
    // and each URL is normalized only once
    const dbArtistsByNameLower = new Map<string, (typeof dbArtists)[number]>();
    const dbArtistsWithLinks: { name: string; url: string; normalizedUrl: string }[] = [];
    const dbMountainMageUrls = new Set<string>();
    for (const artist of dbArtists) {
      dbArtistsByNameLower.set(artist.name.trim().toLowerCase(), artist);
      // 'false' is a placeholder meaning "not on Mountain Mage", not a link, so it's never stale
      if (artist.mountainmage && artist.mountainmage.trim().toLowerCase() !== 'false') {
        const normalizedUrl = normalizeMountainMageUrl(artist.mountainmage);
        dbArtistsWithLinks.push({ name: artist.name, url: artist.mountainmage, normalizedUrl });
        dbMountainMageUrls.add(normalizedUrl);
      }
    }

    const siteMountainMageUrls = new Set<string>();
    for (const mmArtist of mountainMageArtists) {
      siteMountainMageUrls.add(normalizeMountainMageUrl(mmArtist.url));
    }

    // 3. Compare each Mountain Mage artist against our database
    const urlMismatches: { name: string; currentUrl: string; expectedUrl: string }[] = [];
    const unmatchedArtists: { name: string; url: string }[] = [];
    const mismatchedDbNames = new Set<string>();

    for (const mmArtist of mountainMageArtists) {
      const nameLower = mmArtist.name.trim().toLowerCase();
      if (IGNORED_MOUNTAINMAGE_NAMES.has(nameLower)) {
        continue;
      }

      const dbArtist = dbArtistsByNameLower.get(nameLower);

      if (!dbArtist) {
        // Name differs from ours, but if the link is already on an artist row, it's accounted for
        if (!dbMountainMageUrls.has(normalizeMountainMageUrl(mmArtist.url))) {
          unmatchedArtists.push(mmArtist);
        }
        continue;
      }

      if ((dbArtist.mountainmage || '') !== mmArtist.url) {
        urlMismatches.push({
          name: dbArtist.name,
          currentUrl: dbArtist.mountainmage || '',
          expectedUrl: mmArtist.url
        });
        mismatchedDbNames.add(dbArtist.name);
      }
    }

    // 4. Find links in our database that don't point to any listing on the site. Artists already
    // reported as URL mismatches are skipped so the same row isn't flagged twice.
    const staleDbLinks = dbArtistsWithLinks
      .filter(artist => !siteMountainMageUrls.has(artist.normalizedUrl) && !mismatchedDbNames.has(artist.name))
      .map(({ name, url }) => ({ name, url }));

    console.log(`Found ${urlMismatches.length} mountainmage URL mismatches`);
    console.log(`Found ${unmatchedArtists.length} Mountain Mage artists not matched in database`);
    console.log(`Found ${staleDbLinks.length} database mountainmage links not found on Mountain Mage`);

    // 5. Email the admins if there's anything to report
    if (urlMismatches.length > 0 || unmatchedArtists.length > 0 || staleDbLinks.length > 0) {
      const adminUsers = await User.find({ role: 'admin' });

      if (adminUsers.length === 0) {
        console.log('No admin users found to notify');
        return;
      }

      urlMismatches.sort((a, b) => a.name.localeCompare(b.name));
      unmatchedArtists.sort((a, b) => a.name.localeCompare(b.name));
      staleDbLinks.sort((a, b) => a.name.localeCompare(b.name));

      const html = generateMountainMageSyncEmail(
        urlMismatches,
        unmatchedArtists,
        staleDbLinks,
        mountainMageArtists.length,
        dbArtists.length
      );

      const today = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      // Send to all admins in parallel; one failure doesn't block the others
      const results = await Promise.allSettled(
        adminUsers.map(admin =>
          sendEmail(admin.email, `Mountain Mage Signatures Sync Report - ${today}`, html)
        )
      );

      let emailsSent = 0;
      results.forEach((result, i) => {
        const adminId = adminUsers[i]._id;
        if (result.status === 'fulfilled') {
          emailsSent++;
          console.log(`Report sent to user ${adminId}`);
        } else {
          console.error(`Failed to send report to user ${adminId}:`, result.reason);
        }
      });

      console.log(`Mountain Mage sync complete: ${emailsSent} emails sent`);
    } else {
      console.log('Mountain Mage sync complete: No discrepancies found');
    }

  } catch (error) {
    console.error('Error running Mountain Mage sync:', error);
    throw error;
  }
};
