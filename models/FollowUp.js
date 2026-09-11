const mongoose = require('mongoose');

const FollowUpSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: true
    },
    time: {
      type: String,
      required: true // e.g. "10:30"
    },
    type: {
      type: String,
      enum: ['Call', 'WhatsApp', 'SMS', 'School Visit', 'Meeting'],
      required: true
    },
    notes: {
      type: String
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Rescheduled', 'Cancelled'],
      default: 'Pending'
    }
  },
  { timestamps: true }
);

// Indexes for performance optimization
FollowUpSchema.index({ counsellor: 1, status: 1, date: 1 });
FollowUpSchema.index({ lead: 1 });

module.exports = mongoose.model('FollowUp', FollowUpSchema);
