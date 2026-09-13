import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LandingPage from './pages/customer/LandingPage'
import ScanPage from './pages/customer/ScanPage'
import StatusPage from './pages/customer/StatusPage'
import ReceiptPage from './pages/customer/ReceiptPage'
import CustomerShopFlow from './pages/customer/CustomerShopFlow'
import ShopLogin from './pages/shop/ShopLogin'
import ShopRegister from './pages/shop/ShopRegister'
import ShopDashboard from './pages/shop/ShopDashboard'
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin'
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard'

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner spinner-primary" style={{ width: 40, height: 40, borderWidth: 4 }} />
      <p>Loading SecurePrint...</p>
    </div>
  )
  if (!user) {
    return <Navigate to={role === 'SUPER_ADMIN' ? '/super-admin/login' : '/shop/login'} replace />
  }
  // Super admin route requires SUPER_ADMIN role
  if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/super-admin/login" replace />
  }
  // Shopkeeper route — allow SHOPKEEPER, ADMIN, SUPER_ADMIN
  if (role === 'SHOPKEEPER' && !['SHOPKEEPER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return <Navigate to="/" replace />
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
        <Route path="/status/:jobId" element={<StatusPage />} />
        <Route path="/receipt/:jobId" element={<ReceiptPage />} />

        {/* Marketing / SaaS Links */}
        <Route path="/pricing" element={<Navigate to="/plans" replace />} />
        <Route path="/features" element={<LandingPage />} />
        <Route path="/how-it-works" element={<LandingPage />} />
        <Route path="/contact" element={<LandingPage />} />

        {/* Authentication & Onboarding Pages */}
        <Route path="/login" element={<Navigate to="/shop/login" replace />} />
        <Route path="/signup" element={<Navigate to="/shop/register" replace />} />
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route path="/shop/register" element={<ShopRegister />} />
        <Route path="/register" element={<Navigate to="/shop/register" replace />} />
        <Route path="/plans" element={<Navigate to="/shop/register" replace />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />

        {/* Shopkeeper Dashboard */}
        <Route path="/shop/dashboard/*" element={
          <ProtectedRoute role="SHOPKEEPER">
            <ShopDashboard />
          </ProtectedRoute>
        } />
        <Route path="/shop/queue" element={<Navigate to="/shop/dashboard/queue" replace />} />
        <Route path="/shop/qr" element={<Navigate to="/shop/dashboard/qr" replace />} />
        <Route path="/shop/history" element={<Navigate to="/shop/dashboard/history" replace />} />

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
