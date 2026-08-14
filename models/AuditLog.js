const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    required: true // e.g. 'Login', 'Lead Created', 'Lead Assigned', 'Settings Changed'
  },
  entity: {
    type: String,
    required: true // e.g. 'Lead', 'User', 'Settings', 'MetaIntegration'
  },
  entityId: {
    type: String
  },
  details: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
