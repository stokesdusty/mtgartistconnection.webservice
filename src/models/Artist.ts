import { Schema, model } from "mongoose";

const artistSchema:Schema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
    },
    artistProofs: {
        type: Boolean,
    },
    facebook: {
        type: String,
    },
    haveSignature: {
        type: Boolean,
    },
    instagram: {
        type: String,
    },
    patreon: {
        type: String,
    },
    signing: {
        type: Boolean,
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
        type: Boolean,
    },
    filename: {
        type: String,
    },
});

export default model("Artist", artistSchema);
