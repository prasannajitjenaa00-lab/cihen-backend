const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      unique: true
    },
    studentName: {
      type: String,
      required: [true, 'Please add student name'],
      trim: true
    },
    parentName: {
      type: String,
      required: [true, 'Please add parent name'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Please add phone number'],
      trim: true,
      index: true
    },
    alternatePhone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true
    },
    dob: {
      type: Date
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    },
    address: {
      type: String
    },
    city: {
      type: String
    },
    state: {
      type: String
    },
    classInterested: {
      type: String,
      required: [true, 'Please specify class interested']
    },
    academicYear: {
      type: String,
      required: [true, 'Please specify academic year']
    },
    leadSource: {
      type: String,
      enum: ['Facebook', 'Instagram', 'Website', 'Google', 'WhatsApp', 'Manual', 'Referral'],
      default: 'Manual',
      index: true
    },
    platform: {
      type: String,
      lowercase: true,
      index: true
    },
    campaign: {
      type: String,
      index: true
    },
    adSet: {
      type: String
    },
    ad: {
      type: String
    },
    metaLeadId: {
      type: String,
      unique: true,
      sparse: true // Allows nulls to be unique
    },
    metaPageId: {
      type: String
    },
    metaFormId: {
      type: String
    },
    assignedCounsellor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    status: {
      type: String,
      enum: [
        'New',
        'Contacted',
        'Interested',
        'Follow-up',
        'Visit Scheduled',
        'Application Started',
        'Application Submitted',
        'Admission Confirmed',
        'Not Interested',
        'Lost'
      ],
      default: 'New',
      index: true
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true
    },
    duplicateStatus: {
      type: String,
      enum: ['None', 'Possible Duplicate', 'Resolved'],
      default: 'None'
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead'
    },
    nextFollowUp: {
      type: Date
    },
    lastContactDate: {
      type: Date
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Index on createdAt for sorting performance
LeadSchema.index({ createdAt: -1 });

// Auto-generate sequential leadId (e.g. L-1001)
LeadSchema.pre('save', async function (next) {
  if (this.isNew && !this.leadId) {
    try {
      const lastLead = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
      let nextNum = 1001;
      if (lastLead && lastLead.leadId && lastLead.leadId.startsWith('L-')) {
        const lastNum = parseInt(lastLead.leadId.replace('L-', ''), 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }
      this.leadId = `L-${nextNum}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Lead', LeadSchema);
