import { SITE_URL } from './siteUrl';
import { badge, chip, monoLabel, palette, renderEmail, subscriberFooter, textLink } from './emailLayout';

export interface EventData {
  eventName: string;
  city: string;
  state: string;
  startDate: Date;
  endDate: Date;
  url?: string;
  artists?: string[];
  changeType?: 'new_event' | 'artist_added';
  artistAdded?: string; // For backwards compatibility
  artistsAdded?: string[]; // For multiple artist additions
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

    const isArtistAddition = event.changeType === 'artist_added';
    const newArtistsSet = new Set(event.artistsAdded || (event.artistAdded ? [event.artistAdded] : []));
    const artistCount = newArtistsSet.size;

    const changeLabel = isArtistAddition && artistCount > 0
      ? badge(artistCount === 1 ? 'NEW ARTIST ADDED' : `${artistCount} NEW ARTISTS ADDED`)
      : badge('NEW EVENT', 'accent');

    const artistsList = event.artists && event.artists.length > 0
      ? `
        <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid ${palette.line};">
          <div style="margin-bottom: 10px;">${monoLabel('Artists Attending')}</div>
          <div>
            ${event.artists.map(artist => {
              const isNewArtist = newArtistsSet.has(artist);
              return chip(`${artist}${isNewArtist ? ' ✨' : ''}`, isNewArtist ? 'warn' : 'accent', isNewArtist);
            }).join('')}
          </div>
        </div>
      `
      : '';

    return `
      <div style="margin-top: 20px; padding: 20px; background-color: ${palette.surface}; border: 1px solid ${palette.line}; border-radius: 12px;">
        <div style="margin-bottom: 10px;">${changeLabel}</div>
        <h2 style="margin: 0 0 10px; font-size: 20px; line-height: 1.25; font-weight: 600; letter-spacing: -0.02em; color: ${palette.fg};">
          ${event.eventName}
        </h2>
        <p style="margin: 2px 0; font-size: 14px; color: ${palette.muted};">
          <strong>Location:</strong> ${event.city}, ${event.state}
        </p>
        <p style="margin: 2px 0; font-size: 14px; color: ${palette.muted};">
          <strong>Date${event.startDate !== event.endDate ? 's' : ''}:</strong> ${dateRange}
        </p>
        ${event.url ? `
          <p style="margin: 12px 0 0; font-size: 14px;">
            ${textLink(event.url, 'View Event Details &rarr;')}
          </p>
        ` : ''}
        ${artistsList}
      </div>
    `;
  }).join('');

  const eventLabel = `${events.length} event${events.length === 1 ? '' : 's'}`;

  return renderEmail({
    title: 'New Signing Events in Your Area',
    preheader: `Signing updates for ${eventLabel} in the states you monitor.`,
    eyebrow: `Local signings &middot; ${eventLabel}`,
    heading: 'Signing events',
    headingMuted: 'near you.',
    intro: 'New and updated Magic: The Gathering signing events in the states you monitor.',
    body: `
      ${eventSections}
      <p style="margin: 24px 0 0; text-align: center; font-size: 14px;">
        ${textLink(`${SITE_URL}/calendar`, 'See the full event calendar &rarr;')}
      </p>
    `,
    footer: subscriberFooter(
      `You're receiving this email because you're monitoring these states for signing events.`,
      [[`${SITE_URL}/following`, 'Manage monitored states'], [`${SITE_URL}/settings`, 'Manage email preferences']],
    ),
  });
};
