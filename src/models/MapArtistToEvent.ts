import { Schema, model } from "mongoose";

const mapArtistToEventSchema:Schema = new Schema({
    artistName: {
        type: String,
        required: true,
    },
    eventId: {
        type: Number,
        required: true,
    },
});

export default model("MapArtistToEvent", mapArtistToEventSchema);