import { Schema, model } from "mongoose";

const userSchema:Schema = new Schema({
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
        index: true,  // Index for faster queries when finding followers of an artist
    }
});

export default model("User", userSchema);