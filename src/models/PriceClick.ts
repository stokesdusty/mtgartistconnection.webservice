import { Schema, model } from "mongoose";

const priceClickSchema: Schema = new Schema({
    artistName: { type: String, required: true },
    platform:   { type: String, required: true },
    cardName:   { type: String },
    cardSet:    { type: String },
    timestamp:  { type: Date, default: Date.now },
});

export default model("PriceClick", priceClickSchema);
