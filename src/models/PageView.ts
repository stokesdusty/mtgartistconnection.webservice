import { Schema, model } from "mongoose";

const pageViewSchema: Schema = new Schema({
    path:      { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

export default model("PageView", pageViewSchema);
