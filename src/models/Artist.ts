import { Schema, model } from "mongoose";

export interface IArtist {
    name: string;
    email?: string;
    artistProofs?: string;
    facebook?: string;
    haveSignature?: string;
    instagram?: string;
    patreon?: string;
    signing?: string;
    signingComment?: string;
    twitter?: string;
    url?: string;
    youtube?: string;
    mountainmage?: string;
    markssignatureservice?: string;
    filename?: string;
    artstation?: string;
    location?: string;
    bluesky?: string;
    omalink?: string;
    inprnt?: string;
    scryfall_name?: string;
    alternate_names?: string;
    lastSocialSync?: Date;
}

const artistSchema = new Schema<IArtist>({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
    },
    artistProofs: {
        type: String,
    },
    facebook: {
        type: String,
    },
    haveSignature: {
        type: String,
    },
    instagram: {
        type: String,
    },
    patreon: {
        type: String,
    },
    signing: {
        type: String,
    },
    signingComment: {
        type: String,
    },
    twitter: {
        type: String,
    },
    url: {
        type: String,
    },
    youtube: {
        type: String,
    },
    mountainmage: {
        type: String,
    },
    markssignatureservice: {
        type: String,
    },
    filename: {
        type: String,
    },
    artstation: {
        type: String,
    },
    location: {
        type: String
    },
    bluesky: {
        type: String
    },
    omalink: {
        type: String
    },
    inprnt: {
        type: String
    },
    scryfall_name: {
        type: String
    },
    alternate_names: {
        type: String
    },
    lastSocialSync: {
        type: Date
    }
});

export default model<IArtist>("Artist", artistSchema);
