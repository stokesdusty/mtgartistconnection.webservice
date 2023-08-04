"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const artistSchema = new mongoose_1.Schema({
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
    }
});
exports.default = (0, mongoose_1.model)("Artist", artistSchema);
//# sourceMappingURL=Artist.js.map