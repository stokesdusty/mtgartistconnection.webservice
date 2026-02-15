interface DbArtist {
  name: string;
  scryfall_name: string;
}

export const generateScryfallSyncEmail = (
  missingFromDb: string[],
  notOnScryfall: DbArtist[],
  scryfallTotal: number,
  dbTotal: number
): string => {
  const missingFromDbList = missingFromDb
    .map(name => `<li style="margin-bottom: 5px;">${name}</li>`)
    .join('');

  const notOnScryfallList = notOnScryfall
    .map(artist => `<li style="margin-bottom: 5px;"><strong>${artist.name}</strong> (scryfall_name: ${artist.scryfall_name})</li>`)
    .join('');

  const missingFromDbSection = missingFromDb.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Scryfall Artists Not in Your Database</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${missingFromDb.length.toLocaleString()} artist names from Scryfall don't have a matching
      <code>scryfall_name</code> in your database. These may be new artists or ones you haven't mapped yet.
    </p>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 25px;">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${missingFromDbList}
      </ul>
    </div>
  ` : '';

  const notOnScryfallSection = notOnScryfall.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Your Artists Not Found on Scryfall</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${notOnScryfall.length.toLocaleString()} artists in your database have a <code>scryfall_name</code>
      that doesn't match any name in Scryfall's list. This may indicate a typo or an artist who has been removed.
    </p>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px;">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${notOnScryfallList}
      </ul>
    </div>
  ` : '';

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
            <li>Database artists (with scryfall_name): <strong>${dbTotal.toLocaleString()}</strong></li>
            <li>Scryfall artists not in DB: <strong>${missingFromDb.length.toLocaleString()}</strong></li>
            <li>DB artists not on Scryfall: <strong>${notOnScryfall.length.toLocaleString()}</strong></li>
          </ul>
        </div>

        ${missingFromDbSection}
        ${notOnScryfallSection}

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
