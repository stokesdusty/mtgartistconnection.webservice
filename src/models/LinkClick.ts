import { Schema, model } from "mongoose";

const linkClickSchema: Schema = new Schema({
    artistName: { type: String, required: true },
    linkType:   { type: String, required: true },
    timestamp:  { type: Date, default: Date.now },
});

export default model("LinkClick", linkClickSchema);
