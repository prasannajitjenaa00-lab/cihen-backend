const mongoose = require('mongoose');

const CRMSettingsSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      default: 'Cohen International School'
    },
    schoolLogo: {
      type: String,
      default: ''
    },
    schoolAddress: {
      type: String,
      default: '123 School Lane, City, State'
    },
    schoolPhone: {
      type: String,
      default: '+91 9876543210'
    },
    schoolEmail: {
      type: String,
      default: 'admissions@cohenschool.com'
    },
    schoolWebsite: {
      type: String,
      default: 'https://cohenschool.com'
    },
    leadStatuses: {
      type: [String],
      default: [
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
      ]
    },
    leadSources: {
      type: [String],
      default: ['Facebook', 'Instagram', 'Website', 'Google', 'WhatsApp', 'Manual', 'Referral']
    },
    leadPriorities: {
      type: [String],
      default: ['Low', 'Medium', 'High', 'Urgent']
    },
    assignmentMethod: {
      type: String,
      enum: ['Round Robin', 'Manual', 'Campaign Based', 'Class Based'],
      default: 'Round Robin'
    },
    assignmentRules: [
      {
        ruleType: {
          type: String, // 'campaign' or 'class'
          enum: ['campaign', 'class']
        },
        triggerValue: {
          type: String // e.g. "School Admission 2026" or "Class 10"
        },
        counsellor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }
    ],
    websiteApiKey: {
      type: String,
      default: 'cohen_website_secret_api_key_2026'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CRMSettings', CRMSettingsSchema);
