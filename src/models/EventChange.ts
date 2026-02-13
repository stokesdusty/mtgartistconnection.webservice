import { Schema, model } from "mongoose";

const EventChangeSchema = new Schema({
  eventId: {
    type: String,
    required: true,
    index: true,
  },
  eventName: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: false,
    index: true, // Index for faster queries when finding events by state
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  url: {
    type: String,
    required: false,
  },
  changeType: {
    type: String,
    required: true,
    enum: ['new_event', 'artist_added'],
    default: 'new_event',
  },
  // For changeType='artist_added'
  artistName: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
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

export default model("EventChange", EventChangeSchema);
