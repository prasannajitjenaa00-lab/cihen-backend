require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const User = require('../models/User');

const szmUsers = [
  {
    name: 'Mr. Pramod Kumar Rath',
    designation: 'Senior Zonal Manager – Operations & Admissions',
    mobile: '9777440456',
    email: 'pramod.rath@coheninternationalschool.com',
    role: 'Senior Zonal Manager'
  },
  {
    name: 'Mr. Subrat Ranjan Moharana',
    designation: 'Senior Zonal Manager – Operations & Admissions',
    mobile: '9777440458',
    email: 'subrat.moharana@coheninternationalschool.com',
    role: 'Senior Zonal Manager'
  },
  {
    name: 'Mr. Nihar Kanta Patra',
    designation: 'Senior Zonal Manager – Operations & Admissions',
    mobile: '9777440461',
    email: 'nihar.patra@coheninternationalschool.com',
    role: 'Senior Zonal Manager'
  }
];

const seedSZM = async () => {
  let shouldDisconnect = false;
  try {
    if (mongoose.connection.readyState === 0) {
      const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
      console.log('Connecting to database for Senior Zonal Manager seeding...');
      await mongoose.connect(connString);
      console.log('Database connected.');
      shouldDisconnect = true;
    }

    for (const szm of szmUsers) {
      const emailLower = szm.email.toLowerCase().trim();
      const existingUser = await User.findOne({ email: emailLower });

      if (!existingUser) {
        // Create new SZM user with mobile number as initial password
        // UserSchema.pre('save') hook hashes the password using bcryptjs
        const createdUser = await User.create({
          name: szm.name,
          designation: szm.designation,
          email: emailLower,
          mobile: szm.mobile,
          password: szm.mobile, // Hashed by pre('save') hook
          role: 'Senior Zonal Manager',
          isActive: true,
          status: 'Active',
          mustChangePassword: true
        });

        console.log(`[CREATED] SZM User: ${createdUser.name} (${createdUser.email}) - Initial password set to mobile number (hashed).`);
      } else {
        // Update metadata without touching existing password or resetting mustChangePassword
        existingUser.name = szm.name;
        existingUser.designation = szm.designation;
        existingUser.mobile = szm.mobile;
        existingUser.role = 'Senior Zonal Manager';
        existingUser.isActive = true;
        existingUser.status = 'Active';

        if (existingUser.mustChangePassword === undefined) {
          existingUser.mustChangePassword = true;
        }

        await existingUser.save();
        console.log(`[PRESERVED] SZM User already exists: ${existingUser.name} (${existingUser.email}). Password was NOT overwritten.`);
      }
    }

    console.log('Senior Zonal Manager seeding completed successfully.');
  } catch (error) {
    console.error('Senior Zonal Manager seeding failed:', error.message);
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
  seedSZM()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedSZM;
