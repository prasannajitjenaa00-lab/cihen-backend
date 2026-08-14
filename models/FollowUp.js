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

module.exports = mongoose.model('FollowUp', FollowUpSchema);
