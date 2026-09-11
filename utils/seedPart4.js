require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');
const User = require('../models/User');

const part4Users = [
  {
    name: 'Dr. Monika Sarkar',
    designation: 'Senior Admissions Officer cum Student Welfare Officer',
    mobile: '7077775310',
    email: 'monika.sarkar@coheninternationalschool.com',
    role: 'Admissions Officer'
  },
  {
    name: 'Ms. Sangyan Sararika Singh',
    designation: 'Sr. Admissions Officer',
    mobile: '7077775313',
    email: 'sagarika.singh@coheninternationalschool.com',
    role: 'Admissions Officer'
  },
  {
    name: 'Ms. Bhagyashree Chhotray',
    designation: 'Sr. Counsellor cum Admissions Manager',
    mobile: '7077775317',
    email: 'bhagyashree.chhotray@coheninternationalschool.com',
    role: 'Admissions Manager'
  }
];

const seedPart4 = async () => {
  let shouldDisconnect = false;
  try {
    if (mongoose.connection.readyState === 0) {
      const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
      console.log('Connecting to database for Part 4 user seeding...');
      await mongoose.connect(connString);
      console.log('Database connected.');
      shouldDisconnect = true;
    }

    for (const u of part4Users) {
      const emailLower = u.email.toLowerCase().trim();
      const existingUser = await User.findOne({ email: emailLower });

      if (!existingUser) {
        // Create new user — password is hashed by UserSchema.pre('save') hook
        await User.create({
          name: u.name,
          designation: u.designation,
          email: emailLower,
          mobile: u.mobile,
          password: u.mobile,
          role: u.role,
          isActive: true,
          status: 'Active',
          mustChangePassword: true
        });
        console.log('[CREATED] ' + u.role + ': ' + u.name + ' (' + emailLower + '). Initial password = mobile number.');
      } else {
        // Update metadata only — NEVER overwrite changed passwords
        await User.updateOne(
          { email: emailLower },
          {
            $set: {
              name: u.name,
              designation: u.designation,
              mobile: u.mobile,
              role: u.role,
              isActive: true,
              status: 'Active'
            }
          }
        );
        console.log('[PRESERVED] ' + u.role + ' already exists: ' + existingUser.name + ' (' + emailLower + '). Password NOT overwritten.');
      }
    }

    console.log('Part 4 user seeding completed successfully.');
  } catch (err) {
    console.error('Part 4 seeding error:', err);
    if (shouldDisconnect) await mongoose.disconnect();
    throw err;
  }

  if (shouldDisconnect) {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
};

if (require.main === module) {
  seedPart4()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedPart4;
