import { Schema, Types, model } from "mongoose";

// Audit trail for edits a verified artist makes to their own page, so an
// admin can see what changed and put it back.
export interface IArtistEditLog {
    artistId: Types.ObjectId;
    artistName: string;
    userId: Types.ObjectId;
    byAdmin: boolean;
    changes: { field: string; before?: string; after?: string }[];
    createdAt: Date;
}

const changeSchema = new Schema({
    field:  { type: String, required: true },
    before: { type: String },
    after:  { type: String },
}, { _id: false });

const artistEditLogSchema = new Schema<IArtistEditLog>({
    artistId:   { type: Schema.Types.ObjectId, ref: "Artist", required: true },
    artistName: { type: String, required: true },
    userId:     { type: Schema.Types.ObjectId, ref: "User", required: true },
    byAdmin:    { type: Boolean, default: false },
    changes:    { type: [changeSchema], default: [] },
    createdAt:  { type: Date, default: Date.now },
});

artistEditLogSchema.index({ artistId: 1, createdAt: -1 });

export default model<IArtistEditLog>("ArtistEditLog", artistEditLogSchema);
