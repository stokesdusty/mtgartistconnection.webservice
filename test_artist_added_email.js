require('dotenv').config();
const mongoose = require('mongoose');

async function testArtistAddedEmail() {
  const mongoUrl = `mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`;
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB Atlas');

  // Get the test user
  const user = await mongoose.connection.db.collection('users').findOne({ email: 'mtgartistconnection@gmail.com' });
  console.log('User monitored states:', user.monitoredStates);

  // Get an existing event in a monitored state
  const existingEvent = await mongoose.connection.db.collection('signingevents').findOne({
    state: user.monitoredStates[0]
  });

  if (!existingEvent) {
    console.log('No existing event found in monitored state');
    await mongoose.disconnect();
    return;
  }

  console.log('Found event:', existingEvent.name);

  // Create an EventChange record for artist addition
  await mongoose.connection.db.collection('eventchanges').insertOne({
    eventId: existingEvent._id.toString(),
    eventName: existingEvent.name,
    city: existingEvent.city,
    state: existingEvent.state,
    startDate: existingEvent.startDate,
    endDate: existingEvent.endDate,
    url: existingEvent.url || null,
    changeType: 'artist_added',
    artistName: 'Test Artist Name',
    timestamp: new Date(),
    processed: false,
  });

  console.log('Created artist_added EventChange');

  // Also add this artist to the event mapping
  await mongoose.connection.db.collection('mapartisttoevents').insertOne({
    eventId: existingEvent._id.toString(),
    artistName: 'Test Artist Name',
    createdAt: new Date(),
  });

  console.log('Created MapArtistToEvent mapping');

  // Now run the digest job
  const { runDailyEventDigest } = require('./dist/jobs/dailyEventDigest');

  console.log('\n=== Running Event Digest ===');
  await runDailyEventDigest();

  await mongoose.disconnect();
  console.log('\nDone! Check mtgartistconnection@gmail.com for the email.');
}

testArtistAddedEmail().catch(console.error);
