import { Schema, Types, model } from "mongoose";

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
    tokenVersion: number;
    isVerifiedArtist: boolean;
    artistId?: Types.ObjectId;
    discordName: string;
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
    // Incremented to revoke all outstanding refresh tokens for this user
    tokenVersion: {
        type: Number,
        default: 0,
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
    },
    // Set by hand in the database by an admin once they've confirmed the
    // account belongs to the artist. Access checks require both fields.
    isVerifiedArtist: {
        type: Boolean,
        default: false,
    },
    // _id of the Artist document this account manages. Must be stored as an
    // ObjectId (not a string) so the unique index below applies.
    artistId: {
        type: Schema.Types.ObjectId,
        ref: "Artist",
    },
    // Unverified; used to match people up in group orders, which are coordinated on Discord.
    discordName: {
        type: String,
        default: '',
    },
});

// One account per artist. Partial so the many users without an artistId
// don't collide on a missing value.
userSchema.index(
    { artistId: 1 },
    { unique: true, partialFilterExpression: { artistId: { $type: "objectId" } } }
);

export default model<IUser>("User", userSchema);
