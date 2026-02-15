import axios from 'axios';
import Artist from '../models/Artist';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { generateScryfallSyncEmail } from '../templates/missingArtistsEmail';

const SCRYFALL_ARTISTS_URL = 'https://api.scryfall.com/catalog/artist-names';

interface ScryfallCatalogResponse {
  object: string;
  uri: string;
  total_values: number;
  data: string[];
}

export const runScryfallArtistSync = async (): Promise<void> => {
  console.log('Starting Scryfall artist sync job...');

  try {
    // 1. Fetch artist names from Scryfall
    console.log('Fetching artist names from Scryfall...');
    const response = await axios.get<ScryfallCatalogResponse>(SCRYFALL_ARTISTS_URL);
    const scryfallArtists = response.data.data;
    console.log(`Fetched ${scryfallArtists.length} artist names from Scryfall`);

    // 2. Get all artists from our database that have a scryfall_name
    const dbArtists = await Artist.find(
      { scryfall_name: { $exists: true, $ne: null, $nin: ['', null] } },
      { name: 1, scryfall_name: 1 }
    );
    console.log(`Found ${dbArtists.length} artists with scryfall_name in database`);

    // 3. Build sets for comparison
    const scryfallNamesLower = new Set(scryfallArtists.map(name => name.toLowerCase()));
    const dbScryfallNamesLower = new Set<string>();

    for (const artist of dbArtists) {
      if (artist.scryfall_name) {
        dbScryfallNamesLower.add(artist.scryfall_name.toLowerCase());
      }
    }

    // 4. Find Scryfall artists not in our DB (by scryfall_name)
    const missingFromDb: string[] = [];
    for (const scryfallName of scryfallArtists) {
      if (!dbScryfallNamesLower.has(scryfallName.toLowerCase())) {
        missingFromDb.push(scryfallName);
      }
    }

    // 5. Find our artists not on Scryfall (exclude "unknown")
    const notOnScryfall: { name: string; scryfall_name: string }[] = [];
    for (const artist of dbArtists) {
      if (
        artist.scryfall_name &&
        artist.scryfall_name.toLowerCase() !== 'unknown' &&
        !scryfallNamesLower.has(artist.scryfall_name.toLowerCase())
      ) {
        notOnScryfall.push({
          name: artist.name,
          scryfall_name: artist.scryfall_name
        });
      }
    }

    console.log(`Found ${missingFromDb.length} Scryfall artists not in database`);
    console.log(`Found ${notOnScryfall.length} database artists not on Scryfall`);

    // 6. Email the admin if there's anything to report
    if (missingFromDb.length > 0 || notOnScryfall.length > 0) {
      const adminUsers = await User.find({ role: 'admin' });

      if (adminUsers.length === 0) {
        console.log('No admin users found to notify');
        return;
      }

      // Sort alphabetically
      missingFromDb.sort((a, b) => a.localeCompare(b));
      notOnScryfall.sort((a, b) => a.name.localeCompare(b.name));

      const html = generateScryfallSyncEmail(
        missingFromDb,
        notOnScryfall,
        scryfallArtists.length,
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
            `Scryfall Artist Sync Report - ${today}`,
            html
          );
          emailsSent++;
          console.log(`Report sent to ${admin.email}`);
        } catch (error) {
          console.error(`Failed to send report to ${admin.email}:`, error);
        }
      }

      console.log(`Scryfall artist sync complete: ${emailsSent} emails sent`);
    } else {
      console.log('Scryfall artist sync complete: No discrepancies found');
    }

  } catch (error) {
    console.error('Error running Scryfall artist sync:', error);
    throw error;
  }
};
