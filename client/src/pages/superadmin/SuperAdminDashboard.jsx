import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  Shield, Users, Store, Printer, Lock, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, LogOut, Eye, Search, ToggleLeft, ToggleRight,
  ChevronRight, BarChart3, Activity, Clock, Plus, X, Edit2,
  TrendingUp, IndianRupee, Zap, Home, UserPlus, Key, Package, Link2, Copy
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

// ── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => (n || 0).toLocaleString('en-IN')
const fmtCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

const BADGE = {
  VERIFIED: { bg: '#D1FAE5', color: '#065F46', label: 'Verified' },
  PENDING:  { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  PENDING_PAYMENT: { bg: '#FEF3C7', color: '#92400E', label: 'Payment Pending' },
  SUSPENDED:{ bg: '#FEE2E2', color: '#991B1B', label: 'Suspended' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  EXPIRED:  { bg: '#FEE2E2', color: '#991B1B', label: 'Expired' },
  ACTIVE:   { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
  INACTIVE: { bg: '#F3F4F6', color: '#6B7280', label: 'Inactive' },
}

const StatusBadge = ({ label, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 999,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
    ...style
  }}>{label}</span>
)

// ── Stat Card ───────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = 'var(--color-primary)', gradient }) => (
  <div className="stat-card" style={gradient ? { background: gradient, border: 'none', color: 'white' } : {}}>
    <div className="stat-icon" style={{ background: gradient ? 'rgba(255,255,255,0.2)' : undefined, color: gradient ? 'white' : color }}>
      {icon}
    </div>
    <div className="stat-value" style={{ color: gradient ? 'white' : undefined }}>{value}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="stat-label" style={{ color: gradient ? 'rgba(255,255,255,0.85)' : undefined }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: gradient ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)', fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
)

// ── Create Shop Modal ────────────────────────────────────────────
const CreateShopModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    shopName: '', shopPhone: '', shopEmail: '', shopAddress: '',
    ownerName: '', ownerEmail: '', ownerPassword: '', plan: 'STARTER'
  })
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.shopName || !form.ownerEmail || !form.ownerPassword) {
      toast.error('Shop name, owner email and password are required')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/admin/shops', form)
      setCreated(res.data.data)
      toast.success(`Shop "${form.shopName}" created! Subscription payment pending.`)
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create shop')
    } finally { setSaving(false) }
  }

  if (created) return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)', color: '#92400E' }}>
            <Clock size={32} />
          </div>
          <h3 style={{ marginBottom: 'var(--space-2)' }}>Shop Created Successfully!</h3>
          <div style={{ display: 'inline-block', background: '#FEF3C7', color: '#92400E', padding: '4px 14px', borderRadius: 16, fontWeight: 700, fontSize: 13, marginBottom: 'var(--space-3)' }}>
            🟡 Subscription Payment Pending
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 'var(--space-5)' }}>
            This shop will remain locked until subscription payment is completed and verified.
          </p>
          <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', textAlign: 'left', marginBottom: 'var(--space-4)', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}><strong>Shop:</strong> {created.shop?.name}</div>
            <div style={{ marginBottom: 6 }}><strong>Plan:</strong> {created.shop?.subscription?.plan || form.plan} (₹{created.shop?.subscription?.monthlyPrice || 499}/mo)</div>
            <div style={{ marginBottom: 6 }}><strong>Login Email:</strong> {created.shopkeeperCredentials?.email}</div>
            <div style={{ marginBottom: 8 }}><strong>Password:</strong> <code style={{ fontSize: 12, background: '#FEF3C7', padding: '2px 6px', borderRadius: 4 }}>{created.shopkeeperCredentials?.password}</code></div>
            <div>
              <strong>Payment Link:</strong>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input readOnly className="input" style={{ fontSize: 11, padding: '4px 8px', height: 32 }} value={`${window.location.origin}${created.paymentLink || `/subscription/pay/${created.paymentToken}`}`} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${created.paymentLink || `/subscription/pay/${created.paymentToken}`}`)
                  toast.success('Payment link copied to clipboard!')
                }}>
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}${created.paymentLink || `/subscription/pay/${created.paymentToken}`}`)
              toast.success('Payment link copied!')
            }}>
              <Copy size={15} /> Copy Link
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={18} /> Create New Shop</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ padding: '12px 16px', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', fontWeight: 700, color: 'var(--color-primary)', fontSize: 13 }}>
              🏪 Shop Details
            </div>
            <div className="input-group">
              <label className="input-label">Shop Name *</label>
              <input className="input" value={form.shopName} onChange={e => set('shopName', e.target.value)} placeholder="ABC Digital Center" required />
            </div>
            <div className="admin-modal-grid-2">
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input className="input" value={form.shopPhone} onChange={e => set('shopPhone', e.target.value)} placeholder="+91-98765-43210" />
              </div>
              <div className="input-group">
                <label className="input-label">Shop Email</label>
                <input className="input" type="email" value={form.shopEmail} onChange={e => set('shopEmail', e.target.value)} placeholder="shop@example.com" />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Address (Street, City, State, Pincode)</label>
              <input className="input" value={form.shopAddress} onChange={e => set('shopAddress', e.target.value)} placeholder="MG Road, Pune, Maharashtra, 411001" />
            </div>

            <div className="input-group">
              <label className="input-label">Subscription Plan *</label>
              <select className="input" value={form.plan} onChange={e => set('plan', e.target.value)}>
                <option value="STARTER">Starter Print Partner (₹499/month)</option>
                <option value="PRO">Pro Printing Center (₹999/month)</option>
                <option value="ENTERPRISE">Commercial Print Hub (₹2,499/month)</option>
              </select>
            </div>

            <div style={{ padding: '12px 16px', background: '#EDE9FE', borderRadius: 'var(--radius-md)', fontWeight: 700, color: '#5B21B6', fontSize: 13, marginTop: 4 }}>
              👤 Shopkeeper Account
            </div>
            <div className="input-group">
              <label className="input-label">Shopkeeper Name</label>
              <input className="input" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} placeholder="Rahul Sharma" />
            </div>
            <div className="admin-modal-grid-2">
              <div className="input-group">
                <label className="input-label">Login Email *</label>
                <input className="input" type="email" value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} placeholder="shopkeeper@example.com" required />
              </div>
              <div className="input-group">
                <label className="input-label">Login Password *</label>
                <input className="input" type="text" value={form.ownerPassword} onChange={e => set('ownerPassword', e.target.value)} placeholder="Strong password" required />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 2 }}>
              {saving ? <><div className="spinner" />Creating...</> : <><Plus size={16} /> Create Shop</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Shop Modal ──────────────────────────────────────────────
const EditShopModal = ({ shop, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    verificationStatus: shop.verificationStatus || 'PENDING',
    isActive: shop.isActive,
    pricing_bw: shop.pricing?.bwPerPage || 1,
    pricing_color: shop.pricing?.colorPerPage || 5
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch(`/admin/shops/${shop._id}`, {
        verificationStatus: form.verificationStatus,
        isActive: form.isActive,
        pricing: { bwPerPage: Number(form.pricing_bw), colorPerPage: Number(form.pricing_color) }
      })
      toast.success('Shop updated!')
      onUpdated()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Edit2 size={18} /> Edit Shop</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ marginBottom: 'var(--space-4)', fontWeight: 700, color: 'var(--color-text)' }}>{shop.name}</div>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div className="input-group">
            <label className="input-label">Verification Status</label>
            <select className="input" value={form.verificationStatus} onChange={e => set('verificationStatus', e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Shop Status</label>
            <select className="input" value={form.isActive ? 'true' : 'false'} onChange={e => set('isActive', e.target.value === 'true')}>
              <option value="true">Active</option>
              <option value="false">Inactive / Deactivated</option>
            </select>
          </div>
          <div className="admin-modal-grid-2">
            <div className="input-group">
              <label className="input-label">B&W Rate (₹/page)</label>
              <input className="input" type="number" min={0} value={form.pricing_bw} onChange={e => set('pricing_bw', e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Colour Rate (₹/page)</label>
              <input className="input" type="number" min={0} value={form.pricing_color} onChange={e => set('pricing_color', e.target.value)} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><div className="spinner" />Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reset Password Modal ─────────────────────────────────────────
const ResetPasswordModal = ({ user, onClose }) => {
  const [pwd, setPwd] = useState('')
  const [saving, setSaving] = useState(false)

  const handleReset = async () => {
    if (!pwd || pwd.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setSaving(true)
    try {
      await api.patch(`/admin/users/${user._id}`, { newPassword: pwd })
      toast.success(`Password reset for ${user.name}`)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Key size={18} /> Reset Password</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Resetting password for <strong>{user.name}</strong> ({user.email})
        </p>
        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="input-label">New Password</label>
          <input className="input" type="text" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="New password (min 6 chars)" />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReset} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><div className="spinner" />Resetting...</> : <><Key size={16} /> Reset Password</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shop Detail Modal ────────────────────────────────────────────
const ShopDetailModal = ({ shop, onClose }) => (
  <div className="admin-modal-overlay">
    <div className="admin-modal" style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Store size={18} /> {shop.name}</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20} /></button>
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {/* Stats */}
        {shop.stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
            {[
              { label: 'Total Jobs', value: shop.stats.totalJobs },
              { label: 'Completed', value: shop.stats.completedJobs },
              { label: 'Pending', value: shop.stats.pendingJobs },
              { label: 'Revenue', value: fmtCurrency(shop.stats.revenue) },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {/* Info */}
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            ['Shop ID', shop._id],
            ['Slug', shop.slug ? `/shop/${shop.slug}` : '—'],
            ['Owner', `${shop.ownerId?.name} (${shop.ownerId?.email})`],
            ['Phone', shop.phone || '—'],
            ['Email', shop.email || '—'],
            ['City', `${shop.address?.city || '—'}, ${shop.address?.state || '—'}`],
            ['Pincode', shop.address?.pincode || '—'],
            ['B&W Rate', `₹${shop.pricing?.bwPerPage || 1}/page`],
            ['Colour Rate', `₹${shop.pricing?.colorPerPage || 5}/page`],
            ['Created', fmtDate(shop.createdAt)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-muted)', minWidth: 100, fontWeight: 600 }}>{k}</span>
              <span style={{ wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
        {/* QR */}
        {shop.permanentQrDataUrl && (
          <div style={{ textAlign: 'center', padding: 'var(--space-4)', background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)' }}>
            <img src={shop.permanentQrDataUrl} alt="Shop QR" style={{ width: 160, height: 160, borderRadius: 8 }} />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{shop.permanentQrTargetUrl}</p>
          </div>
        )}
      </div>
    </div>
  </div>
)

// ── Modal styles ─────────────────────────────────────────────────
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 'var(--space-4)', overflowY: 'auto'
}
const modalStyle = {
  background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-6)', width: '100%', maxWidth: 500,
  boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto'
}

// ── Main Component ───────────────────────────────────────────────
const SuperAdminDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('analytics')
  const [analytics, setAnalytics] = useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)

  const [shops, setShops] = useState([])
  const [loadingShops, setLoadingShops] = useState(false)
  const [shopSearch, setShopSearch] = useState('')
  const [togglingShopId, setTogglingShopId] = useState(null)

  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  const [auditLogs, setAuditLogs] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Modals
  const [showCreateShop, setShowCreateShop] = useState(false)
  const [editShop, setEditShop] = useState(null)
  const [viewShop, setViewShop] = useState(null)
  const [resetUser, setResetUser] = useState(null)

  // ── Fetchers ─────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true)
    try {
      const res = await api.get('/admin/analytics')
      setAnalytics(res.data.data)
    } catch { toast.error('Failed to load analytics') }
    finally { setLoadingAnalytics(false) }
  }, [])

  const fetchShops = useCallback(async () => {
    setLoadingShops(true)
    try {
      const res = await api.get('/admin/shops')
      setShops(res.data.data)
    } catch { toast.error('Failed to load shops') }
    finally { setLoadingShops(false) }
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await api.get('/admin/users')
      setUsers(res.data.data)
    } catch { toast.error('Failed to load users') }
    finally { setLoadingUsers(false) }
  }, [])

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    try {
      const q = customerSearch ? `?search=${encodeURIComponent(customerSearch)}` : ''
      const res = await api.get(`/admin/customers${q}`)
      setCustomers(res.data.data)
    } catch { toast.error('Failed to load customers') }
    finally { setLoadingCustomers(false) }
  }, [customerSearch])

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true)
    try {
      const res = await api.get('/admin/audit')
      setAuditLogs(res.data.data)
    } catch { toast.error('Failed to load audit logs') }
    finally { setLoadingAudit(false) }
  }, [])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  useEffect(() => {
    if (activeTab === 'shops') fetchShops()
    if (activeTab === 'users') fetchUsers()
    if (activeTab === 'customers') fetchCustomers()
    if (activeTab === 'audit') fetchAudit()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'customers') fetchCustomers()
  }, [customerSearch])

  // ── Actions ──────────────────────────────────────────────────
  const handleToggleShop = async (shopId, name) => {
    setTogglingShopId(shopId)
    try {
      const res = await api.patch(`/admin/shops/${shopId}/toggle-active`)
      toast.success(res.data.message)
      setShops(s => s.map(sh => sh._id === shopId ? { ...sh, isActive: res.data.data.isActive } : sh))
      fetchAnalytics()
    } catch (err) { toast.error(err.response?.data?.message || 'Toggle failed') }
    finally { setTogglingShopId(null) }
  }

  const handleViewShop = async (shopId) => {
    try {
      const res = await api.get(`/admin/shops/${shopId}`)
      setViewShop(res.data.data)
    } catch { toast.error('Failed to load shop details') }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/super-admin/login')
    toast.success('Logged out')
  }

  // ── Filter ───────────────────────────────────────────────────
  const filteredShops = shops.filter(s =>
    !shopSearch || s.name.toLowerCase().includes(shopSearch.toLowerCase()) ||
    s.slug?.includes(shopSearch.toLowerCase()) ||
    s.ownerId?.email?.includes(shopSearch.toLowerCase())
  )

  // ── Tabs ─────────────────────────────────────────────────────
  const tabs = [
    { id: 'analytics', label: 'Dashboard', icon: <Home size={16} /> },
    { id: 'shops', label: 'Shops', icon: <Store size={16} /> },
    { id: 'users', label: 'Shopkeepers', icon: <Users size={16} /> },
    { id: 'customers', label: 'Customers', icon: <Activity size={16} /> },
    { id: 'audit', label: 'Audit Logs', icon: <Lock size={16} /> },
  ]

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* ── TOP NAV ── */}
      <nav className="admin-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, #1A56DB, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
            <Shield size={18} />
          </div>
          <div>
            <div className="admin-nav-brand-title" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>SecurePrint</div>
            <div className="admin-nav-brand-sub" style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>SUPER ADMIN</div>
          </div>
        </div>
        <div className="admin-nav-user">
          <span className="admin-user-name" title={user?.name}>
            {user?.name}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchAnalytics} title="Refresh Dashboard"><RefreshCw size={15} /></button>
          <button className="btn btn-ghost btn-sm admin-logout-btn" onClick={handleLogout} title="Logout"><LogOut size={15} /> <span>Logout</span></button>
        </div>
      </nav>

      {/* ── TABS ── */}
      <div className="admin-tabs-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="admin-tab-btn"
            style={{
              color: activeTab === t.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div className="admin-content-container">

        {/* ═══════════════════ ANALYTICS TAB ═══════════════════ */}
        {activeTab === 'analytics' && (
          <div className="animate-fadeIn">
            <div className="admin-page-header">
              <div>
                <h1 style={{ marginBottom: 2 }}>Platform Overview</h1>
                <p style={{ color: 'var(--color-text-secondary)' }}>Live SecurePrint network analytics</p>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => { setShowCreateShop(true) }}>
                <Plus size={15} /> New Shop
              </button>
            </div>

            {loadingAnalytics ? (
              <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 36, height: 36 }} /><p>Loading analytics...</p></div>
            ) : analytics ? (
              <>
                {/* Primary Stats */}
                <div className="stats-grid" style={{ marginBottom: 'var(--space-6)' }}>
                  <StatCard gradient="linear-gradient(135deg, #1A56DB 0%, #1246B5 100%)"
                    icon={<Store size={20} />} label="Total Shops" value={fmt(analytics.shops?.total)}
                    sub={`${analytics.shops?.active} active`} />
                  <StatCard gradient="linear-gradient(135deg, #059669 0%, #047857 100%)"
                    icon={<IndianRupee size={20} />} label="Total Revenue" value={fmtCurrency(analytics.revenue?.total)}
                    sub={`₹${analytics.revenue?.today || 0} today`} />
                  <StatCard gradient="linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)"
                    icon={<Users size={20} />} label="Total Customers" value={fmt(analytics.customers?.allTime)}
                    sub={`${analytics.customers?.today} today`} />
                  <StatCard gradient="linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)"
                    icon={<Printer size={20} />} label="Total Print Jobs" value={fmt(analytics.jobs?.total)}
                    sub={`${analytics.jobs?.today} today`} />
                </div>

                {/* Secondary Stats */}
                <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
                  <StatCard icon={<CheckCircle size={20} />} label="Completed Jobs" value={fmt(analytics.jobs?.completed)} color="#059669" />
                  <StatCard icon={<Clock size={20} />} label="Pending Jobs" value={fmt(analytics.jobs?.pending)} color="#D97706" />
                  <StatCard icon={<CheckCircle size={20} />} label="Verified Shops" value={fmt(analytics.shops?.verified)} color="#7C3AED" />
                  <StatCard icon={<TrendingUp size={20} />} label="This Month Customers" value={fmt(analytics.customers?.thisMonth)} color="#0EA5E9" />
                </div>

                {/* Shop Breakdown Table */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} /> Shop Performance</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('shops')}><ChevronRight size={15} /> Manage Shops</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)' }}>
                          {['Shop', 'Owner', 'Jobs', 'Customers', 'Revenue', 'Status'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.shopBreakdowns?.map(s => (
                          <tr key={s.id} style={{ borderTop: '1px solid var(--color-border)', transition: 'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                              <div>{s.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>/shop/{s.slug}</div>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{s.ownerName}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>{s.jobsCount}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>{s.sessionsCount}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>{fmtCurrency(s.revenue)}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <StatusBadge label={s.isActive ? 'Active' : 'Inactive'} style={s.isActive ? BADGE.ACTIVE : BADGE.INACTIVE} />
                            </td>
                          </tr>
                        ))}
                        {!analytics.shopBreakdowns?.length && (
                          <tr><td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No shops yet. Create one!</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="error-page"><div className="error-icon">⚠</div><p>Failed to load analytics</p><button className="btn btn-primary" onClick={fetchAnalytics}>Retry</button></div>
            )}
          </div>
        )}

        {/* ═══════════════════ SHOPS TAB ═══════════════════════ */}
        {activeTab === 'shops' && (
          <div className="animate-fadeIn">
            <div className="admin-page-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Store size={20} /> Shop Management</h2>
              <div className="admin-search-wrapper">
                <div className="admin-search-container" style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input className="input admin-search-input" placeholder="Search shops..." value={shopSearch} onChange={e => setShopSearch(e.target.value)}
                    style={{ paddingLeft: 34, width: 220 }} />
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchShops} title="Refresh"><RefreshCw size={14} /></button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateShop(true)}><Plus size={14} /> Add Shop</button>
              </div>
            </div>

            {loadingShops ? (
              <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 36, height: 36 }} /><p>Loading shops...</p></div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="admin-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['#', 'Shop', 'Slug', 'Shopkeeper', 'Plan', 'Subscription', 'Status', 'Created', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShops.map((shop, i) => (
                        <tr key={shop._id} style={{ borderTop: '1px solid var(--color-border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700 }}>{shop.name}</div>
                            {shop.address?.city && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shop.address.city}, {shop.address.state}</div>}
                          </td>
                          <td style={{ padding: '12px 14px' }}><code style={{ fontSize: 11, background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4 }}>{shop.slug}</code></td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600 }}>{shop.ownerId?.name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shop.ownerId?.email || ''}</div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-primary)' }}>
                              {shop.subscription?.plan || 'STARTER'}
                            </span>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                              ₹{shop.subscription?.monthlyPrice || 499}/mo
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <StatusBadge
                              label={BADGE[shop.subscription?.status || shop.status]?.label || (shop.subscription?.status || shop.status || 'PENDING')}
                              style={BADGE[shop.subscription?.status || shop.status] || BADGE.PENDING}
                            />
                            {shop.subscription?.paymentToken && shop.subscription?.status !== 'ACTIVE' && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, padding: '2px 6px', color: 'var(--color-primary)' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/subscription/pay/${shop.subscription.paymentToken}`)
                                  toast.success('Payment link copied!')
                                }}
                                title="Copy Payment Link"
                              >
                                <Link2 size={11} /> Copy Pay Link
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <StatusBadge label={shop.isActive ? 'Active' : 'Inactive'} style={shop.isActive ? BADGE.ACTIVE : BADGE.INACTIVE} />
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(shop.createdAt)}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-icon" title="View Details" onClick={() => handleViewShop(shop._id)}><Eye size={15} /></button>
                              <button className="btn btn-ghost btn-icon" title="Edit Shop" onClick={() => setEditShop(shop)}><Edit2 size={15} /></button>
                              <button
                                className="btn btn-ghost btn-icon"
                                title={shop.isActive ? 'Deactivate' : 'Activate'}
                                onClick={() => handleToggleShop(shop._id, shop.name)}
                                disabled={togglingShopId === shop._id}
                              >
                                {shop.isActive ? <ToggleRight size={18} style={{ color: '#059669' }} /> : <ToggleLeft size={18} style={{ color: '#DC2626' }} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredShops.length && (
                        <tr><td colSpan={9} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          {shopSearch ? 'No shops match your search.' : 'No shops yet. Click "Add Shop" to create one.'}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ USERS TAB ═══════════════════════ */}
        {activeTab === 'users' && (
          <div className="animate-fadeIn">
            <div className="admin-page-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={20} /> Shopkeeper Accounts</h2>
              <div className="admin-search-wrapper">
                <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchUsers} title="Refresh"><RefreshCw size={14} /></button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateShop(true)}><UserPlus size={14} /> Add Shop + Shopkeeper</button>
              </div>
            </div>

            {loadingUsers ? (
              <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 36, height: 36 }} /></div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="admin-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u._id} style={{ borderTop: '1px solid var(--color-border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{u.name}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{u.email}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: u.role === 'SUPER_ADMIN' ? '#EDE9FE' : 'var(--color-primary-light)', color: u.role === 'SUPER_ADMIN' ? '#5B21B6' : 'var(--color-primary)' }}>
                              {u.role}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <StatusBadge label={u.isActive ? 'Active' : 'Inactive'} style={u.isActive ? BADGE.ACTIVE : BADGE.INACTIVE} />
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                            {u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setResetUser(u)} style={{ gap: 4 }}>
                              <Key size={13} /> Reset Password
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!users.length && (
                        <tr><td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No users found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ CUSTOMERS TAB ═══════════════════ */}
        {activeTab === 'customers' && (
          <div className="animate-fadeIn">
            <div className="admin-page-header">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={20} /> Customer Sessions</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>Metadata only — no document contents accessible here</p>
              </div>
              <div className="admin-search-wrapper">
                <div className="admin-search-container" style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input className="input admin-search-input" placeholder="Search by customer name..." value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
                </div>
              </div>
            </div>

            {loadingCustomers ? (
              <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 36, height: 36 }} /></div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="admin-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['Customer', 'Shop', 'Jobs', 'Created', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(c => (
                        <tr key={c.id} style={{ borderTop: '1px solid var(--color-border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{c.customerName}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{c.shopName}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 700 }}>{c.jobsCount}</span>
                            {c.jobsSummary?.map(j => (
                              <div key={j.jobNumber} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>#{j.jobNumber} · {j.status} · {j.totalPages}p</div>
                            ))}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <StatusBadge label={c.sessionStatus} style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }} />
                          </td>
                        </tr>
                      ))}
                      {!customers.length && (
                        <tr><td colSpan={5} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No customer sessions found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ AUDIT TAB ═══════════════════════ */}
        {activeTab === 'audit' && (
          <div className="animate-fadeIn">
            <div className="admin-page-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={20} /> Security Audit Log</h2>
              <button className="btn btn-ghost btn-sm" onClick={fetchAudit}><RefreshCw size={14} /> Refresh</button>
            </div>
            {loadingAudit ? (
              <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 36, height: 36 }} /></div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="admin-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['Time', 'Event', 'Severity', 'IP', 'Details'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => {
                        const sevColor = { INFO: '#0EA5E9', WARNING: '#D97706', CRITICAL: '#DC2626' }[log.severity] || '#6B7280'
                        return (
                          <tr key={log._id} style={{ borderTop: '1px solid var(--color-border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                              {fmtDate(log.createdAt)}<br />{fmtTime(log.createdAt)}
                            </td>
                            <td style={{ padding: '10px 16px', fontWeight: 700 }}>{log.eventType}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: sevColor + '20', color: sevColor }}>{log.severity}</span>
                            </td>
                            <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)', fontSize: 12 }}>{log.ipAddress || '—'}</td>
                            <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {log.metadata ? JSON.stringify(log.metadata) : ''}
                            </td>
                          </tr>
                        )
                      })}
                      {!auditLogs.length && (
                        <tr><td colSpan={5} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No audit logs found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── MODALS ── */}
      {showCreateShop && (
        <CreateShopModal
          onClose={() => setShowCreateShop(false)}
          onCreated={() => { fetchShops(); fetchAnalytics() }}
        />
      )}
      {editShop && (
        <EditShopModal
          shop={editShop}
          onClose={() => setEditShop(null)}
          onUpdated={() => { fetchShops(); fetchAnalytics() }}
        />
      )}
      {viewShop && (
        <ShopDetailModal shop={viewShop} onClose={() => setViewShop(null)} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  )
}

export default SuperAdminDashboard
