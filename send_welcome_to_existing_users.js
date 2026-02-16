require('dotenv').config();
const mongoose = require('mongoose');
const { sendWelcomeEmail } = require('./dist/services/emailService');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = `mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`;
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Import User model after connection
const getUserModel = () => {
  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    role: String,
    emailPreferences: {
      siteUpdates: Boolean,
      artistUpdates: Boolean,
      localSigningEvents: Boolean,
    },
    followedArtists: [String],
    monitoredStates: [String],
  });

  return mongoose.models.User || mongoose.model('User', userSchema);
};

async function sendWelcomeToAllUsers() {
  console.log('Starting one-time welcome email campaign...\n');

  await connectDB();
  const User = getUserModel();

  try {
    // Get all users
    const users = await User.find({}).select('email name');
    console.log(`Found ${users.length} total users\n`);

    if (users.length === 0) {
      console.log('No users found. Exiting.');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];

    // Send emails with a small delay to avoid rate limiting
    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      try {
        await sendWelcomeEmail(user.email);
        successCount++;
        console.log(`[${i + 1}/${users.length}] ✓ Sent to ${user.email}`);

        // Small delay to avoid overwhelming the email service (500ms)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        failCount++;
        failedEmails.push(user.email);
        console.error(`[${i + 1}/${users.length}] ✗ Failed to send to ${user.email}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Welcome Email Campaign Complete');
    console.log('='.repeat(50));
    console.log(`Total users: ${users.length}`);
    console.log(`Successfully sent: ${successCount}`);
    console.log(`Failed: ${failCount}`);

    if (failedEmails.length > 0) {
      console.log('\nFailed email addresses:');
      failedEmails.forEach(email => console.log(`  - ${email}`));
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error in welcome email campaign:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

sendWelcomeToAllUsers();
