require('dotenv').config();
const { sendWelcomeEmail } = require('./dist/services/emailService');

async function testWelcomeEmail() {
  console.log('Testing welcome email...');
  console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'configured' : 'NOT SET');
  console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'configured' : 'NOT SET');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'default');
  console.log('');

  try {
    await sendWelcomeEmail('mtgartistconnection@gmail.com');
    console.log('✓ Welcome email sent successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to send welcome email:', error);
    process.exit(1);
  }
}

testWelcomeEmail();
