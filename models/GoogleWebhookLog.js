const mongoose = require('mongoose');

const GoogleWebhookLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      index: true
    },
    leadId: {
      type: String,
      index: true
    },
    formId: {
      type: String
    },
    campaignId: {
      type: String
    },
    campaignName: {
      type: String
    },
    adGroupId: {
      type: String
    },
    creativeId: {
      type: String
    },
    gclid: {
      type: String,
      index: true
    },
    gbraid: {
      type: String
    },
    wbraid: {
      type: String
    },
    isTest: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['Received', 'Processing', 'Success', 'Failed', 'Test', 'Duplicate', 'Unauthorized', 'Ignored'],
      default: 'Received',
      index: true
    },
    // Stored natively as JSON/Object via Mixed schema type
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    },
    error: {
      type: String
    },
    retryCount: {
      type: Number,
      default: 0
    },
    nextRetryAt: {
      type: Date
    },
    lastRetryAt: {
      type: Date
    },
    processedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

GoogleWebhookLogSchema.index({ createdAt: -1 });
GoogleWebhookLogSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model('GoogleWebhookLog', GoogleWebhookLogSchema);
