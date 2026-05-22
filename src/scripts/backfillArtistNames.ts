import 'dotenv/config';
import mongoose from 'mongoose';
import axios from 'axios';
import UserCardCollection from '../models/UserCardCollection';

const MONGO_URI = `mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`;

async function backfill() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const docs = await UserCardCollection.find({
    $or: [{ artistName: '' }, { artistName: { $exists: false } }],
  });
  console.log(`Found ${docs.length} records missing artistName`);

  if (docs.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < docs.length; i += 75) {
    const chunk = docs.slice(i, i + 75);
    const identifiers = chunk.map((doc) => ({
      set: doc.get('set'),
      collector_number: doc.get('collectorNumber'),
    }));

    try {
      const response = await axios.post('https://api.scryfall.com/cards/collection', { identifiers });
      const cards: any[] = response.data.data ?? [];

      const artistMap = new Map<string, string>();
      for (const card of cards) {
        if (card.artist && card.set && card.collector_number) {
          artistMap.set(`${card.set.toLowerCase()}-${card.collector_number}`, card.artist);
        }
      }

      for (const doc of chunk) {
        const key = `${doc.get('set').toLowerCase()}-${doc.get('collectorNumber')}`;
        const artist = artistMap.get(key);
        if (artist) {
          await UserCardCollection.updateOne({ _id: doc._id }, { $set: { artistName: artist } });
          updated++;
        } else {
          console.warn(`  No artist found: ${doc.get('cardName')} (${doc.get('set')} #${doc.get('collectorNumber')})`);
          failed++;
        }
      }
    } catch (err) {
      console.error(`  Scryfall batch failed at index ${i}:`, err);
      failed += chunk.length;
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + 75, docs.length)}/${docs.length}`);

    if (i + 75 < docs.length) await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\nDone. Updated: ${updated}, Failed/skipped: ${failed}`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
