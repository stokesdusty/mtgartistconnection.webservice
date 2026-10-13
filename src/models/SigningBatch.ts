import { Schema, model } from "mongoose";

// `not-signed` is only used in group orders, with a `notSignedReason`.
export const ROW_STATUSES = ['collecting', 'sent', 'artist-received', 'signed', 'not-signed', 'shipped-back', 'complete'] as const;
export const GROUP_ORDER_STATUSES = ['draft', 'open', 'closed', 'at-event', 'returning', 'complete', 'cancelled'] as const;
// When participants pay: as soon as they're approved, or once the cards are signed (from "returning").
export const PAYMENT_TIMINGS = ['upfront', 'after-signing'] as const;

export type RowStatus = typeof ROW_STATUSES[number];
export type GroupOrderStatus = typeof GROUP_ORDER_STATUSES[number];
export type PaymentTiming = typeof PAYMENT_TIMINGS[number];

const cardRowSchema = new Schema({
    rowId:             { type: String, required: true },
    cardName:          { type: String, default: '' },
    quantity:          { type: Number, default: 1 },
    set:               { type: String, default: '' },
    foil:              { type: String, default: 'non-foil' },
    owner:             { type: String, default: '' },
    artist:            { type: String, default: '' },
    signatureType:     { type: String, default: '' },
    sigNotes:          { type: String, default: '' },
    pricePerSig:       { type: Number, default: 0 },
    paymentStatus:     { type: String, default: 'unpaid' },
    status:            { type: String, default: 'collecting' },
    signingMethod:     { type: String, default: 'mail-to-artist' },
    signingMethodLabel:{ type: String, default: '' },
    outboundTracking:  { type: String, default: '' },
    inboundTracking:   { type: String, default: '' },
    // Group orders only. The price comes from the order's grid (artist + signatureTypeId),
    // so pricePerSig and paymentStatus aren't used there.
    participantId:     { type: Schema.Types.ObjectId, ref: "GroupOrderParticipant", default: null },
    signatureTypeId:   { type: String, default: '' },
    notSignedReason:   { type: String, default: '' },
    receivedQuantity:  { type: Number, default: null },   // organizer's check-in count
}, { _id: false });

const signatureTypeSchema = new Schema({
    id:    { type: String, required: true },
    label: { type: String, required: true },
}, { _id: false });

// A null price is TBD. A signature type missing from `prices` isn't offered by that artist.
const artistPriceSchema = new Schema({
    signatureTypeId: { type: String, required: true },
    price:           { type: Number, default: null, min: 0 },
}, { _id: false });

const orderArtistSchema = new Schema({
    name:   { type: String, required: true },
    cap:    { type: Number, default: null, min: 1 },     // total cards the organizer can bring through this artist's line
    prices: { type: [artistPriceSchema], default: [] },
}, { _id: false });

const returnOptionSchema = new Schema({
    id:    { type: String, required: true },
    label: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
}, { _id: false });

const groupOrderSchema = new Schema({
    status:                 { type: String, enum: GROUP_ORDER_STATUSES, default: 'draft' },
    eventId:                { type: Schema.Types.ObjectId, ref: "SigningEvent", default: null },
    signatureTypes:         { type: [signatureTypeSchema], default: [] },
    artists:                { type: [orderArtistSchema], default: [] },
    participantFee:         { type: Number, default: 0, min: 0 },
    returnOptions:          { type: [returnOptionSchema], default: [] },
    cutoff:                 { type: Date, default: null },
    maxCardsPerParticipant: { type: Number, default: null, min: 1 },
    paymentTiming:          { type: String, enum: PAYMENT_TIMINGS, required: true },
    inviteToken:            { type: String, default: null },
    publicTerms:            { type: String, default: '' },
    privateInstructions:    { type: String, default: '' },   // shipping address, payment handles: approved participants only
    organizerDiscordName:   { type: String, default: '' },
    // Bumped by every card change; writes check it so caps hold when people add cards at the same time.
    rowsVersion:            { type: Number, default: 0 },
    organizerEmailOptOut:   { type: Boolean, default: false },  // no join-request emails
    cutoffReminderSentAt:   { type: Date, default: null },
    // Set by an admin; the order is read-only and its invite link stops working.
    disabledAt:             { type: Date, default: null },
    disabledReason:         { type: String, default: '' },
}, { _id: false });

const signingBatchSchema = new Schema({
    userId:     { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    batchId:    { type: String, required: true },
    name:       { type: String, required: true },
    createdAt:  { type: String, required: true },
    archived:   { type: Boolean, default: false },
    expanded:   { type: Boolean, default: true },
    sortOrder:  { type: Number, default: 0 },
    rows:       { type: [cardRowSchema], default: [] },
    // Set when the batch is shared as a group order; `userId` is then the organizer.
    groupOrder: { type: groupOrderSchema, default: null },
});

signingBatchSchema.index({ userId: 1, batchId: 1 }, { unique: true });
// Invite links look orders up by token. Partial so private batches (no token) don't collide.
signingBatchSchema.index(
    { "groupOrder.inviteToken": 1 },
    { unique: true, partialFilterExpression: { "groupOrder.inviteToken": { $type: "string" } } }
);

export default model("SigningBatch", signingBatchSchema);
