import axios from 'axios';
import Artist from '../models/Artist';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { generateMissingArtistsEmail } from '../templates/missingArtistsEmail';

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

    // 2. Get all artists from our database
    const dbArtists = await Artist.find({}, { name: 1, scryfall_name: 1 });
    console.log(`Found ${dbArtists.length} artists in database`);

    // 3. Build a set of known names for fast lookup
    // Include both the artist's name and their scryfall_name (if set)
    const knownNames = new Set<string>();
    for (const artist of dbArtists) {
      // Add the artist's name (lowercase for case-insensitive matching)
      knownNames.add(artist.name.toLowerCase());

      // Add their scryfall_name if it exists
      if (artist.scryfall_name) {
        knownNames.add(artist.scryfall_name.toLowerCase());
      }
    }

    // 4. Find artists from Scryfall that we don't have
    const missingArtists: string[] = [];
    for (const scryfallName of scryfallArtists) {
      if (!knownNames.has(scryfallName.toLowerCase())) {
        missingArtists.push(scryfallName);
      }
    }

    console.log(`Found ${missingArtists.length} artists not in database`);

    // 5. If there are missing artists, email the admin
    if (missingArtists.length > 0) {
      // Find admin users to notify
      const adminUsers = await User.find({ role: 'admin' });

      if (adminUsers.length === 0) {
        console.log('No admin users found to notify');
        return;
      }

      // Sort alphabetically for easier reading
      missingArtists.sort((a, b) => a.localeCompare(b));

      const html = generateMissingArtistsEmail(missingArtists, scryfallArtists.length, dbArtists.length);
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

      console.log(`Scryfall artist sync complete: ${emailsSent} emails sent with ${missingArtists.length} missing artists`);
    } else {
      console.log('Scryfall artist sync complete: No missing artists found');
    }

  } catch (error) {
    console.error('Error running Scryfall artist sync:', error);
    throw error;
  }
};
