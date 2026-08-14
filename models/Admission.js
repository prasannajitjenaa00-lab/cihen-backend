const mongoose = require('mongoose');

const AdmissionSchema = new mongoose.Schema(
  {
    applicationNumber: {
      type: String,
      required: true,
      unique: true
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true
    },
    studentName: {
      type: String,
      required: true
    },
    parentName: {
      type: String,
      required: true
    },
    classInterested: {
      type: String,
      required: true
    },
    academicYear: {
      type: String,
      required: true
    },
    counsellor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: [
        'Enquiry',
        'Application Started',
        'Application Submitted',
        'Documents Pending',
        'Verification',
        'Approved',
        'Admission Confirmed',
        'Rejected'
      ],
      default: 'Application Started'
    },
    applicationDate: {
      type: Date,
      default: Date.now
    },
    admissionDate: {
      type: Date
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid'],
      default: 'Pending'
    },
    documents: [
      {
        name: String,
        fileUrl: String,
        fileType: String,
        publicId: String,
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admission', AdmissionSchema);
