import { Schema, Types, model } from "mongoose";

export const PARTICIPANT_STATUSES = ['requested', 'approved', 'declined', 'removed', 'left'] as const;
export const CUSTOM_ITEM_STATUSES = ['requested', 'purchased', 'unavailable'] as const;
export const PAYMENT_SOURCES = ['participant', 'organizer'] as const;

export type ParticipantStatus = typeof PARTICIPANT_STATUSES[number];
export type CustomItemStatus = typeof CUSTOM_ITEM_STATUSES[number];
export type PaymentSource = typeof PAYMENT_SOURCES[number];

export interface IGroupOrderPayment {
    id: string;
    amount: number;                 // USD; negative is a refund the organizer recorded
    note: string;
    source: PaymentSource;          // who entered it
    recordedBy: Types.ObjectId;
    createdAt: Date;
    confirmedAt: Date | null;       // set when the organizer confirms; organizer entries are confirmed on creation
}

export interface IGroupOrderCustomItem {
    id: string;
    label: string;                  // e.g. "Lightning Bolt AP"
    artistName: string;
    quantity: number;
    price: number | null;           // per item; null until the organizer knows it
    status: CustomItemStatus;
    note: string;
}

export interface IGroupOrderParticipant {
    orderId: Types.ObjectId;        // the SigningBatch's _id
    userId: Types.ObjectId | null;  // null for guests the organizer adds by hand
    displayName: string;
    discordName: string;
    status: ParticipantStatus;
    payments: IGroupOrderPayment[];
    readyToShipAt: Date | null;
    readyToShipSignature: string;   // what was on their artist sheet then, to spot changes
    inboundTracking: string;
    receivedAt: Date | null;
    returnOptionId: string | null;
    returnTracking: string;
    customItems: IGroupOrderCustomItem[];
    notesToOrganizer: string;
    termsAcceptedAt: Date | null;
    emailOptOut: boolean;           // no emails about this order
    // This participant's own view of the order in their Signing Tracker.
    expanded: boolean;
    sortOrder: number;
    archived: boolean;
    createdAt: Date;
}

const paymentSchema = new Schema({
    id:          { type: String, required: true },
    amount:      { type: Number, required: true },
    note:        { type: String, default: '' },
    source:      { type: String, enum: PAYMENT_SOURCES, required: true },
    recordedBy:  { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt:   { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
}, { _id: false });

const customItemSchema = new Schema({
    id:         { type: String, required: true },
    label:      { type: String, required: true },
    artistName: { type: String, default: '' },
    quantity:   { type: Number, default: 1, min: 1 },
    price:      { type: Number, default: null, min: 0 },
    status:     { type: String, enum: CUSTOM_ITEM_STATUSES, default: 'requested' },
    note:       { type: String, default: '' },
}, { _id: false });

const groupOrderParticipantSchema = new Schema<IGroupOrderParticipant>({
    orderId:          { type: Schema.Types.ObjectId, ref: "SigningBatch", required: true },
    userId:           { type: Schema.Types.ObjectId, ref: "User", default: null },
    displayName:      { type: String, required: true },
    discordName:      { type: String, default: '' },
    status:           { type: String, enum: PARTICIPANT_STATUSES, default: 'requested', required: true },
    payments:         { type: [paymentSchema], default: [] },
    readyToShipAt:    { type: Date, default: null },
    readyToShipSignature: { type: String, default: '' },
    inboundTracking:  { type: String, default: '' },
    receivedAt:       { type: Date, default: null },
    returnOptionId:   { type: String, default: null },
    returnTracking:   { type: String, default: '' },
    customItems:      { type: [customItemSchema], default: [] },
    notesToOrganizer: { type: String, default: '' },
    termsAcceptedAt:  { type: Date, default: null },
    emailOptOut:      { type: Boolean, default: false },
    expanded:         { type: Boolean, default: true },
    sortOrder:        { type: Number, default: 0 },
    archived:         { type: Boolean, default: false },
    createdAt:        { type: Date, default: Date.now },
});

// One membership per account per order. Partial so guests (no userId) don't collide.
groupOrderParticipantSchema.index(
    { orderId: 1, userId: 1 },
    { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);
groupOrderParticipantSchema.index({ orderId: 1, status: 1 });
// "Shared with me" in the participant's Signing Tracker.
groupOrderParticipantSchema.index({ userId: 1, status: 1 });

export default model<IGroupOrderParticipant>("GroupOrderParticipant", groupOrderParticipantSchema);
