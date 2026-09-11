const mongoose = require('mongoose');

const TimelineSchema = new mongoose.Schema({
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true // e.g. 'Created', 'Assigned', 'StatusChange', 'CallLogged', 'FollowUpCreated', 'NoteAdded'
  },
  message: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for user activity performance optimization
TimelineSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Timeline', TimelineSchema);
