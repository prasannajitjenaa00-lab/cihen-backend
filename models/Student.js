const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true
    },
    admissionNumber: {
      type: String,
      required: true,
      unique: true
    },
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    parentName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
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
    class: {
      type: String,
      required: true
    },
    section: {
      type: String,
      default: 'A'
    },
    academicYear: {
      type: String,
      required: true
    },
    admissionDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', StudentSchema);
