const mongoose = require('mongoose');

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');     // Replace multiple - with single -
};

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    maxlength: [150, 'Shop name too long']
  },
  // Stable public slug for permanent shop QR (e.g. abc-digital-center)
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    sparse: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  phone: {
    type: String,
    trim: true
  },
  email: String,
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED'],
    default: 'PENDING'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // SaaS Subscription (Shop Owner -> SecurePrint)
  subscription: {
    plan: {
      type: String,
      enum: ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'],
      default: 'TRIAL'
    },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
      default: 'ACTIVE'
    },
    validUntil: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30-day active window
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null
    },
    monthlyPrice: {
      type: Number,
      default: 0
    }
  },
  // Tracks if shopkeeper has configured counter details and pricing
  isSetupComplete: {
    type: Boolean,
    default: false
  },
  // Permanent QR token (hashed) — backwards compatible
  permanentQrTokenHash: {
    type: String,
    select: false
  },
  // Permanent QR image data URL cached for fast counter display
  permanentQrDataUrl: {
    type: String
  },
  // Permanent QR target link (e.g. https://domain.com/shop/slug)
  permanentQrTargetUrl: {
    type: String
  },
  permanentQrGeneratedAt: Date,
  // Pricing config
  pricing: {
    bwPerPage: { type: Number, default: 1 },
    colorPerPage: { type: Number, default: 5 },
    currency: { type: String, default: 'INR' }
  },
  // Supported paper sizes
  supportedPaperSizes: {
    type: [String],
    default: ['A4', 'A3', 'Letter']
  }
}, { timestamps: true });

// Auto-generate slug before save if not present
shopSchema.pre('save', async function () {
  if (!this.slug && this.name) {
    let baseSlug = slugify(this.name);
    let candidate = baseSlug;
    let count = 1;
    while (await this.constructor.findOne({ slug: candidate, _id: { $ne: this._id } })) {
      candidate = `${baseSlug}-${count++}`;
    }
    this.slug = candidate;
  }
});

module.exports = mongoose.model('Shop', shopSchema);
