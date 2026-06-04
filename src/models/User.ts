import { Schema, model } from "mongoose";

export interface IUser {
    name: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    emailPreferences: {
        siteUpdates: boolean;
        artistUpdates: boolean;
        localSigningEvents: boolean;
        newArtistNotifications: boolean;
    };
    followedArtists: string[];
    monitoredStates: string[];
}

const userSchema = new Schema<IUser>({
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
        },
        newArtistNotifications: {
            type: Boolean,
            default: false,
        }
    },
    followedArtists: {
        type: [String],
        default: [],
        index: true,
    },
    monitoredStates: {
        type: [String],
        default: [],
        index: true,
    }
});

export default model<IUser>("User", userSchema);
