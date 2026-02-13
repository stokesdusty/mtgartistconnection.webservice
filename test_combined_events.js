require('dotenv').config();
const mongoose = require('mongoose');

async function testCombinedEvents() {
  const mongoUrl = `mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`;
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB Atlas');

  // Get the test user
  const user = await mongoose.connection.db.collection('users').findOne({ email: 'mtgartistconnection@gmail.com' });
  console.log('User monitored states:', user.monitoredStates);

  const testState = user.monitoredStates[0]; // CA

  // Create a test event
  const eventResult = await mongoose.connection.db.collection('signingevents').insertOne({
    name: 'MagicCon Los Angeles 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-06-20'),
    endDate: new Date('2026-06-22'),
    url: 'https://example.com/magiccon-la',
    createdAt: new Date(),
  });

  const eventId = eventResult.insertedId.toString();
  console.log('Created test event:', eventId);

  // Create "new_event" change
  await mongoose.connection.db.collection('eventchanges').insertOne({
    eventId: eventId,
    eventName: 'MagicCon Los Angeles 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-06-20'),
    endDate: new Date('2026-06-22'),
    url: 'https://example.com/magiccon-la',
    changeType: 'new_event',
    timestamp: new Date(),
    processed: false,
  });

  console.log('Created new_event change');

  // Add 3 artists and create artist_added changes for each
  const artists = ['Rebecca Guay', 'Terese Nielsen', 'Seb McKinnon'];

  for (const artistName of artists) {
    // Add artist mapping
    await mongoose.connection.db.collection('mapartisttoevents').insertOne({
      eventId: eventId,
      artistName: artistName,
      createdAt: new Date(),
    });

    // Create artist_added change
    await mongoose.connection.db.collection('eventchanges').insertOne({
      eventId: eventId,
      eventName: 'MagicCon Los Angeles 2026',
      city: 'Los Angeles',
      state: testState,
      startDate: new Date('2026-06-20'),
      endDate: new Date('2026-06-22'),
      url: 'https://example.com/magiccon-la',
      changeType: 'artist_added',
      artistName: artistName,
      timestamp: new Date(),
      processed: false,
    });

    console.log(`Created artist_added change for ${artistName}`);
  }

  // Now run the digest job
  const { runDailyEventDigest } = require('./dist/jobs/dailyEventDigest');

  console.log('\n=== Running Event Digest ===');
  await runDailyEventDigest();

  // Clean up
  console.log('\nCleaning up test data...');
  await mongoose.connection.db.collection('signingevents').deleteOne({ _id: eventResult.insertedId });
  await mongoose.connection.db.collection('mapartisttoevents').deleteMany({ eventId: eventId });
  console.log('Cleanup complete');

  await mongoose.disconnect();
  console.log('\nDone! Check mtgartistconnection@gmail.com for the email.');
  console.log('The email should show ONE event with all 3 artists highlighted as new.');
}

testCombinedEvents().catch(console.error);
