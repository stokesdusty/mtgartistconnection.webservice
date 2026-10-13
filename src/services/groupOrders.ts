import { randomBytes } from 'crypto';
import { CUSTOM_ITEM_STATUSES, CustomItemStatus } from '../models/GroupOrderParticipant';
import { GROUP_ORDER_STATUSES, GroupOrderStatus, PAYMENT_TIMINGS, PaymentTiming } from '../models/SigningBatch';

// Rules for shared group orders ("signing runs"). Pure functions over plain data, so the
// resolvers stay thin and every rule here is unit-tested. Any logged-in user can organize,
// and every join waits for the organizer's approval.

export const MAX_SIGNATURE_TYPES = 10;
export const MAX_ORDER_ARTISTS = 100;
export const MAX_RETURN_OPTIONS = 10;
export const MAX_GRID_PRICE = 2000;
export const MAX_PARTICIPANT_FEE = 500;
export const MAX_RETURN_PRICE = 200;
export const MAX_CAP = 1000;
export const MAX_ROW_QUANTITY = 100;
export const MAX_TERMS_LENGTH = 4000;

// ─── Shapes ──────────────────────────────────────────────────────────────────

export interface SignatureType { id: string; label: string }
export interface ArtistPrice { signatureTypeId: string; price: number | null }
export interface OrderArtist { name: string; cap: number | null; prices: ArtistPrice[] }
export interface ReturnOption { id: string; label: string; price: number }

export interface GroupOrderSettings {
    signatureTypes: SignatureType[];
    artists: OrderArtist[];
    participantFee: number;
    returnOptions: ReturnOption[];
    cutoff: Date | null;
    maxCardsPerParticipant: number | null;
    paymentTiming: PaymentTiming;
    publicTerms: string;
    privateInstructions: string;
    organizerDiscordName: string;
}

export interface GroupOrder extends GroupOrderSettings {
    status: GroupOrderStatus;
}

/** The parts of a card row the rules look at. `participantId` may be an ObjectId. */
export interface OrderRow {
    rowId: string;
    participantId: unknown;
    artist: string;
    signatureTypeId: string;
    quantity: number;
    status: string;
    receivedQuantity?: number | null;   // the organizer's check-in count
}

export interface CustomItem { id?: string; quantity: number; price: number | null; status: string }
export interface Payment { amount: number; confirmedAt: Date | null }

export interface ParticipantForBalance {
    id: unknown;
    payments: Payment[];
    customItems: CustomItem[];
    returnOptionId: string | null;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const sameId = (a: unknown, b: unknown) => a !== null && a !== undefined && String(a) === String(b);
const activeQuantity = (rows: OrderRow[]) =>
    rows.filter((r) => r.status !== 'not-signed').reduce((sum, r) => sum + r.quantity, 0);

export const newInviteToken = () => randomBytes(16).toString('base64url');

// ─── Discord names ───────────────────────────────────────────────────────────

// Current Discord usernames: 2–32 of a–z, 0–9, "_" and ".", no "..". Legacy names: "name#1234".
const DISCORD_USERNAME = /^(?!.*\.\.)[a-z0-9_.]{2,32}$/;
const LEGACY_DISCORD_NAME = /^[^@#:`]{2,32}#\d{4}$/;

/** Light clean-up and validation; '' means none given. Not verified against Discord. */
export function normalizeDiscordName(input: string | null | undefined): string {
    const trimmed = (input ?? '').trim().replace(/^@/, '');
    if (!trimmed) return '';
    if (LEGACY_DISCORD_NAME.test(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    if (DISCORD_USERNAME.test(lower)) return lower;
    throw new Error('Discord names are 2–32 characters: letters, numbers, "_" and "." (or an older name#1234).');
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export const ORDER_TRANSITIONS: Record<GroupOrderStatus, GroupOrderStatus[]> = {
    draft:      ['open', 'cancelled'],
    open:       ['closed', 'cancelled'],
    // Reopening covers an organizer extending the cutoff.
    closed:     ['open', 'at-event', 'cancelled'],
    'at-event': ['returning'],
    returning:  ['complete'],
    complete:   [],
    cancelled:  [],
};

export function assertOrderTransition(from: GroupOrderStatus, to: GroupOrderStatus): void {
    if (!GROUP_ORDER_STATUSES.includes(to)) throw new Error('Unknown order status.');
    if (!ORDER_TRANSITIONS[from].includes(to)) throw new Error(`An order can't go from ${from} to ${to}.`);
}

export type ParticipantAction = 'join' | 'editCards' | 'markReadyToShip' | 'setInboundTracking' | 'setReturnOption' | 'reportPayment' | 'updateNotes';

// What approved participants can do at each stage. Payments stay open through the end so
// pay-after-signing orders, partial payments and refunds can all be recorded.
const PARTICIPANT_ACTIONS: Record<GroupOrderStatus, ParticipantAction[]> = {
    draft:      [],
    open:       ['join', 'editCards', 'markReadyToShip', 'setInboundTracking', 'setReturnOption', 'reportPayment', 'updateNotes'],
    closed:     ['markReadyToShip', 'setInboundTracking', 'setReturnOption', 'reportPayment', 'updateNotes'],
    'at-event': ['reportPayment', 'updateNotes'],
    returning:  ['reportPayment', 'updateNotes'],
    complete:   ['reportPayment'],
    cancelled:  [],
};

export const participantCan = (action: ParticipantAction, status: GroupOrderStatus) =>
    PARTICIPANT_ACTIONS[status].includes(action);

export type OrganizerAction = 'checkIn' | 'returnTracking' | 'markRows' | 'customItems' | 'recordPayment';

// What the organizer can do at each stage beyond setup. Payments stay open after the end
// (and on cancelled orders) so refunds can still be recorded.
const ORGANIZER_ACTIONS: Record<GroupOrderStatus, OrganizerAction[]> = {
    draft:      [],
    open:       ['checkIn', 'customItems', 'recordPayment', 'markRows'],
    closed:     ['checkIn', 'customItems', 'recordPayment', 'markRows'],
    'at-event': ['checkIn', 'customItems', 'recordPayment', 'markRows', 'returnTracking'],
    returning:  ['customItems', 'recordPayment', 'markRows', 'returnTracking'],
    complete:   ['recordPayment', 'returnTracking'],
    cancelled:  ['recordPayment', 'returnTracking'],
};

export const organizerCan = (action: OrganizerAction, status: GroupOrderStatus) =>
    ORGANIZER_ACTIONS[status].includes(action);

export const MAX_PAYMENT = 10000;
export const MAX_NOTE = 200;
export const MAX_NOTES_TO_ORGANIZER = 1000;
export const MAX_TRACKING = 100;

/** Cleans optional free text. Throws with a user-facing message when it's too long. */
export function cleanText(value: string | null | undefined, label: string, max: number): string {
    const clean = (value ?? '').trim();
    if (clean.length > max) throw new Error(`${label} is limited to ${max} characters.`);
    return clean;
}

/**
 * A payment amount in dollars, rounded to cents. Participants only report money they sent;
 * the organizer can also record a refund as a negative amount.
 */
export function validatePaymentAmount(amount: number, allowRefund: boolean): number {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_PAYMENT) {
        throw new Error(`Enter an amount up to $${MAX_PAYMENT}.`);
    }
    if (amount < 0 && !allowRefund) throw new Error('Enter the amount you sent.');
    return fromCents(toCents(amount));
}

export interface CustomItemInput {
    label: string;
    artistName?: string | null;
    quantity: number;
    price?: number | null;
    status?: string | null;
    note?: string | null;
}

/** Validates an organizer's custom item (artist proof, print, playmat...). Price may be left pending. */
export function validateCustomItem(input: CustomItemInput) {
    const label = cleanText(input.label, 'Item name', 80);
    if (!label) throw new Error('Name the item, e.g. "Lightning Bolt AP".');
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_ROW_QUANTITY) {
        throw new Error(`Quantity must be between 1 and ${MAX_ROW_QUANTITY}.`);
    }
    const status = (input.status ?? 'requested') as CustomItemStatus;
    if (!CUSTOM_ITEM_STATUSES.includes(status)) throw new Error('Unknown item status.');
    return {
        label,
        artistName: cleanText(input.artistName, 'Artist', 100),
        quantity: input.quantity,
        price: input.price === null || input.price === undefined ? null : money(input.price, 'Item prices', MAX_GRID_PRICE),
        status,
        note: cleanText(input.note, 'Item notes', MAX_NOTE),
    };
}

export const ROW_OUTCOMES = ['collecting', 'signed', 'not-signed'] as const;
export type RowOutcome = typeof ROW_OUTCOMES[number];

/** Validates marking cards signed / not signed at the event. Not signed needs a reason. */
export function validateRowOutcome(status: string, reason: string | null | undefined): { status: RowOutcome; notSignedReason: string } {
    if (!ROW_OUTCOMES.includes(status as RowOutcome)) throw new Error('Unknown card status.');
    const notSignedReason = status === 'not-signed' ? cleanText(reason, 'The reason', 100) : '';
    if (status === 'not-signed' && !notSignedReason) throw new Error("Say why the cards weren't signed, e.g. the artist didn't show.");
    return { status: status as RowOutcome, notSignedReason };
}

/** Validates check-in counts: one per card, each a whole number from 0 up to what was sent. */
export function validateCheckInCounts(rows: OrderRow[], counts: { rowId: string; receivedQuantity: number }[]) {
    const byId = new Map(rows.map((r) => [r.rowId, r]));
    return counts.map(({ rowId, receivedQuantity }) => {
        const row = byId.get(rowId);
        if (!row) throw new Error("A card in the check-in isn't in their order.");
        if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0 || receivedQuantity > MAX_ROW_QUANTITY) {
            throw new Error('Received counts must be whole numbers.');
        }
        return { rowId, receivedQuantity };
    });
}

/**
 * A fingerprint of what's on someone's artist sheet (artist + signature type + count), taken
 * when they mark ready to ship, so a later change can prompt them to reprint.
 */
export function sheetSignature(rows: Pick<OrderRow, 'artist' | 'signatureTypeId' | 'quantity'>[]): string {
    const totals = new Map<string, number>();
    for (const r of rows) {
        const key = `${r.artist}\u0000${r.signatureTypeId}`;
        totals.set(key, (totals.get(key) ?? 0) + r.quantity);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}\u0000${n}`).join('\u0001');
}

/** Participants can leave until the organizer has their package. */
export const canLeave = (participant: { status: string; receivedAt: Date | null }) =>
    (participant.status === 'requested' || participant.status === 'approved') && !participant.receivedAt;

type StatusAndCutoff = { status: GroupOrderStatus; cutoff: Date | null };

/** An open order counts as closed once its cutoff passes, so no scheduled job is needed. */
export const effectiveOrderStatus = (order: StatusAndCutoff, now: Date = new Date()): GroupOrderStatus =>
    order.status === 'open' && order.cutoff && now > order.cutoff ? 'closed' : order.status;

/** Checks an organizer's status change against where the order really is. */
export function assertStatusChange(order: StatusAndCutoff, to: GroupOrderStatus, now: Date = new Date()): void {
    assertOrderTransition(effectiveOrderStatus(order, now), to);
    if (to === 'open' && order.cutoff && now > order.cutoff) throw new Error('The cutoff has passed. Move it later to reopen the order.');
}

/** Whether payment is due yet. After-signing orders are due once the cards are on their way back. */
export const isPaymentDue = (paymentTiming: PaymentTiming, status: GroupOrderStatus) =>
    paymentTiming === 'upfront'
        ? ['open', 'closed', 'at-event', 'returning', 'complete'].includes(status)
        : ['returning', 'complete'].includes(status);

/** Why this user can't ask to join, or null if they can. People who left can ask again. */
export function joinError(order: StatusAndCutoff, isOrganizer: boolean, existing: { status: string } | null, now: Date = new Date()): string | null {
    if (isOrganizer) return "You're the organizer of this order.";
    if (existing?.status === 'requested') return "You've already asked to join. The organizer will review your request.";
    if (existing?.status === 'approved') return "You're already in this order.";
    if (existing?.status === 'declined' || existing?.status === 'removed') return "The organizer hasn't approved you for this order.";
    if (effectiveOrderStatus(order, now) !== 'open') return "This order isn't taking new people right now.";
    return null;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export type Cell = { offered: false } | { offered: true; price: number | null };

/** The grid cell for an artist + signature type. A null price is TBD. */
export function gridCell(order: Pick<GroupOrder, 'artists'>, artistName: string, signatureTypeId: string): Cell {
    const price = order.artists.find((a) => a.name === artistName)?.prices.find((p) => p.signatureTypeId === signatureTypeId);
    return price ? { offered: true, price: price.price } : { offered: false };
}

export interface CellChange { artist: string; signatureTypeId: string; from: number | null; to: number | null }

/**
 * Cells whose price was filled in or changed by a settings update, so only participants
 * with cards in those cells get told. Cells that were added or removed aren't included.
 */
export function changedPrices(before: Pick<GroupOrder, 'artists'>, after: Pick<GroupOrder, 'artists'>): CellChange[] {
    const changes: CellChange[] = [];
    for (const artist of after.artists) {
        for (const { signatureTypeId, price } of artist.prices) {
            const old = gridCell(before, artist.name, signatureTypeId);
            if (old.offered && old.price !== price) changes.push({ artist: artist.name, signatureTypeId, from: old.price, to: price });
        }
    }
    return changes;
}

/**
 * Settings updates can't drop an artist, or one of an artist's signature types, while cards
 * are still in it; the organizer has to sort those cards out first. Returns a message, or null.
 */
export function settingsChangeError(before: Pick<GroupOrder, 'signatureTypes'>, after: Pick<GroupOrder, 'artists'>, rows: OrderRow[]): string | null {
    for (const row of rows) {
        if (gridCell(after, row.artist, row.signatureTypeId).offered) continue;
        if (!after.artists.some((a) => a.name === row.artist)) return `${row.artist} still has cards in this order, so they can't be removed yet.`;
        const label = before.signatureTypes.find((t) => t.id === row.signatureTypeId)?.label ?? 'that signature type';
        return `${row.artist} still has ${label} cards in this order, so ${label} can't be removed for them yet.`;
    }
    return null;
}

// ─── Balance ─────────────────────────────────────────────────────────────────

export type BalanceStatus = 'pending' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface ParticipantBalance {
    cardsTotal: number;           // priced cards only
    customItemsTotal: number;     // priced items only
    fee: number;
    returnShipping: number;
    pendingCount: number;         // cards and items still waiting on a price
    due: number | null;           // null while anything is pending
    confirmedPaid: number;
    reportedPaid: number;         // reported by the participant, not yet confirmed
    remaining: number | null;     // due − confirmed; negative means they're owed money back
    status: BalanceStatus;
}

/**
 * What a participant owes. Not-signed cards and unavailable custom items drop out; cards in
 * a TBD cell (or a cell the organizer has since removed) and unpriced items make it pending.
 */
export function participantBalance(order: Pick<GroupOrder, 'artists' | 'participantFee' | 'returnOptions'>, rows: OrderRow[], participant: ParticipantForBalance): ParticipantBalance {
    let pendingCount = 0;

    let cardCents = 0;
    for (const row of rows) {
        if (!sameId(row.participantId, participant.id) || row.status === 'not-signed') continue;
        const cell = gridCell(order, row.artist, row.signatureTypeId);
        if (!cell.offered || cell.price === null) pendingCount += 1;
        else cardCents += row.quantity * toCents(cell.price);
    }

    let itemCents = 0;
    for (const item of participant.customItems) {
        if (item.status === 'unavailable') continue;
        if (item.price === null) pendingCount += 1;
        else itemCents += item.quantity * toCents(item.price);
    }

    const feeCents = toCents(order.participantFee);
    const returnCents = toCents(order.returnOptions.find((o) => o.id === participant.returnOptionId)?.price ?? 0);
    const confirmedCents = participant.payments.filter((p) => p.confirmedAt).reduce((sum, p) => sum + toCents(p.amount), 0);
    const reportedCents = participant.payments.filter((p) => !p.confirmedAt).reduce((sum, p) => sum + toCents(p.amount), 0);

    const dueCents = pendingCount > 0 ? null : cardCents + itemCents + feeCents + returnCents;
    const remainingCents = dueCents === null ? null : dueCents - confirmedCents;

    let status: BalanceStatus;
    if (remainingCents === null) status = 'pending';
    else if (remainingCents < 0) status = 'overpaid';
    else if (remainingCents === 0) status = 'paid';
    else status = confirmedCents > 0 ? 'partial' : 'unpaid';

    return {
        cardsTotal: fromCents(cardCents),
        customItemsTotal: fromCents(itemCents),
        fee: fromCents(feeCents),
        returnShipping: fromCents(returnCents),
        pendingCount,
        due: dueCents === null ? null : fromCents(dueCents),
        confirmedPaid: fromCents(confirmedCents),
        reportedPaid: fromCents(reportedCents),
        remaining: remainingCents === null ? null : fromCents(remainingCents),
        status,
    };
}

// ─── Caps and limits ─────────────────────────────────────────────────────────

export interface ArtistSlots { name: string; cap: number | null; used: number; remaining: number | null }

/** Cards per artist across the order against the artist's cap. Pass active participants' rows only. */
export function artistSlots(order: Pick<GroupOrder, 'artists'>, rows: OrderRow[]): ArtistSlots[] {
    return order.artists.map(({ name, cap }) => {
        const used = activeQuantity(rows.filter((r) => r.artist === name));
        return { name, cap, used, remaining: cap === null ? null : Math.max(cap - used, 0) };
    });
}

/**
 * Checks a participant's card change against artist caps and the per-participant maximum.
 * Only blocks changes that add cards, so lowering a cap later never locks people out of
 * editing or removing what they already have. Returns a user-facing message, or null.
 */
export function cardLimitError(
    order: Pick<GroupOrder, 'artists' | 'maxCardsPerParticipant'>,
    rowsBefore: OrderRow[],
    rowsAfter: OrderRow[],
    participantId: unknown,
): string | null {
    for (const { name, cap } of order.artists) {
        if (cap === null) continue;
        const before = activeQuantity(rowsBefore.filter((r) => r.artist === name));
        const after = activeQuantity(rowsAfter.filter((r) => r.artist === name));
        if (after > before && after > cap) {
            const left = Math.max(cap - before, 0);
            return left === 0 ? `${name} is full for this order.` : `Only ${left} more ${left === 1 ? 'card' : 'cards'} can go to ${name}.`;
        }
    }

    const max = order.maxCardsPerParticipant;
    if (max !== null) {
        const mine = (rows: OrderRow[]) => activeQuantity(rows.filter((r) => sameId(r.participantId, participantId)));
        const before = mine(rowsBefore);
        const after = mine(rowsAfter);
        if (after > before && after > max) return `Each person can send up to ${max} ${max === 1 ? 'card' : 'cards'} in this order.`;
    }
    return null;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface GroupOrderRowInput {
    cardName?: string | null;
    set?: string | null;
    foil?: string | null;
    artist: string;
    signatureTypeId: string;
    sigNotes?: string | null;
    quantity: number;
}

/** Validates a participant's card against the order. Throws with a user-facing message. */
export function validateGroupOrderRow(order: Pick<GroupOrder, 'artists' | 'signatureTypes'>, input: GroupOrderRowInput) {
    if (!order.artists.some((a) => a.name === input.artist)) throw new Error("That artist isn't part of this order.");
    if (!gridCell(order, input.artist, input.signatureTypeId).offered) {
        throw new Error(`${input.artist} isn't offering that signature type in this order.`);
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_ROW_QUANTITY) {
        throw new Error(`Quantity must be between 1 and ${MAX_ROW_QUANTITY}.`);
    }
    const text = (value: string | null | undefined, label: string, max: number) => {
        const clean = (value ?? '').trim();
        if (clean.length > max) throw new Error(`${label} is too long.`);
        return clean;
    };
    return {
        cardName: text(input.cardName, 'Card name', 200),
        set: text(input.set, 'Set', 20),
        foil: input.foil === 'foil' ? 'foil' : 'non-foil',
        artist: input.artist,
        signatureTypeId: input.signatureTypeId,
        sigNotes: text(input.sigNotes, 'Signature notes', 200),
        quantity: input.quantity,
    };
}

export interface GroupOrderSettingsInput {
    signatureTypes: SignatureType[];
    artists: { name: string; cap?: number | null; prices: ArtistPrice[] }[];
    participantFee?: number | null;
    returnOptions?: ReturnOption[] | null;
    cutoff?: string | null;
    maxCardsPerParticipant?: number | null;
    paymentTiming?: string | null;
    publicTerms?: string | null;
    privateInstructions?: string | null;
    organizerDiscordName?: string | null;
}

const money = (value: number | null | undefined, label: string, max: number): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
        throw new Error(`${label} must be between $0 and $${max}.`);
    }
    return fromCents(toCents(value));
};

const optionalCount = (value: number | null | undefined, label: string): number | null => {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || value < 1 || value > MAX_CAP) throw new Error(`${label} must be a whole number between 1 and ${MAX_CAP}.`);
    return value;
};

const requiredLabel = (value: string, label: string, max: number) => {
    const clean = (value ?? '').trim();
    if (!clean) throw new Error(`${label} can't be blank.`);
    if (clean.length > max) throw new Error(`${label} "${clean.slice(0, 20)}…" is too long.`);
    return clean;
};

const assertUnique = (values: string[], message: string) => {
    if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) throw new Error(message);
};

/** Validates and normalises the organizer's settings. Throws with a user-facing message. */
export function validateGroupOrderSettings(input: GroupOrderSettingsInput): GroupOrderSettings {
    if (!input.signatureTypes?.length) throw new Error('Add at least one signature type.');
    if (input.signatureTypes.length > MAX_SIGNATURE_TYPES) throw new Error(`Orders can have up to ${MAX_SIGNATURE_TYPES} signature types.`);
    const signatureTypes = input.signatureTypes.map((t) => ({
        id: requiredLabel(t.id, 'Signature type id', 40),
        label: requiredLabel(t.label, 'Signature type', 40),
    }));
    assertUnique(signatureTypes.map((t) => t.id), 'Signature type ids must be unique.');
    assertUnique(signatureTypes.map((t) => t.label), 'Each signature type needs a different name.');
    const typeIds = new Set(signatureTypes.map((t) => t.id));

    if (!input.artists?.length) throw new Error('Add at least one artist.');
    if (input.artists.length > MAX_ORDER_ARTISTS) throw new Error(`Orders can have up to ${MAX_ORDER_ARTISTS} artists.`);
    const artists = input.artists.map((a) => {
        const name = requiredLabel(a.name, 'Artist name', 100);
        const prices = (a.prices ?? []).map((p) => {
            if (!typeIds.has(p.signatureTypeId)) throw new Error(`${name} has a price for a signature type that isn't in this order.`);
            return { signatureTypeId: p.signatureTypeId, price: p.price === null ? null : money(p.price, `${name}'s prices`, MAX_GRID_PRICE) };
        });
        assertUnique(prices.map((p) => p.signatureTypeId), `${name} has the same signature type listed twice.`);
        return { name, cap: optionalCount(a.cap, `${name}'s cap`), prices };
    });
    assertUnique(artists.map((a) => a.name), 'Each artist can only be listed once.');

    const returnOptions = (input.returnOptions ?? []).map((o) => ({
        id: requiredLabel(o.id, 'Return option id', 40),
        label: requiredLabel(o.label, 'Return shipping option', 60),
        price: money(o.price, 'Return shipping', MAX_RETURN_PRICE),
    }));
    if (returnOptions.length > MAX_RETURN_OPTIONS) throw new Error(`Orders can have up to ${MAX_RETURN_OPTIONS} return shipping options.`);
    assertUnique(returnOptions.map((o) => o.id), 'Return option ids must be unique.');

    let cutoff: Date | null = null;
    if (input.cutoff) {
        cutoff = new Date(input.cutoff);
        if (Number.isNaN(cutoff.getTime())) throw new Error('Enter a valid cutoff date.');
    }

    // No default: the organizer has to say up front when people pay.
    const paymentTiming = input.paymentTiming as PaymentTiming;
    if (!PAYMENT_TIMINGS.includes(paymentTiming)) throw new Error('Choose when participants pay: upfront, or after signing.');

    const longText = (value: string | null | undefined, label: string) => {
        const clean = (value ?? '').trim();
        if (clean.length > MAX_TERMS_LENGTH) throw new Error(`${label} are limited to ${MAX_TERMS_LENGTH} characters.`);
        return clean;
    };

    return {
        signatureTypes,
        artists,
        participantFee: money(input.participantFee, 'The per-person fee', MAX_PARTICIPANT_FEE),
        returnOptions,
        cutoff,
        maxCardsPerParticipant: optionalCount(input.maxCardsPerParticipant, 'Cards per person'),
        paymentTiming,
        publicTerms: longText(input.publicTerms, 'Public terms'),
        privateInstructions: longText(input.privateInstructions, 'Private instructions'),
        organizerDiscordName: normalizeDiscordName(input.organizerDiscordName),
    };
}

// ─── Public summary ──────────────────────────────────────────────────────────

/**
 * What anyone with the invite link (and Discord's link preview) can see. Never includes
 * private instructions or anything about participants beyond per-artist slot counts.
 */
export function publicOrderSummary(name: string, order: GroupOrder & { eventId?: unknown }, activeRows: OrderRow[]) {
    const slots = artistSlots(order, activeRows);
    return {
        name,
        status: order.status,
        eventId: order.eventId ? String(order.eventId) : null,
        organizerDiscordName: order.organizerDiscordName,
        publicTerms: order.publicTerms,
        cutoff: order.cutoff,
        paymentTiming: order.paymentTiming,
        maxCardsPerParticipant: order.maxCardsPerParticipant,
        participantFee: order.participantFee,
        returnOptions: order.returnOptions,
        signatureTypes: order.signatureTypes,
        artists: order.artists.map((a, i) => ({ ...a, used: slots[i].used, remaining: slots[i].remaining })),
    };
}
