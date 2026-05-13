import Artist from '../models/Artist';
import ArtistPost from '../models/ArtistPost';
import axios from 'axios';

const BATCH_SIZE = 50; // Number of artists to check per cron run

export const runSocialMediaSync = async (): Promise<void> => {
  console.log(`[${new Date().toISOString()}] Starting social media sync for a subset of artists...`);

  try {
    const totalArtistsToSync = await Artist.countDocuments({ bluesky: { $exists: true, $ne: null } });
    
    // 1. Get a subset of artists who haven't been synced recently
    // Sorted by lastSocialSync (nulls first) to ensure everyone eventually gets checked
    const artists = await Artist.find({})
      .sort({ lastSocialSync: 1 })
      .limit(BATCH_SIZE);

    if (artists.length === 0) {
      console.log('No artists found to sync');
      return;
    }

    console.log(`Processing batch of ${artists.length}/${totalArtistsToSync} artists: ${artists.map(a => a.name).join(', ')}`);

    for (const artist of artists) {
      const syncPromises = [];

      // Check Bluesky
      if (artist.bluesky) {
        console.log(`[${artist.name}] Syncing Bluesky: ${artist.bluesky}`);
        syncPromises.push(syncBluesky(artist));
      }

      await Promise.allSettled(syncPromises);

      // Update the artist so they move to the back of the queue
      (artist as any).lastSocialSync = new Date();
      await artist.save();
    }

    console.log(`Social media sync batch complete.`);
  } catch (error) {
    console.error('Error in socialMediaSync job:', error);
  }
};

/**
 * Example implementation for Bluesky using the AT Protocol
 */
async function syncBluesky(artist: any) {
  try {
    // Simplified example: extracting handle from URL
    const handle = artist.bluesky.split('/').pop();
    if (!handle) return;

    // Bluesky has public endpoints that don't always require auth for basic feeds
    const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=5`;
    console.log(`[${artist.name}] Fetching Bluesky feed from: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    
    const feeds = response.data.feed || [];
    console.log(`[${artist.name}] Received ${feeds.length} items from Bluesky feed.`);
    
    let postsSaved = 0;
    for (const item of feeds) {
      const post = item.post;
      const createdAt = new Date(post.record.createdAt);

      // Only save if it's a recent post (e.g., last 48 hours)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      console.log(`[${artist.name}] Considering post (ID: ${post.cid}, Date: ${createdAt.toISOString()}).`);

      if (createdAt > twoDaysAgo) {
        const result = await ArtistPost.findOneAndUpdate(
          { platform: 'bluesky', externalPostId: post.cid },
          {
            artistId: artist._id,
            artistName: artist.name,
            platform: 'bluesky',
            externalPostId: post.cid,
            content: post.record.text || '', // Ensure content is not undefined
            postUrl: `https://bsky.app/profile/${handle}/post/${post.uri.split('/').pop()}`,
            postDate: createdAt,
            isReviewed: false
          },
          { upsert: true, new: true } // new: true returns the modified document rather than the original
        );
        postsSaved++;
        console.log(`[${artist.name}] Saved/Updated Bluesky post: ${result.postUrl} (ID: ${result.externalPostId})`);
      }
    }
    if (postsSaved === 0) {
      console.log(`[${artist.name}] No new or recent Bluesky posts found to save.`);
    } else {
      console.log(`[${artist.name}] Successfully processed ${postsSaved} recent Bluesky post(s).`);
    }
  } catch (err: any) {
    console.error(`Failed to sync Bluesky for ${artist.name}:`, err?.message || err);
  }
}
