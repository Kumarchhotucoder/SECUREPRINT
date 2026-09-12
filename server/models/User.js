const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name too long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email']
  },
  passwordHash: {
    type: String,
    required: true,
    select: false // Never returned in queries by default
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'SHOPKEEPER'],
    default: 'SHOPKEEPER'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockedUntil: {
    type: Date,
    select: false
  },
  lastLoginAt: Date,
  refreshTokenHash: {
    type: String,
    select: false
  }
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Check if account locked
userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > new Date();
};

module.exports = mongoose.model('User', userSchema);
