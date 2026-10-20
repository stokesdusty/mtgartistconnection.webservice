import { Schema, Types, model } from "mongoose";

export interface ISignatureExample {
    _id: Types.ObjectId;
    imageUrl: string;
    key: string;
    label: string;
    order: number;
    uploadedBy?: Types.ObjectId;
    createdAt: Date;
}

const signatureExampleSchema = new Schema<ISignatureExample>({
    imageUrl:   { type: String, required: true },
    key:        { type: String, required: true },
    label:      { type: String, required: true },
    order:      { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt:  { type: Date, default: Date.now },
});

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
    artistNote?: string;
    artistNoteUpdatedAt?: Date;
    signatureExamples?: ISignatureExample[];
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
    },
    // Written by the verified artist from their dashboard; kept apart from
    // the admin-written signingComment.
    artistNote: {
        type: String
    },
    artistNoteUpdatedAt: {
        type: Date
    },
    // Labelled signature photos (Regular, Shadow, Sketch...). Replaces the
    // single haveSignature image; see services/signatureExamples.
    signatureExamples: {
        type: [signatureExampleSchema],
        default: undefined
    }
});

export default model<IArtist>("Artist", artistSchema);
