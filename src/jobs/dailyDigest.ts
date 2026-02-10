import ArtistChange from '../models/ArtistChange';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { generateDigestEmail } from '../templates/digestEmail';

export const runDailyDigest = async (): Promise<void> => {
  console.log('Starting daily digest job...');

  try {
    // 1. Get unprocessed changes
    const changes = await ArtistChange.find({ processed: false });

    if (changes.length === 0) {
      console.log('No unprocessed changes found');
      return;
    }

    console.log(`Found ${changes.length} unprocessed changes`);

    // 2. Group by artist
    const changesByArtist = changes.reduce((acc, change) => {
      if (!acc[change.artistName]) {
        acc[change.artistName] = [];
      }
      acc[change.artistName].push(change);
      return acc;
    }, {} as Record<string, any[]>);

    console.log(`Changes grouped for ${Object.keys(changesByArtist).length} artists`);

    // 3. Build user digest map
    const userDigests = new Map<string, { email: string; artistChanges: any[] }>();

    // Get list of artists with changes
    const artistsWithChanges = Object.keys(changesByArtist);

    // OPTIMIZED: Single query to find all users following any of these artists
    const query: any = {
      followedArtists: { $in: artistsWithChanges },
      'emailPreferences.artistUpdates': true
    };

    // TESTING MODE: Only send emails to admin users
    // Remove or comment out these 3 lines when ready for all users
    if (process.env.NODE_ENV === 'production') {
      query.role = 'admin';
      console.log('TESTING MODE: Only sending emails to admin users');
    }

    const allFollowers = await User.find(query);
    console.log(`Found ${allFollowers.length} total users following artists with changes`);

    // Build digest for each user based on which artists they follow
    for (const user of allFollowers) {
      const userId = user._id.toString();

      // Find which artists this user follows that have changes
      const userFollowedWithChanges = user.followedArtists.filter(
        (artistName: string) => changesByArtist[artistName]
      );

      if (userFollowedWithChanges.length > 0) {
        userDigests.set(userId, {
          email: user.email,
          artistChanges: userFollowedWithChanges.map((artistName: string) => ({
            artistName,
            changes: changesByArtist[artistName]
          }))
        });
      }
    }

    console.log(`Preparing to send emails to ${userDigests.size} users`);

    // 4. Send emails
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const [userId, digest] of userDigests) {
      try {
        const html = generateDigestEmail(digest.artistChanges);
        const today = new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
        await sendEmail(
          digest.email,
          `Your Daily MTG Artist Updates - ${today}`,
          html
        );
        emailsSent++;
        console.log(`Email sent to ${digest.email}`);
      } catch (error) {
        console.error(`Failed to send digest to user ${userId}:`, error);
        emailsFailed++;
      }
    }

    // 5. Mark as processed
    const updateResult = await ArtistChange.updateMany(
      { processed: false },
      {
        $set: {
          processed: true,
          processedAt: new Date()
        }
      }
    );

    console.log(`Daily digest complete:`);
    console.log(`- Emails sent: ${emailsSent}`);
    console.log(`- Emails failed: ${emailsFailed}`);
    console.log(`- Changes processed: ${updateResult.modifiedCount}`);

  } catch (error) {
    console.error('Error running daily digest:', error);
    throw error;
  }
};
