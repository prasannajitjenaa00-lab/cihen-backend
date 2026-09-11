const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true
    },
    counsellor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    callDate: {
      type: Date,
      default: Date.now
    },
    callTime: {
      type: String // e.g. "14:15"
    },
    outcome: {
      type: String,
      enum: ['Connected', 'No Answer', 'Busy', 'Call Back', 'Interested', 'Not Interested'],
      required: true
    },
    notes: {
      type: String
    }
  },
  { timestamps: true }
);

// Indexes for performance optimization
CallSchema.index({ counsellor: 1, createdAt: -1 });
CallSchema.index({ lead: 1 });

module.exports = mongoose.model('Call', CallSchema);
