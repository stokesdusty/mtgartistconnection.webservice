import mongoose, { Schema, Document } from 'mongoose';

export interface IArtistPost extends Document {
  artistId: mongoose.Types.ObjectId;
  artistName: string;
  platform: 'twitter' | 'instagram' | 'bluesky' | 'facebook' | 'patreon' | 'other';
  externalPostId: string;
  content: string;
  postUrl: string;
  postDate: Date;
  fetchedAt: Date;
  isReviewed: boolean;
}

const ArtistPostSchema: Schema = new Schema({
  artistId: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  artistName: { type: String, required: true },
  platform: { type: String, required: true },
  externalPostId: { type: String, required: true },
  content: { type: String },
  postUrl: { type: String, required: true },
  postDate: { type: Date, required: true },
  fetchedAt: { type: Date, default: Date.now },
  isReviewed: { type: Boolean, default: false }
});

// Ensure we don't duplicate the same post from the same platform
ArtistPostSchema.index({ platform: 1, externalPostId: 1 }, { unique: true });

export default mongoose.model<IArtistPost>('ArtistPost', ArtistPostSchema);