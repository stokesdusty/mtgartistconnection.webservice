export const generateNewArtistDigestEmail = (artistNames: string[]): string => {
  const artistList = artistNames.map(name => `
      <li style="margin-bottom: 10px; padding: 12px 15px; background-color: #f8f9fa; border-radius: 6px; border-left: 4px solid #507A60;">
        <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/artist/${encodeURIComponent(name)}"
           style="color: #507A60; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${name}
        </a>
      </li>
  `).join('');

  const artistCount = artistNames.length;
  const artistWord = artistCount === 1 ? 'artist has' : 'artists have';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #507A60; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">MTG Artist Connection</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px;">New Artists Added</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-top: 0; color: #555;">
          ${artistCount} new ${artistWord} been added to MTG Artist Connection today:
        </p>

        <ul style="list-style: none; padding: 0; margin: 20px 0;">
          ${artistList}
        </ul>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/artists"
             style="display: inline-block; background-color: #507A60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Browse All Artists
          </a>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 14px; color: #666;">
          <p>
            <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/settings"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Manage email preferences
            </a>
          </p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            You're receiving this email because you have new artist notifications enabled.
          </p>
          <p style="margin-top: 10px;">
            <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}"
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
