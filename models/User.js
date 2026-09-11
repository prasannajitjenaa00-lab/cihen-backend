const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ],
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false // Do not return password by default
    },
    role: {
      type: String,
      enum: ['SUPER_USER', 'Super Admin', 'Admin', 'Counsellor', 'Admission Staff'],
      required: [true, 'Please specify user role']
    },
    designation: {
      type: String,
      trim: true,
      default: ''
    },
    mobile: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    }
  },
  { timestamps: true }
);

// Hash password before saving & keep status and isActive in sync
UserSchema.pre('save', async function (next) {
  // Sync status and isActive
  if (this.isModified('status') && !this.isModified('isActive')) {
    this.isActive = this.status === 'Active';
  } else if (this.isModified('isActive') && !this.isModified('status')) {
    this.status = this.isActive ? 'Active' : 'Inactive';
  }

  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
