import { Schema, model } from "mongoose";

const userCardCollectionSchema = new Schema({
    userId:          { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scryfallId:      { type: String, required: true },
    cardName:        { type: String, required: true },
    artistName:      { type: String, default: "" },
    set:             { type: String, required: true },
    collectorNumber: { type: String, required: true },
    signedNonfoil:   { type: Boolean, default: false },
    signedFoil:      { type: Boolean, default: false },
    wishlistSigned:  { type: Boolean, default: false },
    artistProof:     { type: Boolean, default: false },
    artistProofFoil: { type: Boolean, default: false },
});

userCardCollectionSchema.index({ userId: 1, scryfallId: 1 }, { unique: true });

export default model("UserCardCollection", userCardCollectionSchema);
