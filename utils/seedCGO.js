require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const cgoData = {
  name: 'Mr. Srinivas Dash',
  designation: 'Chief Growth Officer',
  email: 'srinivas.dash@coheninternationalschool.com',
  mobile: '9777440467',
  role: 'CGO'
};

const seedCGO = async () => {
  let shouldDisconnect = false;
  try {
    if (mongoose.connection.readyState === 0) {
      const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
      console.log('Connecting to database for CGO seeding...');
      await mongoose.connect(connString);
      console.log('Database connected.');
      shouldDisconnect = true;
    }

    const existingUser = await User.findOne({ email: cgoData.email.toLowerCase().trim() });

    if (!existingUser) {
      // Create new CGO user with mobile number as initial password
      // UserSchema.pre('save') hook hashes the password using bcryptjs
      const createdUser = await User.create({
        name: cgoData.name,
        designation: cgoData.designation,
        email: cgoData.email.toLowerCase().trim(),
        mobile: cgoData.mobile,
        password: cgoData.mobile, // Hashed by pre('save') hook
        role: 'CGO',
        isActive: true,
        status: 'Active',
        mustChangePassword: true
      });

      console.log(`[CREATED] CGO User: ${createdUser.name} (${createdUser.email}) - Initial password set to mobile number (hashed).`);
    } else {
      // Update metadata without touching existing password or resetting mustChangePassword
      existingUser.name = cgoData.name;
      existingUser.designation = cgoData.designation;
      existingUser.mobile = cgoData.mobile;
      existingUser.role = 'CGO';
      existingUser.isActive = true;
      existingUser.status = 'Active';

      if (existingUser.mustChangePassword === undefined) {
        existingUser.mustChangePassword = true;
      }

      await existingUser.save();
      console.log(`[PRESERVED] CGO User already exists: ${existingUser.name} (${existingUser.email}). Password was NOT overwritten.`);
    }

    console.log('CGO seeding completed successfully.');
  } catch (error) {
    console.error('CGO seeding failed:', error.message);
    throw error;
  } finally {
    if (shouldDisconnect) {
      await mongoose.disconnect();
      console.log('Database disconnected.');
    }
  }
};

// If run directly from CLI
if (require.main === module) {
  seedCGO()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedCGO;
