const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Indexes for performance optimization
NoteSchema.index({ createdBy: 1, createdAt: -1 });
NoteSchema.index({ lead: 1 });

module.exports = mongoose.model('Note', NoteSchema);
