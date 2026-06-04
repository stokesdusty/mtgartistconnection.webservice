import { Schema, model } from "mongoose";

export interface IMapArtistToEvent {
    artistName: string;
    eventId: string;
}

const mapArtistToEventSchema = new Schema<IMapArtistToEvent>({
    artistName: {
        type: String,
        required: true,
    },
    eventId: {
        type: String,
        required: true,
    },
});

export default model<IMapArtistToEvent>("MapArtistToEvent", mapArtistToEventSchema);
