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
exports.default = (0, mongoose_1.model)("Artist", artistSchema);
//# sourceMappingURL=Artist.js.map