require('dotenv').config();
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const User = require('../models/User');
const Shop = require('../models/Shop');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🌱 Seeding database with Super Admin and multi-shop multi-tenancy...\n');

  // Clear existing
  await User.deleteMany({});
  await Shop.deleteMany({});

  const publicBaseUrl = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

  // 1. Create Super Admin
  const superAdmin = new User({
    name: 'Chhotu Kumar (Master Admin)',
    email: process.env.ADMIN_EMAIL || 'chhotu6826@gmail.com',
    passwordHash: process.env.ADMIN_PASSWORD || '312130',
    role: 'SUPER_ADMIN'
  });
  await superAdmin.save();
  console.log('✅ Super Admin created:', superAdmin.email);

  // 2. Create Shopkeeper A
  const shopkeeperA = new User({
    name: 'Rahul Sharma',
    email: 'shopkeeper@secureprint.in',
    passwordHash: 'Shop@SecurePrint123!',
    role: 'SHOPKEEPER'
  });
  await shopkeeperA.save();
  console.log('✅ Shopkeeper A created:', shopkeeperA.email);

  // Generate QR for Shop A
  const slugA = 'abc-digital-center';
  const qrTargetA = `${publicBaseUrl}/shop/${slugA}`;
  const qrDataUrlA = await QRCode.toDataURL(qrTargetA, {
    width: 500,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' }
  });

  const shopA = new Shop({
    name: 'ABC Digital Center',
    slug: slugA,
    address: {
      street: '12, MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001'
    },
    phone: '+91-98765-43210',
    email: 'abcdigital@example.com',
    ownerId: shopkeeperA._id,
    verificationStatus: 'VERIFIED',
    isActive: true,
    isSetupComplete: true,
    permanentQrDataUrl: qrDataUrlA,
    permanentQrTargetUrl: qrTargetA,
    permanentQrGeneratedAt: new Date(),
    pricing: {
      bwPerPage: 1,
      colorPerPage: 5,
      currency: 'INR'
    },
    supportedPaperSizes: ['A4', 'A3', 'Letter']
  });
  await shopA.save();
  console.log('✅ Shop A created:', shopA.name, `(/shop/${shopA.slug})`);

  // 3. Create Shopkeeper B (for testing isolation & new admin onboarding setup)
  const shopkeeperB = new User({
    name: 'Sunil Sharma',
    email: 'sharma@secureprint.in',
    passwordHash: 'Sharma@SecurePrint123!',
    role: 'SHOPKEEPER'
  });
  await shopkeeperB.save();
  console.log('✅ Shopkeeper B created:', shopkeeperB.email);

  // Generate QR for Shop B
  const slugB = 'sharma-photostat';
  const qrTargetB = `${publicBaseUrl}/shop/${slugB}`;
  const qrDataUrlB = await QRCode.toDataURL(qrTargetB, {
    width: 500,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' }
  });

  const shopB = new Shop({
    name: 'Sharma Photostat & Prints',
    slug: slugB,
    address: {
      street: '45, Station Road',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001'
    },
    phone: '+91-98111-22334',
    email: 'sharma.prints@example.com',
    ownerId: shopkeeperB._id,
    verificationStatus: 'VERIFIED',
    isActive: true,
    isSetupComplete: false, // Tests new admin setup onboarding flow!
    permanentQrDataUrl: qrDataUrlB,
    permanentQrTargetUrl: qrTargetB,
    permanentQrGeneratedAt: new Date(),
    pricing: {
      bwPerPage: 2,
      colorPerPage: 8,
      currency: 'INR'
    },
    supportedPaperSizes: ['A4', 'Legal']
  });
  await shopB.save();
  console.log('✅ Shop B created:', shopB.name, `(/shop/${shopB.slug})`);

  console.log('\n🎉 Multi-tenancy Seed complete!\n');
  console.log('───────────────────────────────────────────────────────');
  console.log('Super Admin:');
  console.log('  Email:', superAdmin.email);
  console.log('  Password: Admin@SecurePrint123!');
  console.log('  Role: SUPER_ADMIN');
  console.log('\nShop A:');
  console.log('  Shopkeeper: shopkeeper@secureprint.in (Shop@SecurePrint123!)');
  console.log('  Name:', shopA.name);
  console.log('  Slug URL:', qrTargetA);
  console.log('\nShop B:');
  console.log('  Shopkeeper: sharma@secureprint.in (Sharma@SecurePrint123!)');
  console.log('  Name:', shopB.name);
  console.log('  Slug URL:', qrTargetB);
  console.log('───────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
};

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
