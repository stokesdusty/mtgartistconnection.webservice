import ArtistChange from '../models/ArtistChange';

// Internal bookkeeping fields that followers don't care about.
const NON_NOTIFIABLE_FIELDS = new Set(['filename', 'scryfall_name', 'alternate_names', 'lastSocialSync']);

// The edit form submits every field, so treat missing/null/blank as the same value.
const normalize = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

/**
 * Returns the follower-visible fields whose values actually differ between
 * the current artist record and the incoming update.
 */
export const getNotifiableChangedFields = (
  current: Record<string, any>,
  updates: Record<string, any>,
): string[] =>
  Object.entries(updates)
    .filter(([key, value]) =>
      value !== undefined &&
      value !== null &&
      !NON_NOTIFIABLE_FIELDS.has(key) &&
      normalize(current[key]) !== normalize(value))
    .map(([key]) => key);

/**
 * Records an 'update' ArtistChange so followers see it in the next daily
 * artist digest. No-op when nothing follower-visible changed.
 */
export const recordArtistUpdate = async (
  artistName: string,
  current: Record<string, any>,
  updates: Record<string, any>,
): Promise<void> => {
  const fieldsChanged = getNotifiableChangedFields(current, updates);
  if (fieldsChanged.length === 0) return;

  await ArtistChange.create({
    artistName,
    changeType: 'update',
    fieldsChanged,
    timestamp: new Date(),
    processed: false,
  });
};
