export const generateWelcomeEmail = (): string => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://mtgartistconnection.com';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #507A60; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Welcome to MTG Artist Connection!</h1>
      </div>

      <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-top: 0; color: #333;">
          Thank you for joining MTG Artist Connection!
        </p>

        <p style="font-size: 16px; color: #555; margin: 20px 0; line-height: 1.8;">
          We're your comprehensive resource for connecting with Magic: The Gathering artists. Discover artist social media profiles, view signature examples, browse complete card portfolios with current pricing, check our signing event calendar, and find trusted mail-in signing services—all in one place.
        </p>

        <div style="background-color: #f9f9f9; border-left: 4px solid #507A60; padding: 15px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #507A60; font-size: 18px;">Getting Started</h3>

          <p style="margin: 10px 0; color: #555; line-height: 1.7;">
            <strong>Follow Artists:</strong> Browse our artist database and follow your favorites. You'll receive email updates whenever their profiles are updated or they're added to signing events.
          </p>

          <p style="margin: 10px 0; color: #555; line-height: 1.7;">
            <strong>Monitor States:</strong> Never miss a local signing event! Visit the <strong>Events</strong> section in your <strong>Account Settings</strong> and select the states you'd like to monitor. We'll notify you when new events are added or updated in your area.
          </p>

          <p style="margin: 10px 0; color: #555; line-height: 1.7;">
            <strong>Manage Notifications:</strong> You can adjust your email preferences or turn off notifications completely at any time in your <strong>Account Settings</strong>.
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/"
             style="display: inline-block; background-color: #507A60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 16px;">
            Browse Artists
          </a>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 14px; color: #666;">
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            We will only use your email to contact you for updates on artists that you follow or if events are created or updated in a state that you are following.
          </p>
          <p style="margin-top: 10px;">
            <a href="${frontendUrl}"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Visit MTG Artist Connection
            </a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
