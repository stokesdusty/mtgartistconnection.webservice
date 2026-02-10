"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        minLength: 6,
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        required: true,
    },
    emailPreferences: {
        siteUpdates: {
            type: Boolean,
            default: false,
        },
        artistUpdates: {
            type: Boolean,
            default: false,
        },
        localSigningEvents: {
            type: Boolean,
            default: false,
        }
    },
    followedArtists: {
        type: [String],
        default: [],
        index: true, // Index for faster queries when finding followers of an artist
    },
    monitoredStates: {
        type: [String],
        default: [],
        index: true, // Index for faster queries when finding users monitoring a state
    }
});
exports.default = (0, mongoose_1.model)("User", userSchema);
//# sourceMappingURL=User.js.map