import { Schema, model } from "mongoose";

// Raw Scryfall artist credits per set, refreshed by the setArtistSync job.
// Names are stored exactly as Scryfall prints them; mapping to our Artist
// records happens at query time so scryfall_name edits apply immediately.
export interface ISetArtists {
    code: string;
    name: string;
    released_at?: string;
    scryfall_artists: string[];
    updatedAt: Date;
}

const setArtistsSchema = new Schema<ISetArtists>({
    code: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    released_at: {
        type: String,
    },
    scryfall_artists: {
        type: [String],
        default: [],
    },
    updatedAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
});

export default model<ISetArtists>("SetArtists", setArtistsSchema);
