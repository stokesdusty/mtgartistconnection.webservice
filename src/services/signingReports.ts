import { SIGNING_EXTRA_KINDS, SIGNING_METHODS, SigningExtraKind, SigningMethod } from '../models/SigningReport';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_NOTE_LENGTH = 280;
export const MAX_PRICE = 500;
export const MAX_EXTRA_PRICE = 2000;
export const MAX_REPORT_AGE_YEARS = 5;
// Only recent reports feed the summary; older prices mislead more than they help.
export const SUMMARY_WINDOW_MONTHS = 24;
// Users with this many approved reports skip review when the report is plain numbers.
export const TRUSTED_REPORTER_THRESHOLD = 3;
// A price this many times above (or below) the artist's median always goes to review.
export const OUTLIER_FACTOR = 3;
export const DAILY_REPORT_LIMIT = 5;
export const PER_ARTIST_COOLDOWN_DAYS = 7;

const METHODS_WITH_TURNAROUND: SigningMethod[] = ['mail_in', 'signing_service'];
const METHODS_WITH_EVENT: SigningMethod[] = ['convention', 'store_event'];

const EMAIL_PATTERN = /[\w.+-]+\s*(@|\(at\)|\[at\])\s*[\w-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i;
// North American style numbers; leaves dates like 2026-08-15 alone.
const PHONE_PATTERN = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|net|org|io|co|me|art|shop|store|link|us|uk|ca)\b/i;
// Case-sensitive on purpose: "123 Main Street" matches, "2 hours down the road" doesn't.
const STREET_PATTERN = /\b\d{1,5}\s+([A-Z][\w']*\s){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b/;
const PO_BOX_PATTERN = /\bp\.?\s?o\.?\s+box\b/i;

/** True when text looks like it carries an email, phone number, address or link. */
export function containsContactDetails(text: string): boolean {
    return [EMAIL_PATTERN, PHONE_PATTERN, URL_PATTERN, STREET_PATTERN, PO_BOX_PATTERN].some((p) => p.test(text));
}

export interface SigningReportInput {
    signedOn: string;
    method: string;
    pricePerSig: number;
    freeCount?: number | null;
    perPersonLimit?: number | null;
    extras?: { kind: string; price: number }[] | null;
    turnaroundWeeks?: number | null;
    eventId?: string | null;
    serviceName?: string | null;
    note?: string | null;
}

export interface CleanSigningReport {
    signedOn: Date;
    method: SigningMethod;
    pricePerSig: number;
    freeCount?: number;
    perPersonLimit?: number;
    extras: { kind: SigningExtraKind; price: number }[];
    turnaroundWeeks?: number;
    eventId?: string;
    serviceName?: string;
    note?: string;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;
const isPresent = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

const optionalInt = (value: number | null | undefined, label: string, max: number): number | undefined => {
    if (!isPresent(value)) return undefined;
    if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new Error(`${label} must be a whole number between 0 and ${max}.`);
    }
    return value;
};

/** Validates and normalises a submitted report. Throws an Error with a user-facing message. */
export function validateSigningReport(input: SigningReportInput, now: Date = new Date()): CleanSigningReport {
    const method = input.method as SigningMethod;
    if (!SIGNING_METHODS.includes(method)) throw new Error('Pick how you got the signature.');

    const signedOn = new Date(input.signedOn);
    if (Number.isNaN(signedOn.getTime())) throw new Error('Enter the date of the signing.');
    if (signedOn.getTime() > now.getTime() + DAY_MS) throw new Error("The signing date can't be in the future.");
    const oldest = new Date(now);
    oldest.setFullYear(oldest.getFullYear() - MAX_REPORT_AGE_YEARS);
    if (signedOn < oldest) throw new Error(`Reports must be from the last ${MAX_REPORT_AGE_YEARS} years.`);

    if (typeof input.pricePerSig !== 'number' || !Number.isFinite(input.pricePerSig) || input.pricePerSig < 0 || input.pricePerSig > MAX_PRICE) {
        throw new Error(`Price per signature must be between $0 and $${MAX_PRICE}.`);
    }

    const extras = (input.extras ?? []).map((extra) => {
        if (!SIGNING_EXTRA_KINDS.includes(extra.kind as SigningExtraKind)) throw new Error('Unknown extra type.');
        if (typeof extra.price !== 'number' || !Number.isFinite(extra.price) || extra.price < 0 || extra.price > MAX_EXTRA_PRICE) {
            throw new Error(`Extra prices must be between $0 and $${MAX_EXTRA_PRICE}.`);
        }
        return { kind: extra.kind as SigningExtraKind, price: roundCents(extra.price) };
    });
    if (new Set(extras.map((e) => e.kind)).size !== extras.length) throw new Error('List each extra only once.');

    const clean: CleanSigningReport = {
        signedOn,
        method,
        pricePerSig: roundCents(input.pricePerSig),
        freeCount: optionalInt(input.freeCount, 'Free signatures', 1000),
        perPersonLimit: optionalInt(input.perPersonLimit, 'Per-person limit', 1000),
        extras,
    };

    if (METHODS_WITH_TURNAROUND.includes(method)) {
        clean.turnaroundWeeks = optionalInt(input.turnaroundWeeks, 'Turnaround', 104);
    }
    if (METHODS_WITH_EVENT.includes(method) && input.eventId) {
        clean.eventId = input.eventId;
    }
    if (method === 'signing_service') {
        const serviceName = input.serviceName?.trim();
        if (serviceName) {
            if (serviceName.length > 80) throw new Error('Service name is too long.');
            if (containsContactDetails(serviceName)) throw new Error("Service name can't include contact details.");
            clean.serviceName = serviceName;
        }
    }

    const note = input.note?.trim();
    if (note) {
        if (note.length > MAX_NOTE_LENGTH) throw new Error(`Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
        if (containsContactDetails(note)) {
            throw new Error("Notes can't include emails, phone numbers, addresses or links. Contact info only comes from the artist's official channels.");
        }
        clean.note = note;
    }

    return clean;
}

/** Returns a user-facing message when the user has hit a submission limit, else null. */
export function rateLimitMessage(reportsLast24h: number, reportsForArtistInCooldown: number): string | null {
    if (reportsLast24h >= DAILY_REPORT_LIMIT) return `You can submit up to ${DAILY_REPORT_LIMIT} reports a day. Try again tomorrow.`;
    if (reportsForArtistInCooldown > 0) return `You've already reported on this artist in the last ${PER_ARTIST_COOLDOWN_DAYS} days.`;
    return null;
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : roundCents((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Whether a report must wait for an admin rather than going live immediately. */
export function needsReview(report: { note?: string; pricePerSig: number }, approvedByUser: number, artistMedian: number | null): boolean {
    if (report.note) return true;
    if (approvedByUser < TRUSTED_REPORTER_THRESHOLD) return true;
    if (artistMedian === null) return false;
    if (artistMedian === 0) return report.pricePerSig > 0;
    return report.pricePerSig > artistMedian * OUTLIER_FACTOR || report.pricePerSig < artistMedian / OUTLIER_FACTOR;
}

export const summaryWindowStart = (now: Date = new Date()): Date => {
    const start = new Date(now);
    start.setMonth(start.getMonth() - SUMMARY_WINDOW_MONTHS);
    return start;
};

export interface SigningReportSummary {
    count: number;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    latestSignedOn: string | null;
    byMethod: { method: SigningMethod; count: number; medianPrice: number | null }[];
}

/** Summarises approved reports; callers pass reports already filtered to approved ones. */
export function summarizeReports(
    reports: { signedOn: Date; method: SigningMethod; pricePerSig: number }[],
    now: Date = new Date(),
): SigningReportSummary {
    const start = summaryWindowStart(now);
    const recent = reports.filter((r) => new Date(r.signedOn) >= start);
    const prices = recent.map((r) => r.pricePerSig);

    const groups = new Map<SigningMethod, number[]>();
    for (const r of recent) groups.set(r.method, [...(groups.get(r.method) ?? []), r.pricePerSig]);

    const latest = recent.reduce<Date | null>((acc, r) => {
        const d = new Date(r.signedOn);
        return !acc || d > acc ? d : acc;
    }, null);

    return {
        count: recent.length,
        medianPrice: median(prices),
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        latestSignedOn: latest ? latest.toISOString() : null,
        byMethod: [...groups.entries()]
            .map(([method, ps]) => ({ method, count: ps.length, medianPrice: median(ps) }))
            .sort((a, b) => b.count - a.count),
    };
}
