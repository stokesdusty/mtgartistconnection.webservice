import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { generateWelcomeEmail } from "../templates/welcomeEmail";

// Create SESv2 client
const sesClient = new SESv2Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Nodemailer transporter configured for SESv2
const transporter = nodemailer.createTransport({
  SES: { sesClient, SendEmailCommand },
});

// Generic send email function
export const sendEmail = async (to: string, subject: string, html: string) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "MTG Artist Connection <noreply@mtgartistconnection.com>",
    to,
    subject,
    html,
  });
};

// Welcome email with retry
export const sendWelcomeEmail = async (to: string) => {
  const html = generateWelcomeEmail();
  const subject = "Welcome to MTG Artist Connection!";

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendEmail(to, subject, html);
      console.log(`Welcome email sent to ${to}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Failed to send welcome email to ${to} (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`Failed to send welcome email to ${to} after ${maxRetries} attempts`, lastError);
};
