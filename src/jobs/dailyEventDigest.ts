import EventChange from '../models/EventChange';
import User from '../models/User';
import MapArtistToEvent from '../models/MapArtistToEvent';
import { sendEmail } from '../services/emailService';
import { generateEventDigestEmail, EventData } from '../templates/eventDigestEmail';

export const runDailyEventDigest = async (): Promise<void> => {
  console.log('Starting daily event digest job...');

  try {
    // Get all unprocessed event changes
    const eventChanges = await EventChange.find({ processed: false });

    if (eventChanges.length === 0) {
      console.log('No new events to process');
      return;
    }

    console.log(`Found ${eventChanges.length} new event(s) to process`);

    // Fetch artists for all events
    const eventIds = eventChanges.map(change => change.eventId);
    const artistMappings = await MapArtistToEvent.find({ eventId: { $in: eventIds } });

    // Group artists by event ID
    const artistsByEventId: { [eventId: string]: string[] } = {};
    artistMappings.forEach((mapping) => {
      // @ts-ignore
      const eventId = mapping.eventId;
      if (!artistsByEventId[eventId]) {
        artistsByEventId[eventId] = [];
      }
      // @ts-ignore
      artistsByEventId[eventId].push(mapping.artistName);
    });

    // Group changes by event ID first to combine multiple changes for same event
    const changesByEventId: { [eventId: string]: any[] } = {};
    eventChanges.forEach((change) => {
      if (!change.state) return; // Skip events without state

      if (!changesByEventId[change.eventId]) {
        changesByEventId[change.eventId] = [];
      }
      changesByEventId[change.eventId].push(change);
    });

    // Now create combined event data by state
    const eventsByState: { [state: string]: EventData[] } = {};

    Object.entries(changesByEventId).forEach(([eventId, changes]) => {
      // Use the first change for basic event info
      const firstChange = changes[0];
      const state = firstChange.state;

      if (!eventsByState[state]) {
        eventsByState[state] = [];
      }

      // Determine if this is a new event or has artist additions
      const hasNewEvent = changes.some((c: any) => (c.changeType || 'new_event') === 'new_event');
      const artistAdditions = changes
        .filter((c: any) => c.changeType === 'artist_added')
        .map((c: any) => c.artistName)
        .filter(Boolean);

      eventsByState[state].push({
        eventName: firstChange.eventName,
        city: firstChange.city,
        state: state,
        startDate: firstChange.startDate,
        endDate: firstChange.endDate,
        url: firstChange.url,
        artists: artistsByEventId[eventId] || [],
        changeType: hasNewEvent ? 'new_event' : 'artist_added',
        artistsAdded: artistAdditions,
      });
    });

    const statesWithChanges = Object.keys(eventsByState);
    console.log(`Events in states: ${statesWithChanges.join(', ')}`);

    // Find all users monitoring these states
    const query: any = {
      monitoredStates: { $in: statesWithChanges },
      'emailPreferences.localSigningEvents': true
    };

    // TESTING MODE: Only send to admins in production
    if (process.env.NODE_ENV === 'production') {
      query.role = 'admin';
      console.log('Running in PRODUCTION mode - only sending to admins');
    }

    const allMonitoringUsers = await User.find(query);
    console.log(`Found ${allMonitoringUsers.length} user(s) monitoring these states`);

    if (allMonitoringUsers.length === 0) {
      console.log('No users to notify');
      // Still mark events as processed
      await EventChange.updateMany(
        { processed: false },
        { $set: { processed: true, processedAt: new Date() } }
      );
      return;
    }

    // Build and send individual digests
    const emailPromises: Promise<void>[] = [];

    for (const user of allMonitoringUsers) {
      // @ts-ignore
      const userMonitoredStates = user.monitoredStates || [];

      // Collect all events in states this user monitors
      const userEvents: EventData[] = [];
      userMonitoredStates.forEach((state: string) => {
        if (eventsByState[state]) {
          userEvents.push(...eventsByState[state]);
        }
      });

      if (userEvents.length === 0) continue;

      // Generate email
      const emailHtml = generateEventDigestEmail(userEvents);
      const eventCount = userEvents.length; // Already unique events since we combined them
      const hasArtistAdditions = userEvents.some(e => e.changeType === 'artist_added');
      const hasNewEvents = userEvents.some(e => e.changeType === 'new_event' || !e.changeType);

      let subject = '';
      if (hasNewEvents && hasArtistAdditions) {
        subject = eventCount === 1
          ? 'Signing Event Update in Your Area'
          : `${eventCount} Signing Event Updates in Your Area`;
      } else if (hasArtistAdditions) {
        subject = eventCount === 1
          ? 'Artist Added to Event in Your Area'
          : `Artists Added to Events in Your Area`;
      } else {
        subject = eventCount === 1
          ? 'New Signing Event in Your Area'
          : `${eventCount} New Signing Events in Your Area`;
      }

      // @ts-ignore
      emailPromises.push(sendEmail(user.email, subject, emailHtml));
      // @ts-ignore
      console.log(`Queued email for ${user.email} with ${userEvents.length} event(s)`);
    }

    // Send all emails
    await Promise.all(emailPromises);
    console.log(`Successfully sent ${emailPromises.length} event digest email(s)`);

    // Mark all events as processed
    await EventChange.updateMany(
      { processed: false },
      { $set: { processed: true, processedAt: new Date() } }
    );

    console.log('Daily event digest job completed successfully');
  } catch (error) {
    console.error('Error in daily event digest job:', error);
    throw error;
  }
};
