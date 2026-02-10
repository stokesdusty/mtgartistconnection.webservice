export interface EventData {
  eventName: string;
  city: string;
  state: string;
  startDate: Date;
  endDate: Date;
  url?: string;
  artists?: string[];
}

export const generateEventDigestEmail = (events: EventData[]): string => {
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const eventSections = events.map((event) => {
    const dateRange = event.startDate === event.endDate
      ? formatDate(event.startDate)
      : `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`;

    const artistsList = event.artists && event.artists.length > 0
      ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0 0 6px 0; color: #2d4a36; font-size: 13px; font-weight: 600;">
            Artists Attending:
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${event.artists.map(artist => `
              <span style="display: inline-block; background-color: #f0f9f4; border: 1px solid #507A60; color: #2d4a36; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;">
                ${artist}
              </span>
            `).join('')}
          </div>
        </div>
      `
      : '';

    return `
      <div style="background-color: #f9f9f9; border-left: 4px solid #507A60; padding: 16px; margin-bottom: 16px; border-radius: 4px;">
        <h3 style="margin: 0 0 8px 0; color: #2d4a36; font-size: 18px; font-weight: 600;">
          ${event.eventName}
        </h3>
        <p style="margin: 4px 0; color: #555; font-size: 14px;">
          <strong>Location:</strong> ${event.city}, ${event.state}
        </p>
        <p style="margin: 4px 0; color: #555; font-size: 14px;">
          <strong>Date${event.startDate !== event.endDate ? 's' : ''}:</strong> ${dateRange}
        </p>
        ${event.url ? `
          <p style="margin: 8px 0 0 0;">
            <a href="${event.url}" style="color: #507A60; text-decoration: none; font-weight: 500;">
              View Event Details →
            </a>
          </p>
        ` : ''}
        ${artistsList}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Signing Events in Your Area</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 32px;">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #507A60;">
            <h1 style="margin: 0; color: #2d4a36; font-size: 28px; font-weight: 700;">
              🎨 New Signing Events!
            </h1>
            <p style="margin: 8px 0 0 0; color: #666; font-size: 16px;">
              New Magic: The Gathering signing events in your monitored locations
            </p>
          </div>

          <!-- Events -->
          <div style="margin-bottom: 32px;">
            ${eventSections}
          </div>

          <!-- Footer -->
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0; text-align: center;">
            <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
              You're receiving this email because you're monitoring these states for signing events.
            </p>
            <p style="margin: 8px 0; color: #666; font-size: 14px;">
              Manage your monitored locations at
              <a href="${process.env.FRONTEND_URL}/following" style="color: #507A60; text-decoration: none;">
                MTG Artist Connection
              </a>
            </p>
            <p style="margin: 16px 0 0 0; color: #999; font-size: 12px;">
              © ${new Date().getFullYear()} MTG Artist Connection. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};
