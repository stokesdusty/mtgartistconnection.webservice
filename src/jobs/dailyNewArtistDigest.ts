import ArtistChange from '../models/ArtistChange';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { generateNewArtistDigestEmail } from '../templates/newArtistDigestEmail';

export const runDailyNewArtistDigest = async (): Promise<void> => {
  console.log('Starting daily new artist digest job...');

  try {
    // 1. Get unprocessed new_artist changes
    const newArtistChanges = await ArtistChange.find({
      changeType: 'new_artist',
      processed: false
    });

    if (newArtistChanges.length === 0) {
      console.log('No new artists to notify about');
      return;
    }

    console.log(`Found ${newArtistChanges.length} new artists to notify about`);

    // 2. Get artist names
    const artistNames = newArtistChanges.map(change => change.artistName);

    // 3. Find all users who have new artist notifications enabled
    const users = await User.find({
      'emailPreferences.newArtistNotifications': true
    });

    console.log(`Found ${users.length} users with new artist notifications enabled`);

    if (users.length === 0) {
      console.log('No users to notify');
      // Still mark as processed
      await ArtistChange.updateMany(
        { changeType: 'new_artist', processed: false },
        { $set: { processed: true, processedAt: new Date() } }
      );
      return;
    }

    // 4. Generate email and send to all users
    const html = generateNewArtistDigestEmail(artistNames);
    const today = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const user of users) {
      try {
        await sendEmail(
          user.email,
          `New Artists Added - ${today}`,
          html
        );
        emailsSent++;
        console.log(`New artist digest sent to ${user.email}`);
      } catch (error) {
        console.error(`Failed to send new artist digest to ${user.email}:`, error);
        emailsFailed++;
      }
    }

    // 5. Mark new_artist changes as processed
    const updateResult = await ArtistChange.updateMany(
      { changeType: 'new_artist', processed: false },
      { $set: { processed: true, processedAt: new Date() } }
    );

    console.log(`Daily new artist digest complete:`);
    console.log(`- New artists: ${artistNames.length}`);
    console.log(`- Emails sent: ${emailsSent}`);
    console.log(`- Emails failed: ${emailsFailed}`);
    console.log(`- Changes processed: ${updateResult.modifiedCount}`);

  } catch (error) {
    console.error('Error running daily new artist digest:', error);
    throw error;
  }
};
