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

    // 3. Build maps for matching
    // Map lowercase name -> artist document (for artists without scryfall_name set)
    const nameToArtist = new Map<string, typeof dbArtists[0]>();
    const knownScryfallNames = new Set<string>();

    for (const artist of dbArtists) {
      // If scryfall_name is already set, add it to known names
      if (artist.scryfall_name) {
        knownScryfallNames.add(artist.scryfall_name.toLowerCase());
      } else {
        // Otherwise, map by name for potential matching
        nameToArtist.set(artist.name.toLowerCase(), artist);
      }
    }

    // 4. Find artists from Scryfall that we don't have, and update matches
    const missingArtists: string[] = [];
    let matchedCount = 0;

    for (const scryfallName of scryfallArtists) {
      const lowerName = scryfallName.toLowerCase();

      // Already have this scryfall_name recorded
      if (knownScryfallNames.has(lowerName)) {
        continue;
      }

      // Check if we have an artist with a matching name (case-insensitive)
      const matchedArtist = nameToArtist.get(lowerName);
      if (matchedArtist) {
        // Update the artist's scryfall_name
        await Artist.updateOne(
          { _id: matchedArtist._id },
          { $set: { scryfall_name: scryfallName } }
        );
        matchedCount++;
        // Remove from map so we don't match again
        nameToArtist.delete(lowerName);
      } else {
        // No match found - this is a missing artist
        missingArtists.push(scryfallName);
      }
    }

    console.log(`Updated ${matchedCount} artists with scryfall_name`);
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
