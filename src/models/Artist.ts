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
});

export default model("Artist", artistSchema);
