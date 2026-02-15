export const generateMissingArtistsEmail = (
  missingArtists: string[],
  scryfallTotal: number,
  dbTotal: number
): string => {
  const artistList = missingArtists
    .map(name => `<li style="margin-bottom: 5px;">${name}</li>`)
    .join('');

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
        <p style="margin: 5px 0 0 0; font-size: 14px;">Scryfall Artist Sync Report</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #507A60;">Summary</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            <li>Scryfall artists: <strong>${scryfallTotal.toLocaleString()}</strong></li>
            <li>Database artists: <strong>${dbTotal.toLocaleString()}</strong></li>
            <li>Missing artists: <strong>${missingArtists.length.toLocaleString()}</strong></li>
          </ul>
        </div>

        <h2 style="color: #507A60; margin-bottom: 15px;">Artists Not Found in Database</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
          The following ${missingArtists.length.toLocaleString()} artist names from Scryfall don't match any artist name
          or scryfall_name in your database. Some may be formatting differences (e.g., "John Avon" vs "John D. Avon").
        </p>
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
          To reduce false positives, add the <code>scryfall_name</code> field to existing artists where the
          naming differs from your database.
        </p>

        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px;">
          <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
            ${artistList}
          </ul>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #999;">
          <p>
            This is an automated admin report from the Scryfall Artist Sync job.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
