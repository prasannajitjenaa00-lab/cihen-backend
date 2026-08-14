const mongoose = require('mongoose');

const MetaWebhookLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      unique: true,
      required: true
    },
    leadId: {
      type: String
    },
    pageId: {
      type: String
    },
    receivedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Received', 'Processing', 'Success', 'Failed'],
      default: 'Received'
    },
    error: {
      type: String
    },
    retryCount: {
      type: Number,
      default: 0
    },
    rawPayload: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MetaWebhookLog', MetaWebhookLogSchema);
