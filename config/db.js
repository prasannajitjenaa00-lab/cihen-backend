const mongoose = require('mongoose');
const dns = require('dns');

// Force Google Public DNS to resolve MongoDB Atlas SRV records
// (fixes ECONNREFUSED on networks that block Atlas DNS lookups)
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const connectDB = async () => {
  const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to MongoDB... (attempt ${attempt}/${maxRetries})`);
      const conn = await mongoose.connect(connString, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(`MongoDB Connection Error (attempt ${attempt}): ${error.message}`);
      if (attempt === maxRetries) {
        console.error('All connection attempts failed. Exiting...');
        process.exit(1);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
};

module.exports = connectDB;
