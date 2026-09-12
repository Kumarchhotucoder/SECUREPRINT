# SecurePrint — Production Multi-Tenant SaaS Printing Platform

> **"Print documents without WhatsApp."**  
> *SCAN → UPLOAD → SEND → PRINT → PAY*

SecurePrint is a production-grade multi-tenant SaaS application designed for cyber cafes, photocopy shops, and commercial printing centers. It provides dedicated shop portals, permanent QR codes, automated Razorpay payments, real-time printing queues, and a cryptographically verified, server-side 10-second post-payment auto-deletion pipeline.

---

## 🚀 Key Features

- **Multi-Tenant SaaS Architecture**: Strict tenant isolation across shops, owners, staff, and customers.
- **Permanent Shop QR & Canonical Routes**: Unique slug-based URLs (`/s/:shopSlug` and `/shop/:shopSlug`) generated with canonical HTTPS domain.
- **Dual Payment Systems**:
  - **Platform SaaS Subscription**: Shop Owner → SecurePrint (Trial, Starter ₹499/mo, Pro ₹999/mo).
  - **Customer Print Payment**: Customer → Shop (tamper-proof server-side calculation & Razorpay HMAC-SHA256 verification).
- **Automated 10-Second File Lifecycle**:
  - Printing Completed transitions job to `AWAITING_PAYMENT` with files preserved.
  - Verification of payment triggers a server-side 10-second countdown (`CLEANUP_COUNTDOWN`).
  - Underlying storage objects are permanently deleted, access URLs invalidated (HTTP 404), and `filesDeleted: true` recorded.
- **Daily IST Dashboard**: Midnight reset in `Asia/Kolkata` time for operational counters while permanently preserving historical analytics and audit logs.
- **Real-Time Synchronization**: Instant status updates and cleanup events via WebSockets (Socket.io).
- **Role-Based Access Control (RBAC)**: Platform Super Admin, Shop Owner, Shop Staff, and Temporary Customer Sessions.

---

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide Icons, Socket.io Client, QRCode.react
- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.io, Razorpay SDK, JWT, Crypto
- **Security**: Helmet, Express Rate Limit, HMAC-SHA256 payment signature verification, strict tenant ownership middleware

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB (running locally or MongoDB Atlas URI)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Kumarchhotucoder/SECUREPRINT.git
cd SECUREPRINT

# Install root, client, and server dependencies
npm install
cd client && npm install
cd ../server && npm install
cd ..
```

### 3. Environment Configuration
Copy `.env.example` to `server/.env` and update the values:
```bash
cp .env.example server/.env
```

### 4. Running the Project
```bash
# Start both server and client concurrently
npm run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5001`
