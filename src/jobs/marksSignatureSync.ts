import Artist from '../models/Artist';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { findArtistMatches, normalize, splitAlternateNames } from '../services/artistNameMatcher';
import { escapeRegex } from '../utils/regex';
import { generateMarksSignatureSyncEmail } from '../templates/marksSignatureSyncEmail';

// Mark's pinned "source of truth" post listing every artist he takes signatures for
const MARKS_POST_URL = 'https://www.facebook.com/groups/545759985597960/permalink/1257167887790496/';

const NAVIGATION_TIMEOUT_MS = 60_000;

// Names parsed from the post to skip entirely (won't be flagged as unmatched). Useful for group
// entries (e.g. "The England family") or typos that don't warrant an alternate_names entry.
// NOTE: All entries must be lowercase for case-insensitive matching.
const IGNORED_POST_NAMES = new Set<string>([
]);

// Lines whose leading text looks like a name but is actually a price/option label, e.g.
// "Single Sign : $8", "Full Order Alter $275", "Extended deadline 8/15/22"
const NON_NAME_FIRST_WORDS = new Set([
  'single', 'shadow', 'simple', 'full', 'sign', 'mono', 'color', 'alter', 'card', 'cards',
  'extended', 'freed', 'all', 'prices', 'shipping', 'event'
]);

// Lines directly below a standalone name in the Japanese-artist blocks, e.g. "Maiko Aoji" / "Card List : ..."
const PRICE_DETAIL_LINE = /^(card list|single|shadow|sign\b|\$)/i;

// m/d or m/d/yy(yy), not anchored with \b so "Svetlin Velinov8/15/23" still splits correctly
const DATE_PATTERN = /\d{1,2}\/\d{1,2}(\/\d{2,4})?/;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

// Pulls the full post text out of the embedded Relay JSON ("message":{"text":"..."}). The same
// story appears several times in the payload; the longest copy is the full, untruncated message.
const extractPostText = (html: string): string | null => {
  const messagePattern = /"message":\{"text":("(?:[^"\\]|\\.)*")/g;
  let longest: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = messagePattern.exec(html)) !== null) {
    try {
      const text = JSON.parse(match[1]) as string;
      if (!longest || text.length > longest.length) {
        longest = text;
      }
    } catch {
      // Malformed escape sequence in one copy; the other copies will still be tried
    }
  }

  return longest;
};

// Facebook rejects plain HTTP clients without a login, but a real (headless) browser gets the
// public group post server-rendered, including the complete message text in its embedded JSON.
export const fetchPostText = async (): Promise<string> => {
  // Puppeteer ships ESM-only; this project compiles to CommonJS, so it must
  // be loaded via dynamic import() rather than a static import.
  const { default: puppeteer } = await import('puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let html: string;
  try {
    const page = await browser.newPage();
    await page.goto(MARKS_POST_URL, {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    html = await page.content();
  } finally {
    await browser.close();
  }

  const text = extractPostText(html);
  if (!text) {
    throw new Error('Could not find post text in Facebook response (page layout may have changed or login is now required)');
  }

  // Mentions render as markdown links to Facebook profile URLs; keep just the display name
  return text.replace(MARKDOWN_LINK, '$1');
};

const cleanCandidateName = (raw: string): string =>
  raw
    .replace(/^\d+\s*-\s*\.?\s*/, '') // "12-. Jarel Threat"
    .replace(/\(.*$/, '')             // "Maxime Minard (he is new ...", "LA William (Allen)"
    .replace(/[.,:;&\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const looksLikeName = (candidate: string): boolean => {
  if (candidate.length < 3 || candidate.length > 40) return false;
  if (/[:$\d]/.test(candidate)) return false;
  const words = candidate.split(' ');
  if (words.length > 5) return false;
  return !NON_NAME_FIRST_WORDS.has(words[0].toLowerCase());
};

// Best-effort extraction of artist names from the free-form post. Most entries look like
// "Name <due date> $x & $y" or "Name $x & $y"; the Japanese-artist blocks put the name on its own
// line followed by price details. Anything that doesn't fit these shapes is skipped — DB artists
// are matched against the full text separately, so this only feeds the "not in database" report.
export const parseArtistNamesFromPost = (postText: string): string[] => {
  const lines = postText.split('\n').map(line => line.trim());
  const names = new Map<string, string>();

  const addName = (raw: string) => {
    const name = cleanCandidateName(raw);
    if (looksLikeName(name)) {
      const key = normalize(name);
      if (!names.has(key)) {
        names.set(key, name);
      }
    }
  };

  lines.forEach((line, i) => {
    if (!line) return;

    const dateIndex = line.search(DATE_PATTERN);
    const dollarIndex = line.indexOf('$');
    const cutIndexes = [dateIndex, dollarIndex].filter(index => index > 0);

    if (cutIndexes.length > 0) {
      addName(line.slice(0, Math.min(...cutIndexes)));
      return;
    }

    const nextLine = lines.slice(i + 1).find(l => l.length > 0);
    if (nextLine && PRICE_DETAIL_LINE.test(nextLine)) {
      addName(line);
    }
  });

  return Array.from(names.values());
};

export const runMarksSignatureSync = async (): Promise<void> => {
  console.log("Starting Mark's Signature Service sync job...");

  try {
    // 1. Fetch the full text of Mark's pinned artist list post
    console.log("Fetching Mark's Signature Service Facebook post...");
    const postText = await fetchPostText();
    console.log(`Fetched post text (${postText.length.toLocaleString()} characters)`);

    // 2. Get all artists from our database
    const dbArtists = await Artist.find(
      {},
      { name: 1, alternate_names: 1, markssignatureservice: 1 }
    ).lean();
    console.log(`Found ${dbArtists.length} artists in database`);

    // 3. Find every DB artist (by name or alternate name) mentioned anywhere in the post
    const postMatches = findArtistMatches(postText, dbArtists);
    const matchedAliasByName = new Map(postMatches.map(match => [match.name, match.matchedAlias]));
    console.log(`Matched ${postMatches.length} database artists in the post`);

    // 4. Compare against the markssignatureservice flag in both directions
    const inPostNotFlagged: { name: string; matchedAs: string }[] = [];
    const flaggedNotInPost: { name: string }[] = [];

    for (const artist of dbArtists) {
      const isFlagged = artist.markssignatureservice === 'true';
      const matchedAlias = matchedAliasByName.get(artist.name);

      if (matchedAlias && !isFlagged) {
        inPostNotFlagged.push({ name: artist.name, matchedAs: matchedAlias });
      } else if (!matchedAlias && isFlagged) {
        flaggedNotInPost.push({ name: artist.name });
      }
    }

    // 5. Find names listed in the post that don't correspond to any DB artist. A parsed name is
    // accounted for if it matches a DB name/alias outright, or contains an alias that matched
    // (e.g. "Ittoku Single" containing "Ittoku").
    const dbNameKeys = new Set<string>();
    for (const artist of dbArtists) {
      for (const candidate of [artist.name, ...splitAlternateNames(artist.alternate_names)]) {
        dbNameKeys.add(normalize(candidate.trim()));
      }
    }
    const matchedAliasPatterns = postMatches.map(
      match => new RegExp(`(?<!\\w)${escapeRegex(normalize(match.matchedAlias))}(?!\\w)`)
    );

    const postNames = parseArtistNamesFromPost(postText);
    const unmatchedPostNames = postNames.filter(name => {
      const key = normalize(name);
      if (IGNORED_POST_NAMES.has(key) || dbNameKeys.has(key)) return false;
      return !matchedAliasPatterns.some(pattern => pattern.test(key));
    });

    console.log(`Found ${inPostNotFlagged.length} artists in the post not flagged in database`);
    console.log(`Found ${flaggedNotInPost.length} flagged artists not found in the post`);
    console.log(`Found ${unmatchedPostNames.length} post names not matched in database`);

    // 6. Email the admins if there's anything to report
    if (inPostNotFlagged.length > 0 || flaggedNotInPost.length > 0 || unmatchedPostNames.length > 0) {
      const adminUsers = await User.find({ role: 'admin' });

      if (adminUsers.length === 0) {
        console.log('No admin users found to notify');
        return;
      }

      inPostNotFlagged.sort((a, b) => a.name.localeCompare(b.name));
      flaggedNotInPost.sort((a, b) => a.name.localeCompare(b.name));
      unmatchedPostNames.sort((a, b) => a.localeCompare(b));

      const flaggedTotal = dbArtists.filter(artist => artist.markssignatureservice === 'true').length;

      const html = generateMarksSignatureSyncEmail(
        inPostNotFlagged,
        flaggedNotInPost,
        unmatchedPostNames,
        postMatches.length,
        flaggedTotal,
        MARKS_POST_URL
      );

      const today = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      // Send to all admins in parallel; one failure doesn't block the others
      const results = await Promise.allSettled(
        adminUsers.map(admin =>
          sendEmail(admin.email, `Mark's Signature Service Sync Report - ${today}`, html)
        )
      );

      let emailsSent = 0;
      results.forEach((result, i) => {
        const adminId = adminUsers[i]._id;
        if (result.status === 'fulfilled') {
          emailsSent++;
          console.log(`Report sent to user ${adminId}`);
        } else {
          console.error(`Failed to send report to user ${adminId}:`, result.reason);
        }
      });

      console.log(`Mark's Signature Service sync complete: ${emailsSent} emails sent`);
    } else {
      console.log("Mark's Signature Service sync complete: No discrepancies found");
    }

  } catch (error) {
    console.error("Error running Mark's Signature Service sync:", error);
    throw error;
  }
};
