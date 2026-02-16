import nodemailer from 'nodemailer';
import { generateWelcomeEmail } from '../templates/welcomeEmail';

// Configure transporter (use environment variables for credentials)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // use STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
  family: 4 as 4, // Force IPv4
} as any);

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<void> => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'MTG Artist Connection <noreply@mtgartistconnection.com>',
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
};

export const sendWelcomeEmail = async (to: string): Promise<void> => {
  const html = generateWelcomeEmail();
  const subject = 'Welcome to MTG Artist Connection!';

  // Retry logic for welcome emails
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendEmail(to, subject, html);
      console.log(`Welcome email sent to ${to}`);
      return; // Success - exit function
    } catch (error) {
      lastError = error;
      console.error(`Failed to send welcome email to ${to} (attempt ${attempt}/${maxRetries}):`, error);

      // Wait before retry (exponential backoff: 2s, 4s, 8s)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`Failed to send welcome email to ${to} after ${maxRetries} attempts`);
  // Don't throw - we don't want signup to fail if welcome email fails
};
