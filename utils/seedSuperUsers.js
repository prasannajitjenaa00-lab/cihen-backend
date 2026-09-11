require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const superUsersData = [
  {
    name: 'Jyoti Ranjan Tripathy',
    designation: 'Chairman',
    email: 'chairman@coheninternationalschool.com',
    mobile: '9439112233',
    role: 'SUPER_USER'
  },
  {
    name: 'Vikas Bahinipati',
    designation: 'Vice Chairman',
    email: 'vicechairman@coheninternationalschool.com',
    mobile: '8093770221',
    role: 'SUPER_USER'
  },
  {
    name: 'Janmejay Mandal',
    designation: 'Secretary',
    email: 'secretary@coheninternationalschool.com',
    mobile: '8249112840',
    role: 'SUPER_USER'
  }
];

const seedSuperUsers = async () => {
  let shouldDisconnect = false;
  try {
    if (mongoose.connection.readyState === 0) {
      const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
      console.log('Connecting to database for super user seeding...');
      await mongoose.connect(connString);
      console.log('Database connected.');
      shouldDisconnect = true;
    }

    for (const data of superUsersData) {
      const existingUser = await User.findOne({ email: data.email.toLowerCase().trim() });

      if (!existingUser) {
        // Create new Super User
        // Note: passing plaintext mobile as password to User.create will trigger
        // the UserSchema.pre('save') hook to securely hash it with bcryptjs.
        const createdUser = await User.create({
          name: data.name,
          designation: data.designation,
          email: data.email.toLowerCase().trim(),
          mobile: data.mobile,
          password: data.mobile, // Will be hashed by pre('save') hook
          role: 'SUPER_USER',
          isActive: true,
          status: 'Active',
          mustChangePassword: true
        });

        console.log(`[CREATED] Super User: ${createdUser.name} (${createdUser.email}) - Initial password set to mobile number (hashed).`);
      } else {
        // Update user metadata without touching existing password or resetting mustChangePassword
        existingUser.name = data.name;
        existingUser.designation = data.designation;
        existingUser.mobile = data.mobile;
        existingUser.role = 'SUPER_USER';
        existingUser.isActive = true;
        existingUser.status = 'Active';

        // Only set mustChangePassword = true if it was never defined
        if (existingUser.mustChangePassword === undefined) {
          existingUser.mustChangePassword = true;
        }

        await existingUser.save();
        console.log(`[PRESERVED] Super User already exists: ${existingUser.name} (${existingUser.email}). Password was NOT overwritten.`);
      }
    }

    console.log('Super user seeding completed successfully.');
  } catch (error) {
    console.error('Super user seeding failed:', error.message);
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
  seedSuperUsers()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedSuperUsers;
