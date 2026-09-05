interface UrlMismatch {
  name: string;
  currentUrl: string;
  expectedUrl: string;
}

interface UnmatchedArtist {
  name: string;
  url: string;
}

export const generateMountainMageSyncEmail = (
  urlMismatches: UrlMismatch[],
  unmatchedArtists: UnmatchedArtist[],
  mountainMageTotal: number,
  dbTotal: number
): string => {
  const urlMismatchesList = urlMismatches
    .map(artist => `<li style="margin-bottom: 5px;"><strong>${artist.name}</strong><br>current: ${artist.currentUrl || '(not set)'}<br>expected: ${artist.expectedUrl}</li>`)
    .join('');

  const unmatchedArtistsList = unmatchedArtists
    .map(artist => `<li style="margin-bottom: 5px;"><strong>${artist.name}</strong> (${artist.url})</li>`)
    .join('');

  const urlMismatchesSection = urlMismatches.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Mountain Mage URL Mismatches</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${urlMismatches.length.toLocaleString()} artists have a <code>mountainmage</code> value in your
      database that doesn't match the URL currently listed on Mountain Mage Signatures.
    </p>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 25px;">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${urlMismatchesList}
      </ul>
    </div>
  ` : '';

  const unmatchedArtistsSection = unmatchedArtists.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Mountain Mage Artists Not Found in Your Database</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${unmatchedArtists.length.toLocaleString()} artists have a page on Mountain Mage Signatures but
      no artist in your database matches their name.
    </p>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px;">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${unmatchedArtistsList}
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
        <p style="margin: 5px 0 0 0; font-size: 14px;">Mountain Mage Signatures Sync Report</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #507A60;">Summary</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            <li>Mountain Mage artists: <strong>${mountainMageTotal.toLocaleString()}</strong></li>
            <li>Database artists: <strong>${dbTotal.toLocaleString()}</strong></li>
            <li>URL mismatches: <strong>${urlMismatches.length.toLocaleString()}</strong></li>
            <li>Mountain Mage artists not matched in DB: <strong>${unmatchedArtists.length.toLocaleString()}</strong></li>
          </ul>
        </div>

        ${urlMismatchesSection}
        ${unmatchedArtistsSection}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #999;">
          <p>
            This is an automated admin report from the Mountain Mage Signatures Sync job.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
