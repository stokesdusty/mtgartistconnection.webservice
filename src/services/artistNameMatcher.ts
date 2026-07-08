import { escapeRegex } from '../utils/regex';

export interface ArtistCorpusEntry {
  name: string;
  alternate_names?: string | null;
}

export interface ArtistMatch {
  name: string;
  matchedAlias: string;
  snippets: string[];
  occurrences: number;
}

const ALTERNATE_NAME_SPLIT = /,|;|\/|\baka\b|\n/i;
const MIN_CANDIDATE_LENGTH = 3;
const SNIPPET_RADIUS = 60;
const MAX_SNIPPETS_PER_ARTIST = 5;

export function splitAlternateNames(raw?: string | null): string[] {
  if (!raw) return [];
  const trimmedRaw = raw.trim();
  if (!trimmedRaw) return [];

  const parts = trimmedRaw
    .split(ALTERNATE_NAME_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = new Set(parts);
  candidates.add(trimmedRaw);

  return Array.from(candidates);
}

// Lowercase + strip accents one Unicode codepoint at a time, always emitting
// exactly one output character per input codepoint. This keeps `normalize()`
// index-aligned with the original string so a regex match index found in the
// normalized page text can be used directly to slice the original text for
// snippet display — no separate index-mapping table needed.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

function normalizeChar(ch: string): string {
  const decomposed = ch.normalize('NFKD').replace(COMBINING_MARKS, '');
  return (decomposed[0] ?? ch).toLowerCase();
}

export function normalize(text: string): string {
  return Array.from(text).map(normalizeChar).join('');
}

// Builds a regex source string from a candidate name: normalized + escaped,
// with internal whitespace runs loosened to `\s+` so minor spacing
// differences between the DB name and page text still match.
function buildCandidatePattern(candidate: string): string {
  const escaped = escapeRegex(normalize(candidate));
  return escaped.replace(/\s+/g, '\\s+');
}

function buildSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function findArtistMatches(pageText: string, corpus: ArtistCorpusEntry[]): ArtistMatch[] {
  const normalizedPageText = normalize(pageText);
  const results: ArtistMatch[] = [];

  for (const artist of corpus) {
    const candidates = Array.from(
      new Set([artist.name, ...splitAlternateNames(artist.alternate_names)])
    ).filter((candidate) => normalize(candidate).length >= MIN_CANDIDATE_LENGTH);

    let occurrences = 0;
    let matchedAlias: string | null = null;
    const snippets: string[] = [];

    for (const candidate of candidates) {
      const pattern = buildCandidatePattern(candidate);
      if (!pattern) continue;

      // (?<!\w)/(?!\w) rather than \b: \b requires a word/non-word transition,
      // which fails to anchor at all when a candidate itself starts or ends on
      // a non-word character (e.g. "Foo (Bar)+" followed by a space). Lookaround
      // just checks the adjacent text character isn't alphanumeric, regardless
      // of what the candidate's own edge character is.
      const regex = new RegExp(`(?<!\\w)${pattern}(?!\\w)`, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(normalizedPageText)) !== null) {
        occurrences++;
        if (!matchedAlias) matchedAlias = candidate;
        if (snippets.length < MAX_SNIPPETS_PER_ARTIST) {
          snippets.push(buildSnippet(pageText, match.index, match[0].length));
        }
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    }

    if (occurrences > 0 && matchedAlias) {
      results.push({ name: artist.name, matchedAlias, snippets, occurrences });
    }
  }

  return results;
}
