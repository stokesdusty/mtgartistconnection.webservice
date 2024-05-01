import { Schema, model } from "mongoose";

const mapArtistToEventSchema:Schema = new Schema({
    artistName: {
        type: String,
        required: true,
    },
    eventId: {
        type: String,
        required: true,
    },
});

export default model("MapArtistToEvent", mapArtistToEventSchema);