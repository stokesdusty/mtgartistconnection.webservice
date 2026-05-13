import { Schema, model } from "mongoose";

const ArtistChangeSchema = new Schema({
  artistName: {
    type: String,
    required: true,
    index: true,
  },
  changeType: {
    type: String,
    required: true,
    enum: ['update', 'added_to_event', 'news_article'],
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  // For changeType='update'
  fieldsChanged: {
    type: [String],
    default: [],
  },
  // For changeType='added_to_event'
  eventId: {
    type: String,
  },
  eventName: {
    type: String,
  },
  eventStartDate: {
    type: Date,
  },
  eventEndDate: {
    type: Date,
  },
  eventLocation: {
    type: String,
  },
  // For changeType='news_article'
  newsArticleId: {
    type: String,
  },
  newsArticleTitle: {
    type: String,
  },
  newsArticleSummary: {
    type: String,
  },
  processed: {
    type: Boolean,
    default: false,
    index: true,
  },
  processedAt: {
    type: Date,
  },
});

export default model("ArtistChange", ArtistChangeSchema);
