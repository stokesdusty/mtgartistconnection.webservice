import { Schema, model } from "mongoose";

const cardKingdomPriceSchema: Schema = new Schema({
    name: { type: String, required: true },
    edition: { type: String },
    condition: { type: String },
    language: { type: String },
    foil: { type: Boolean },
    signed: { type: Boolean },
    artistProof: { type: Boolean },
    alteredArt: { type: Boolean },
    misprint: { type: Boolean },
    promo: { type: Boolean },
    textless: { type: Boolean },
    printingId: { type: Number },
    id: { type: Number },
    price: { type: Number }, // price in cents
    url: { type: String },
    fetchedAt: { type: Date, required: true, default: Date.now },
});

// Compound index for looking up specific cards
cardKingdomPriceSchema.index({ name: 1, edition: 1, fetchedAt: -1 });
cardKingdomPriceSchema.index({ printingId: 1, fetchedAt: -1 });
cardKingdomPriceSchema.index({ fetchedAt: -1 });

export default model("CardKingdomPrice", cardKingdomPriceSchema);
