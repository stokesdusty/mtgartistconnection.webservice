import nodemailer from "nodemailer";
import dns from "dns";
import { generateWelcomeEmail } from "../templates/welcomeEmail";

// Force Node to prefer IPv4 everywhere (important on AWS / Amplify)
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  family: 4, // force IPv4
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
});

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<void> => {
  try {
    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM ??
        "MTG Artist Connection <noreply@mtgartistconnection.com>",
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

      console.error(
        `Failed to send welcome email to ${to} (attempt ${attempt}/${maxRetries}):`,
        error
      );

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(
    `Failed to send welcome email to ${to} after ${maxRetries} attempts`,
    lastError
  );

  // Intentionally do not throw
};
