import { Schema, model } from "mongoose";

const signingEventSchema:Schema = new Schema({
    name: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    startDate: {
        type: String,
        required: true,
    },
    endDate: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: false,
        default: null
    }
});

export default model("SigningEvent", signingEventSchema);