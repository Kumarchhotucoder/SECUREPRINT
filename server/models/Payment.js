const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrintJob',
    default: null
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  customerSessionId: {
    type: String,
    trim: true
  },
  // Type: Customer paying shop for prints VS Shop Owner paying SecurePrint for SaaS subscription
  type: {
    type: String,
    enum: ['PRINT_JOB', 'SHOP_SUBSCRIPTION'],
    default: 'PRINT_JOB'
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount must be non-negative']
  },
  currency: {
    type: String,
    default: 'INR'
  },
  gateway: {
    type: String,
    enum: ['RAZORPAY', 'CASH', 'UPI_DIRECT', 'MANUAL'],
    default: 'RAZORPAY'
  },
  gatewayOrderId: {
    type: String,
    trim: true,
    index: true
  },
  gatewayPaymentId: {
    type: String,
    trim: true,
    index: true
  },
  gatewaySignature: {
    type: String,
    trim: true
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
