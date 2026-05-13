import mongoose, { Schema, Document } from 'mongoose';

export interface INewsReview extends Document {
  artistPostId: mongoose.Types.ObjectId;
  artistId: mongoose.Types.ObjectId;
  artistName: string;
  title: string;
  content: string;
  summary: string;
  sourcePostUrl: string;
  generatedAt: Date;
  isReviewed: boolean;
  isPublished: boolean;
  publishedAt?: Date;
}

const NewsReviewSchema: Schema = new Schema({
  artistPostId: { type: Schema.Types.ObjectId, ref: 'ArtistPost', required: true },
  artistId: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  artistName: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  summary: { type: String, required: true },
  sourcePostUrl: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },
  isReviewed: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date }
});

// Index for querying by review status
NewsReviewSchema.index({ isReviewed: 1 });
NewsReviewSchema.index({ isPublished: 1 });

// Ensure we don't create duplicate news articles for the same post
NewsReviewSchema.index({ artistPostId: 1 }, { unique: true });

export default mongoose.model<INewsReview>('NewsReview', NewsReviewSchema);
