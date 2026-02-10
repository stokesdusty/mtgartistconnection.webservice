import nodemailer from 'nodemailer';

// Configure transporter (use environment variables for credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or 'sendgrid', 'ses', etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

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
