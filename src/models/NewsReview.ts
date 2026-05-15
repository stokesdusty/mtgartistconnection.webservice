import mongoose, { Schema, Document } from 'mongoose';

export interface INewsReview extends Document {
  artistPostId: mongoose.Types.ObjectId;
  // Support both single artist (legacy) and multiple artists
  artistId?: mongoose.Types.ObjectId;
  artistName?: string;
  artistIds: mongoose.Types.ObjectId[];
  artistNames: string[];
  title: string;
  content: string;
  summary: string;
  sourcePostUrl: string;
  imageUrl?: string;
  generatedAt: Date;
  isReviewed: boolean;
  isPublished: boolean;
  publishedAt?: Date;
}

const NewsReviewSchema: Schema = new Schema({
  artistPostId: { type: Schema.Types.ObjectId, ref: 'ArtistPost', required: true },
  // Legacy single artist fields (for backwards compatibility)
  artistId: { type: Schema.Types.ObjectId, ref: 'Artist' },
  artistName: { type: String },
  // New multi-artist fields
  artistIds: [{ type: Schema.Types.ObjectId, ref: 'Artist' }],
  artistNames: [{ type: String }],
  title: { type: String, required: true },
  content: { type: String, required: true },
  summary: { type: String, required: true },
  sourcePostUrl: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  generatedAt: { type: Date, default: Date.now },
  isReviewed: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date }
});

// Index for querying by review status
NewsReviewSchema.index({ isReviewed: 1 });
NewsReviewSchema.index({ isPublished: 1 });

// Index for querying by artistPostId (not unique to allow manual submissions with placeholder IDs)
NewsReviewSchema.index({ artistPostId: 1 });

export default mongoose.model<INewsReview>('NewsReview', NewsReviewSchema);
