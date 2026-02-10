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
    state: {
        type: String,
        required: false,
        default: null,
        index: true,  // Index for faster queries when finding events by state
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