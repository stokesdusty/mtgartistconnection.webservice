require('dotenv').config();
const mongoose = require('mongoose');

async function testCompleteFlow() {
  const mongoUrl = `mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`;
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB Atlas');

  // Get the test user
  const user = await mongoose.connection.db.collection('users').findOne({ email: 'mtgartistconnection@gmail.com' });
  console.log('User monitored states:', user.monitoredStates);

  const testState = user.monitoredStates[0]; // CA

  // Create a test event
  const eventResult = await mongoose.connection.db.collection('signingevents').insertOne({
    name: 'Test Grand Prix 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-05-15'),
    endDate: new Date('2026-05-17'),
    url: 'https://example.com/test-gp',
    createdAt: new Date(),
  });

  const eventId = eventResult.insertedId.toString();
  console.log('Created test event:', eventId);

  // First, create a "new_event" change
  await mongoose.connection.db.collection('eventchanges').insertOne({
    eventId: eventId,
    eventName: 'Test Grand Prix 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-05-15'),
    endDate: new Date('2026-05-17'),
    url: 'https://example.com/test-gp',
    changeType: 'new_event',
    timestamp: new Date(),
    processed: false,
  });

  console.log('Created new_event EventChange');

  // Add first artist to the event
  await mongoose.connection.db.collection('mapartisttoevents').insertOne({
    eventId: eventId,
    artistName: 'Rebecca Guay',
    createdAt: new Date(),
  });

  // Create artist_added change for the first artist
  await mongoose.connection.db.collection('eventchanges').insertOne({
    eventId: eventId,
    eventName: 'Test Grand Prix 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-05-15'),
    endDate: new Date('2026-05-17'),
    url: 'https://example.com/test-gp',
    changeType: 'artist_added',
    artistName: 'Rebecca Guay',
    timestamp: new Date(),
    processed: false,
  });

  console.log('Created artist_added EventChange for Rebecca Guay');

  // Add second artist
  await mongoose.connection.db.collection('mapartisttoevents').insertOne({
    eventId: eventId,
    artistName: 'Terese Nielsen',
    createdAt: new Date(),
  });

  // Create artist_added change for the second artist
  await mongoose.connection.db.collection('eventchanges').insertOne({
    eventId: eventId,
    eventName: 'Test Grand Prix 2026',
    city: 'Los Angeles',
    state: testState,
    startDate: new Date('2026-05-15'),
    endDate: new Date('2026-05-17'),
    url: 'https://example.com/test-gp',
    changeType: 'artist_added',
    artistName: 'Terese Nielsen',
    timestamp: new Date(),
    processed: false,
  });

  console.log('Created artist_added EventChange for Terese Nielsen');

  // Now run the digest job
  const { runDailyEventDigest } = require('./dist/jobs/dailyEventDigest');

  console.log('\n=== Running Event Digest ===');
  await runDailyEventDigest();

  // Clean up - delete the test event and mappings
  console.log('\nCleaning up test data...');
  await mongoose.connection.db.collection('signingevents').deleteOne({ _id: eventResult.insertedId });
  await mongoose.connection.db.collection('mapartisttoevents').deleteMany({ eventId: eventId });
  console.log('Cleanup complete');

  await mongoose.disconnect();
  console.log('\nDone! Check mtgartistconnection@gmail.com for the email.');
}

testCompleteFlow().catch(console.error);
