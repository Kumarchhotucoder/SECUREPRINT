import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LandingPage from './pages/customer/LandingPage'
import ScanPage from './pages/customer/ScanPage'
import StatusPage from './pages/customer/StatusPage'
import ReceiptPage from './pages/customer/ReceiptPage'
import CustomerShopFlow from './pages/customer/CustomerShopFlow'
import ShopLogin from './pages/shop/ShopLogin'
import ShopRegister from './pages/shop/ShopRegister'
import PricingPage from './pages/customer/PricingPage'
import AgentInfoPage from './pages/customer/AgentInfoPage'
import ShopDashboard from './pages/shop/ShopDashboard'
import SubscriptionRequiredPage from './pages/shop/SubscriptionRequiredPage'
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin'
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard'
import api from './lib/api'

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner spinner-primary" style={{ width: 40, height: 40, borderWidth: 4 }} />
      <p>Loading SecurePrint...</p>
    </div>
  )
  if (!user) {
    return <Navigate to={role === 'SUPER_ADMIN' ? '/super-admin/login' : '/admin/login'} replace />
  }
  // Super admin route requires SUPER_ADMIN role
  if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/super-admin/login" replace />
  }
  // Shop Owner / Admin route — allow SHOP_OWNER, SHOPKEEPER, ADMIN, SHOP_STAFF, SUPER_ADMIN
  const allowedShopRoles = ['SHOP_OWNER', 'SHOPKEEPER', 'ADMIN', 'SHOP_STAFF', 'SUPER_ADMIN']
  if (role === 'SHOP_OWNER' && !allowedShopRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

const ShopSubscriptionGuard = ({ children }) => {
  const { user, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [isOperational, setIsOperational] = useState(false)

  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN') {
      setChecking(false)
      return
    }
    const checkSub = async () => {
      try {
        const res = await api.get('/subscriptions/status')
        if (res.data?.success && res.data.data?.isOperational) {
          setIsOperational(true)
        } else {
          setIsOperational(false)
        }
      } catch (err) {
        setIsOperational(false)
      } finally {
        setChecking(false)
      }
    }
    checkSub()
  }, [user])

  if (loading || checking) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-primary" style={{ width: 40, height: 40, borderWidth: 4 }} />
        <p>Verifying subscription status...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (user.role !== 'SUPER_ADMIN' && !isOperational) {
    return <Navigate to="/subscription/required" replace />
  }

  return children
}

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Customer routes */}
        <Route path="/" element={<LandingPage />} />
        {/* Permanent Counter QR Scan flow (/s/:slug and /shop/:slug) */}
        <Route path="/s/:slug" element={<CustomerShopFlow />} />
        <Route path="/shop/:slug" element={<CustomerShopFlow />} />
        <Route path="/scan/:token" element={<ScanPage />} />
        {/* Customer job tracking routes */}
        <Route path="/customer/job/:jobId" element={<StatusPage />} />
        <Route path="/status/:jobId" element={<StatusPage />} />
        <Route path="/receipt/:jobId" element={<ReceiptPage />} />

        {/* Marketing / SaaS Links */}
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/agent" element={<AgentInfoPage />} />
        <Route path="/features" element={<LandingPage />} />
        <Route path="/how-it-works" element={<LandingPage />} />
        <Route path="/contact" element={<LandingPage />} />

        {/* Authentication & Onboarding Pages */}
        <Route path="/login" element={<ShopLogin />} />
        <Route path="/signup" element={<ShopRegister />} />
        <Route path="/admin/login" element={<ShopLogin />} />
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route path="/shop/register" element={<ShopRegister />} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/plans" element={<Navigate to="/pricing" replace />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />

        {/* Subscription Gating & Public Payment Link */}
        <Route path="/subscription/required" element={<SubscriptionRequiredPage />} />
        <Route path="/subscription/pay/:token" element={<SubscriptionRequiredPage />} />
        <Route path="/subscription" element={<SubscriptionRequiredPage />} />

        {/* Shop Owner / Admin Dashboard (/admin and /shop/dashboard) */}
        <Route path="/admin/*" element={
          <ProtectedRoute role="SHOP_OWNER">
            <ShopSubscriptionGuard>
              <ShopDashboard />
            </ShopSubscriptionGuard>
          </ProtectedRoute>
        } />
        <Route path="/shop/dashboard/*" element={
          <ProtectedRoute role="SHOP_OWNER">
            <ShopSubscriptionGuard>
              <ShopDashboard />
            </ShopSubscriptionGuard>
          </ProtectedRoute>
        } />
        <Route path="/shop/queue" element={<Navigate to="/admin/queue" replace />} />
        <Route path="/shop/qr" element={<Navigate to="/admin/qr" replace />} />
        <Route path="/shop/history" element={<Navigate to="/admin/history" replace />} />

        {/* Super Admin Dashboard */}
        <Route path="/super-admin/*" element={
          <ProtectedRoute role="SUPER_ADMIN">
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
)

export default App
