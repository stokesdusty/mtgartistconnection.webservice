import { Schema, model } from "mongoose";

// TCGplayer's own name/set/number for a product, cached from their site's
// product-details endpoint. Mass Entry only matches TCGplayer's naming
// (e.g. "Zimone, Infinite Analyst (Borderless)"), which Scryfall's doesn't follow.
export interface ITcgplayerProduct {
    productId: number;
    name: string;
    setCode: string;
    number?: string;
    fetchedAt: Date;
}

const tcgplayerProductSchema = new Schema<ITcgplayerProduct>({
    productId: {
        type: Number,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    setCode: {
        type: String,
        required: true,
    },
    number: {
        type: String,
    },
    fetchedAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
});

export default model<ITcgplayerProduct>("TcgplayerProduct", tcgplayerProductSchema);
