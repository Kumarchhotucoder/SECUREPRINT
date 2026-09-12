const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/secureprint', {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = connectDB;
