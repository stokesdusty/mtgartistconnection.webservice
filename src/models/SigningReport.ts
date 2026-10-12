import { Schema, Types, model } from "mongoose";

export const SIGNING_METHODS = ['convention', 'mail_in', 'signing_service', 'store_event', 'other'] as const;
export const SIGNING_EXTRA_KINDS = ['playmat', 'remarque', 'sketch', 'alter', 'proof'] as const;
export const SIGNING_REPORT_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type SigningMethod = typeof SIGNING_METHODS[number];
export type SigningExtraKind = typeof SIGNING_EXTRA_KINDS[number];
export type SigningReportStatus = typeof SIGNING_REPORT_STATUSES[number];

export interface ISigningReport {
    artistName: string;
    userId: Types.ObjectId;
    signedOn: Date;
    method: SigningMethod;
    pricePerSig: number;            // USD; 0 means free
    freeCount?: number;             // "first N free"
    perPersonLimit?: number;
    extras: { kind: SigningExtraKind; price: number }[];
    turnaroundWeeks?: number;       // mail-in / signing service only
    eventId?: Types.ObjectId;
    serviceName?: string;
    note?: string;
    status: SigningReportStatus;
    rejectionReason?: string;
    reviewedAt?: Date;
    reviewedBy?: Types.ObjectId;
    createdAt: Date;
}

const extraSchema = new Schema({
    kind:  { type: String, enum: SIGNING_EXTRA_KINDS, required: true },
    price: { type: Number, required: true, min: 0 },
}, { _id: false });

const signingReportSchema = new Schema<ISigningReport>({
    artistName:      { type: String, required: true },
    userId:          { type: Schema.Types.ObjectId, ref: "User", required: true },
    signedOn:        { type: Date, required: true },
    method:          { type: String, enum: SIGNING_METHODS, required: true },
    pricePerSig:     { type: Number, required: true, min: 0 },
    freeCount:       { type: Number, min: 0 },
    perPersonLimit:  { type: Number, min: 0 },
    extras:          { type: [extraSchema], default: [] },
    turnaroundWeeks: { type: Number, min: 0 },
    eventId:         { type: Schema.Types.ObjectId, ref: "SigningEvent" },
    serviceName:     { type: String },
    note:            { type: String, maxLength: 280 },
    status:          { type: String, enum: SIGNING_REPORT_STATUSES, default: 'pending', required: true },
    rejectionReason: { type: String },
    reviewedAt:      { type: Date },
    reviewedBy:      { type: Schema.Types.ObjectId, ref: "User" },
    createdAt:       { type: Date, default: Date.now },
});

signingReportSchema.index({ artistName: 1, status: 1, signedOn: -1 });
signingReportSchema.index({ status: 1, createdAt: 1 });
signingReportSchema.index({ userId: 1, createdAt: -1 });

export default model<ISigningReport>("SigningReport", signingReportSchema);
