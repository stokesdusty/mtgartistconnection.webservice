import { Schema, Types, model } from "mongoose";

// A user's report about a group order (e.g. a suspected scam), for admins to review.

export interface IGroupOrderReport {
    orderId: Types.ObjectId;
    reporterId: Types.ObjectId;
    reason: string;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedBy: Types.ObjectId | null;
}

const groupOrderReportSchema = new Schema<IGroupOrderReport>({
    orderId:    { type: Schema.Types.ObjectId, ref: "SigningBatch", required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason:     { type: String, required: true, maxLength: 1000 },
    createdAt:  { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
});

// One report per person per order.
groupOrderReportSchema.index({ orderId: 1, reporterId: 1 }, { unique: true });
groupOrderReportSchema.index({ resolvedAt: 1, createdAt: -1 });

export default model<IGroupOrderReport>("GroupOrderReport", groupOrderReportSchema);
