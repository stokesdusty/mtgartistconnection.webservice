import { Schema, model } from "mongoose";

const priceClickSchema: Schema = new Schema({
    artistName: { type: String, required: true },
    platform:   { type: String, required: true },
    cardName:   { type: String },
    cardSet:    { type: String },
    placement:  { type: String },   // where on the site the click came from; missing on pre-2026-10 clicks (all from the all-cards page)
    timestamp:  { type: Date, default: Date.now },
});

export default model("PriceClick", priceClickSchema);
