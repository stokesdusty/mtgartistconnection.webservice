import { Schema, model } from "mongoose";

const cardRowSchema = new Schema({
    rowId:             { type: String, required: true },
    cardName:          { type: String, default: '' },
    quantity:          { type: Number, default: 1 },
    set:               { type: String, default: '' },
    foil:              { type: String, default: 'non-foil' },
    owner:             { type: String, default: '' },
    signatureType:     { type: String, default: '' },
    sigNotes:          { type: String, default: '' },
    pricePerSig:       { type: Number, default: 0 },
    paymentStatus:     { type: String, default: 'unpaid' },
    status:            { type: String, default: 'collecting' },
    signingMethod:     { type: String, default: 'mail-to-artist' },
    signingMethodLabel:{ type: String, default: '' },
    outboundTracking:  { type: String, default: '' },
    inboundTracking:   { type: String, default: '' },
}, { _id: false });

const signingBatchSchema = new Schema({
    userId:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    batchId:   { type: String, required: true },
    name:      { type: String, required: true },
    createdAt: { type: String, required: true },
    artist:    { type: String, default: '' },
    archived:  { type: Boolean, default: false },
    expanded:  { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    rows:      { type: [cardRowSchema], default: [] },
});

signingBatchSchema.index({ userId: 1, batchId: 1 }, { unique: true });

export default model("SigningBatch", signingBatchSchema);
