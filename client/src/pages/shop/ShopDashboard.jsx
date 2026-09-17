import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Shield, LayoutDashboard, PrinterIcon, QrCode, History,
  LogOut, Menu, X, RefreshCw, ChevronRight,
  CheckCircle, Clock, AlertCircle, FileText, Image, File,
  Play, Check, XCircle, Eye, ExternalLink, Sparkles, MapPin, Tag, Users, Laptop,
  CreditCard, BarChart3, Settings, Bell, User as UserIcon
} from 'lucide-react'
import api from '../../lib/api'
import EditShopDetailsModal from './EditShopDetailsModal'
import ShopSetupScreen from './ShopSetupScreen'
import PrinterManagement from './PrinterManagement'
import SmartPrintModal from './SmartPrintModal'
import { showTopAlert } from '../../utils/notifications'


// ── Sidebar Navigation ─────────────────────────────────────────
const Sidebar = ({ shop, open, onClose, onOpenEditModal }) => {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login')
    toast.success('Logged out')
  }

  const basePath = location.pathname.startsWith('/shop/dashboard') ? '/shop/dashboard' : '/admin'

  const navItems = [
    { path: `${basePath}`, label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
    { path: `${basePath}/queue`, label: 'Print Jobs', icon: <PrinterIcon size={18} /> },
    { path: `${basePath}/customers`, label: 'Customers', icon: <Users size={18} /> },
    { path: `${basePath}/payments`, label: 'Payments', icon: <CreditCard size={18} /> },
    { path: `${basePath}/printers`, label: 'Printers', icon: <PrinterIcon size={18} /> },
    { path: `${basePath}/agent`, label: 'Print Agent', icon: <Laptop size={18} /> },
    { path: `${basePath}/qr`, label: 'QR Code', icon: <QrCode size={18} /> },
    { path: `${basePath}/analytics`, label: 'Analytics', icon: <BarChart3 size={18} /> },
    { path: `${basePath}/subscription`, label: 'Subscription', icon: <Sparkles size={18} /> },
    { path: `${basePath}/settings`, label: 'Shop Settings', icon: <Settings size={18} /> },
    { path: `${basePath}/notifications`, label: 'Notifications', icon: <Bell size={18} /> },
    { path: `${basePath}/profile`, label: 'Profile', icon: <UserIcon size={18} /> },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {open && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }} onClick={onClose} />}

      <div className={`sidebar ${open ? 'open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon"><Shield size={18} /></div>
          SecurePrint
          <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto', display: 'none' }} id="sidebar-close">
            <X size={18} />
          </button>
        </div>

        {/* Shop info */}
        {shop && (
          <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-1)' }}>
              Your Shop
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>{shop.name}</div>
            {shop.verificationStatus === 'VERIFIED' && (
              <span className="badge badge-verified" style={{ marginTop: 4, fontSize: '0.65rem' }}>
                <CheckCircle size={10} /> Verified Counter
              </span>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Quick Edit Rates Button in Sidebar */}
        <div style={{ padding: '0 var(--space-6)', marginBottom: 'var(--space-4)' }}>
          <button
            id="sidebar-edit-rates-btn"
            className="btn btn-secondary btn-sm w-full"
            style={{ justifyContent: 'center', gap: 6, fontWeight: 700 }}
            onClick={() => {
              if (onClose) onClose();
              if (onOpenEditModal) onOpenEditModal();
            }}
          >
            ✏️ Edit Counter Rates
          </button>
        </div>

        {/* Bottom */}
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
            Signed in as <strong>{user?.name || 'Shopkeeper'}</strong>
          </div>
          <button className="btn btn-ghost btn-sm w-full" onClick={handleLogout} style={{ justifyContent: 'flex-start' }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Dashboard Overview ─────────────────────────────────────────
const DashboardHome = ({ shop, stats, refreshStats, socket, refreshTrigger, onOpenEditModal }) => {
  const navigate = useNavigate()
  const [recentJobs, setRecentJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)

  const fetchRecentJobs = useCallback(async () => {
    if (!shop?._id) return
    try {
      const res = await api.get(`/shops/${shop._id}/jobs?limit=5`)
      setRecentJobs(res.data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingJobs(false)
    }
  }, [shop])

  useEffect(() => {
    fetchRecentJobs()
  }, [fetchRecentJobs, refreshTrigger])

  // Periodic polling fallback (every 6 seconds) so updates are always 100% automated
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecentJobs()
      refreshStats()
    }, 6000)
    return () => clearInterval(interval)
  }, [fetchRecentJobs, refreshStats])

  // Socket listener for new jobs, payments, and status changes
  useEffect(() => {
    if (!socket) return
    const handleUpdate = () => {
      fetchRecentJobs()
      refreshStats()
    }
    const handleCashReq = (data) => {
      fetchRecentJobs()
      refreshStats()
      toast(`💵 Cash payment requested for Job #${data?.jobNumber || ''} (₹${data?.amount || ''})`, { icon: '💵', duration: 6000 })
    }
    socket.on('new-job', handleUpdate)
    socket.on('payment-received', handleUpdate)
    socket.on('job-updated', handleUpdate)
    socket.on('job-files-deleted', handleUpdate)
    socket.on('payment-requested-cash', handleCashReq)
    socket.on('cash-payment-requested', handleCashReq)
    return () => {
      socket.off('new-job', handleUpdate)
      socket.off('payment-received', handleUpdate)
      socket.off('job-updated', handleUpdate)
      socket.off('job-files-deleted', handleUpdate)
      socket.off('payment-requested-cash', handleCashReq)
      socket.off('cash-payment-requested', handleCashReq)
    }
  }, [socket, fetchRecentJobs, refreshStats])

  const handleJobAction = async (jobId, action) => {
    try {
      await api.post(`/jobs/${jobId}/${action}`)
      toast.success(action === 'receive' ? 'Job received!' : action === 'print' ? 'Printing started!' : 'Job completed!')
      fetchRecentJobs()
      refreshStats()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed')
    }
  }

  return (
    <div className="animate-fadeIn">
      {/* Welcome & Refresh Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ marginBottom: 'var(--space-1)', fontSize: 'var(--font-size-2xl)' }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}! 👋
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Welcome to <strong>{shop?.name || 'SecurePrint Shop'}</strong>. All operations are live and secure.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { refreshStats(); fetchRecentJobs(); toast.success('Data refreshed') }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Quick Action Banners */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)'
      }}>
        <div
          onClick={() => navigate('/shop/dashboard/queue')}
          style={{
            background: 'linear-gradient(135deg, #1A56DB 0%, #1246B5 100%)',
            color: 'white',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-primary)',
            transition: 'transform 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                Incoming Queue
              </span>
              <PrinterIcon size={20} />
            </div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>
              {stats.pending || 0} Pending
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-3)', opacity: 0.9, fontWeight: 600 }}>
            Open Print Queue <ChevronRight size={14} />
          </div>
        </div>

        <div
          onClick={() => navigate('/shop/dashboard/qr')}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Counter QR Code
              </span>
              <QrCode size={20} color="var(--color-primary)" />
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text)' }}>
              Display / Print QR
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginTop: 'var(--space-3)', fontWeight: 600 }}>
            Show Shop QR <ChevronRight size={14} />
          </div>
        </div>

        <div
          onClick={() => navigate('/shop/dashboard/history')}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Completed Jobs
              </span>
              <History size={20} color="var(--color-verified)" />
            </div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-text)' }}>
              {stats.completed || 0} Printed
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', fontWeight: 600 }}>
            View Full History <ChevronRight size={14} />
          </div>
        </div>
      </div>

      {/* Stats Grid — Exact 8 Required Production Metrics */}
      <div className="stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)'
      }}>
        {[
          { label: "Today's Jobs", value: stats.todayJobs ?? ((stats.active || 0) + (stats.pending || 0) + (stats.completed || 0)), icon: <FileText size={20} />, bg: '#EFF6FF', color: 'var(--color-primary)' },
          { label: "Today's Revenue", value: `₹${(stats.todayRevenue ?? 0).toLocaleString('en-IN')}`, icon: <CreditCard size={20} />, bg: '#ECFDF5', color: '#059669' },
          { label: 'Pending Jobs', value: stats.pendingJobs ?? stats.pending ?? 0, icon: <Clock size={20} />, bg: '#FFF7ED', color: '#D97706' },
          { label: 'Printing Jobs', value: stats.printingJobs ?? stats.active ?? 0, icon: <PrinterIcon size={20} />, bg: '#F5F3FF', color: '#7C3AED' },
          { label: 'Completed Jobs', value: stats.completedJobs ?? stats.completed ?? 0, icon: <CheckCircle size={20} />, bg: '#F0FDF4', color: 'var(--color-verified)' },
          { label: 'Pending Payments', value: stats.pendingPayments ?? 0, icon: <CreditCard size={20} />, bg: '#FEF2F2', color: '#DC2626' },
          { label: 'Active Printers', value: stats.activePrinters || `${stats.activePrintersCount || 0}/${stats.totalPrinters || 0}`, icon: <PrinterIcon size={20} />, bg: '#F0F9FF', color: '#0284C7' },
          { label: 'Agent Status', value: stats.agentStatus === 'ONLINE' ? '🟢 Online' : '🔴 Offline', icon: <Laptop size={20} />, bg: stats.agentStatus === 'ONLINE' ? '#F0FDF4' : '#FEF2F2', color: stats.agentStatus === 'ONLINE' ? '#16A34A' : '#DC2626' }
        ].map((s, i) => (
          <div key={i} className="stat-card animate-slideUp" style={{ animationDelay: `${i * 0.04}s`, padding: 'var(--space-4)' }}>
            <div className="stat-icon" style={{ background: s.bg, color: s.color, width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.icon}
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{s.value}</div>
              <div className="stat-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Shop Info & Live Status Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        {/* Recent Jobs Preview */}
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <PrinterIcon size={18} color="var(--color-primary)" />
              Recent Print Jobs
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/shop/dashboard/queue')}>
              View All <ChevronRight size={14} />
            </button>
          </div>

          {loadingJobs ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div className="spinner spinner-primary" />
            </div>
          ) : recentJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
              <PrinterIcon size={36} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
              <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>No print jobs in queue yet</p>
              <p style={{ fontSize: 'var(--font-size-xs)', maxWidth: 280, margin: '0 auto var(--space-4)' }}>
                Display your shop QR at the counter so customers can scan and upload files.
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/shop/dashboard/qr')}>
                <QrCode size={14} /> Open Shop QR Code
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {recentJobs.slice(0, 4).map(job => {
                const statusColors = {
                  READY: { bg: '#FFF7ED', color: '#D97706', label: 'Pending' },
                  RECEIVED: { bg: '#EFF6FF', color: 'var(--color-primary)', label: 'Received' },
                  PRINTING: { bg: '#F0FDF4', color: 'var(--color-verified)', label: 'Printing' },
                  COMPLETED: { bg: 'var(--color-surface-2)', color: 'var(--color-text-muted)', label: 'Done' }
                }
                const sc = statusColors[job.status] || statusColors.COMPLETED
                return (
                  <div key={job._id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                        Job #{job.jobNumber}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {job.totalFiles} files · {job.totalPages} pgs · {job.colorMode === 'BW' ? 'B&W' : 'Colour'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="badge" style={{ background: sc.bg, color: sc.color, fontSize: '0.7rem' }}>
                        {sc.label}
                      </span>
                      {job.status === 'READY' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleJobAction(job._id, 'receive')}>
                          Receive
                        </button>
                      )}
                      {job.status === 'RECEIVED' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleJobAction(job._id, 'print')}>
                          Print
                        </button>
                      )}
                      {job.status === 'PRINTING' && (
                        <button className="btn btn-success btn-sm" style={{ fontWeight: 800 }} onClick={() => handleJobAction(job._id, 'complete')}>
                          Mark Printing Completed
                        </button>
                      )}
                      {(job.paymentStatus === 'CASH_PAYMENT_PENDING' || job.paymentStatus === 'PAYMENT_PENDING_CASH') && (
                        <button
                          className="btn btn-warning btn-sm"
                          style={{ fontWeight: 800 }}
                          onClick={async () => {
                            try {
                              toast.loading('Confirming cash...', { id: 'cash-c' })
                              await api.post('/payments/confirm-cash', { jobId: job._id })
                              toast.dismiss('cash-c')
                              toast.success('Cash confirmed! 10s cleanup started.')
                              fetchRecentJobs()
                              refreshStats()
                            } catch (e) {
                              toast.dismiss('cash-c')
                              toast.error(e.response?.data?.message || 'Failed to confirm cash')
                            }
                          }}
                        >
                          Confirm Cash (₹{job.finalPrice || job.estimatedPrice})
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Counter Info & Rates Card */}
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Shield size={18} color="var(--color-verified)" />
              Counter Details & Pricing
            </h3>
            <button
              id="edit-counter-details-btn"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              onClick={onOpenEditModal}
            >
              ✏️ Edit Details & Rates
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Shop Name</span>
              <span style={{ fontWeight: 600 }}>{shop?.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Location</span>
              <span style={{ fontWeight: 600 }}>{shop?.address?.city || 'Pune'}, {shop?.address?.state || 'Maharashtra'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
              <span className="badge badge-verified" style={{ fontSize: '0.65rem' }}>
                <CheckCircle size={10} /> Active & Verified
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>B&W Rate</span>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>₹{shop?.pricing?.bwPerPage ?? 1} / page</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Colour Rate</span>
              <span style={{ fontWeight: 700, color: '#059669' }}>₹{shop?.pricing?.colorPerPage ?? 5} / page</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Paper Sizes</span>
              <span style={{ fontWeight: 600 }}>{(shop?.supportedPaperSizes || ['A4', 'A3', 'Letter']).join(', ')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Print Queue ────────────────────────────────────────────────
const PrintQueue = ({ shop, socket, refreshTrigger }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all') // Default to 'all' so shopkeeper sees everything
  const [smartPrintJob, setSmartPrintJob] = useState(null)

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!shop?._id) return
    if (!isSilent) setLoading(true)
    try {
      const statusMap = {
        all: '',
        pending: 'READY',
        active: 'RECEIVED',
        printing: 'PRINTING',
        completed: 'COMPLETED'
      }
      const statusParam = statusMap[activeTab] ? `&status=${statusMap[activeTab]}` : ''
      const res = await api.get(`/shops/${shop._id}/jobs?limit=50${statusParam}`)
      setJobs(res.data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shop, activeTab])

  useEffect(() => { fetchJobs() }, [fetchJobs, refreshTrigger])

  // Periodic polling fallback (every 5 seconds) so queue is always 100% real-time
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  useEffect(() => {
    if (!socket) return
    const handleUpdate = () => {
      fetchJobs(true)
    }
    socket.on('new-job', handleUpdate)
    socket.on('payment-received', handleUpdate)
    socket.on('job-updated', handleUpdate)
    socket.on('job-files-deleted', handleUpdate)
    return () => {
      socket.off('new-job', handleUpdate)
      socket.off('payment-received', handleUpdate)
      socket.off('job-updated', handleUpdate)
      socket.off('job-files-deleted', handleUpdate)
    }
  }, [socket, fetchJobs])

  const updateJobStatus = async (jobId, action) => {
    try {
      await api.post(`/jobs/${jobId}/${action}`)
      toast.success(action === 'receive' ? 'Job received' : action === 'print' ? 'Printing started' : action === 'cancel' ? 'Job cancelled' : 'Job completed')
      fetchJobs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed')
    }
  }

  const handleJobAction = (target, action) => {
    if (action === 'smart-print') {
      setSmartPrintJob(target)
      return
    }
    const jobId = typeof target === 'object' ? target._id : target
    updateJobStatus(jobId, action)
  }

  const tabs = [
    { key: 'all', label: 'All Jobs', color: 'var(--color-primary)' },
    { key: 'pending', label: 'Pending (Ready)', color: 'var(--color-warning)' },
    { key: 'active', label: 'Received', color: 'var(--color-primary)' },
    { key: 'printing', label: 'Printing', color: 'var(--color-verified)' },
    { key: 'completed', label: 'Completed', color: 'var(--color-text-muted)' }
  ]

  return (
    <div className="animate-fadeIn" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>Print Queue</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
            Real-time incoming print requests from counter scans.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchJobs} style={{ flexShrink: 0 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="queue-tab-bar" style={{
        display: 'flex', gap: 'var(--space-1)',
        background: 'var(--color-surface-2)',
        borderRadius: 'var(--radius-lg)',
        padding: 4,
        marginBottom: 'var(--space-4)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="queue-tab"
            style={{
              flex: '0 0 auto',
              padding: '8px 14px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab.key ? 'white' : 'transparent',
              color: activeTab === tab.key ? tab.color : 'var(--color-text-muted)',
              boxShadow: activeTab === tab.key ? 'var(--shadow-sm)' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner spinner-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{
          textAlign: 'center',
          padding: 'var(--space-8) var(--space-4)',
          color: 'var(--color-text-muted)',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          <PrinterIcon size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.25 }} />
          <h3 style={{ color: 'var(--color-text)', marginBottom: 'var(--space-1)', fontSize: 'var(--font-size-lg)' }}>
            No {activeTab !== 'all' ? activeTab : ''} print jobs found
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', maxWidth: 340, margin: '0 auto', wordBreak: 'break-word', lineHeight: 1.5 }}>
            When customers scan your counter QR code and submit documents, their jobs appear right here in real time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {jobs.map(job => (
            <JobCard key={job._id} job={job} onAction={handleJobAction} />
          ))}
        </div>
      )}

      {/* Smart Physical Print Dialog */}
      {smartPrintJob && (
        <SmartPrintModal
          job={smartPrintJob}
          socket={socket}
          onClose={() => setSmartPrintJob(null)}
          onJobUpdated={(jobId, action) => {
            updateJobStatus(jobId, action)
            fetchJobs(true)
          }}
        />
      )}
    </div>
  )
}

// ── Job Card ───────────────────────────────────────────────────
const JobCard = ({ job, onAction }) => {
  const statusColors = {
    READY: { bg: '#FFF7ED', color: '#D97706', label: 'Pending (Ready)' },
    RECEIVED: { bg: '#EFF6FF', color: 'var(--color-primary)', label: 'Received' },
    PRINTING: { bg: '#F0FDF4', color: 'var(--color-verified)', label: 'Printing' },
    AWAITING_PAYMENT: { bg: '#FEF3C7', color: '#B45309', label: 'Awaiting Payment' },
    CLEANUP_COUNTDOWN: { bg: '#EDE9FE', color: '#7C3AED', label: '10s Cleanup' },
    COMPLETED: { bg: '#ECFDF5', color: '#059669', label: 'Completed' },
    CANCELLED: { bg: '#FEE2E2', color: '#DC2626', label: 'Cancelled' }
  }
  const sc = statusColors[job.status] || statusColors.COMPLETED
  const isPaid = job.paymentStatus === 'PAID'

  return (
    <div className="job-card animate-fadeIn" style={{
      borderLeft: job.status === 'AWAITING_PAYMENT' ? '4px solid #F59E0B' : job.filesDeleted ? '4px solid #10B981' : undefined
    }}>
      <div className="job-card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="job-number">#{job.jobNumber}</div>
            <div style={{
              background: '#EFF6FF',
              color: 'var(--color-primary)',
              padding: '3px 12px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 800,
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid #BFDBFE'
            }}>
              👤 {job.customerName || 'Customer'}
            </div>
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Received: {new Date(job.createdAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="badge" style={{ background: sc.bg, color: sc.color, fontWeight: 700 }}>{sc.label}</span>
          <span className="badge" style={{
            background: isPaid ? '#ECFDF5' : '#FEF3C7',
            color: isPaid ? '#059669' : '#B45309',
            fontWeight: 800,
            fontSize: '0.75rem'
          }}>
            {isPaid ? '✓ PAID' : 'PAYMENT PENDING'}
          </span>
        </div>
      </div>

      {/* Files info */}
      <div style={{
        background: 'var(--color-surface-2)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-4)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          <span>{job.totalFiles} file{job.totalFiles !== 1 ? 's' : ''}</span>
          <span>{job.totalPages} total pages</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          <span>Mode: <strong>{job.colorMode === 'BW' ? 'Black & White' : 'Colour'}</strong></span>
          <span>Paper: <strong>{job.paperSize}</strong></span>
          <span>Copies: <strong>{job.copies}</strong></span>
          <span>Sides: <strong>{job.duplex ? 'Double-sided' : 'Single-sided'}</strong></span>
        </div>
      </div>

      {/* Price & Payment Row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3)', background: '#F8FAFC', borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-3)'
      }}>
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block' }}>Payable Amount</span>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-xl)', color: 'var(--color-primary)' }}>₹{job.finalPrice || job.estimatedPrice}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block' }}>Payment Method</span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: isPaid ? '#059669' : '#B45309' }}>
            {isPaid ? '✓ Razorpay / Verified' : 'Awaiting Online/Cash'}
          </span>
        </div>
      </div>

      {/* Lifecycle Audit Timestamps (Req 19) */}
      <div style={{
        fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)',
        display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 'var(--space-3)',
        background: 'var(--color-surface)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)'
      }}>
        <div>Printing: <strong>{job.completedAt ? `✓ Completed (${new Date(job.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})` : 'In Progress'}</strong></div>
        <div>Payment: <strong style={{ color: isPaid ? '#059669' : '#B45309' }}>{isPaid ? `✓ ₹${job.finalPrice || job.estimatedPrice} PAID (${job.paidAt ? new Date(job.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Verified'})` : '⏳ PENDING'}</strong></div>
        <div>Documents: <strong style={{ color: job.filesDeleted ? '#059669' : '#6B7280' }}>{job.filesDeleted ? `✓ Deleted (${job.deletedAt ? new Date(job.deletedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Verified'})` : isPaid ? '⏳ 10-sec cleanup in progress...' : 'Stored safely until payment'}</strong></div>
      </div>

      {/* Actions */}
      <div className="job-actions">
        {job.status === 'READY' && (
          <button id={`print-now-${job._id}`} className="btn btn-primary" style={{ flex: 1, gap: 8, fontWeight: 700 }} onClick={() => onAction(job, 'smart-print')}>
            <PrinterIcon size={18} /> PRINT NOW
          </button>
        )}
        {job.status === 'RECEIVED' && (
          <button id={`print-${job._id}`} className="btn btn-primary" style={{ flex: 1, gap: 8, fontWeight: 700 }} onClick={() => onAction(job, 'smart-print')}>
            <PrinterIcon size={18} /> Start Printing
          </button>
        )}
        {job.status === 'PRINTING' && (
          <button id={`complete-${job._id}`} className="btn btn-success" style={{ flex: 1, gap: 8, fontWeight: 800 }} onClick={() => onAction(job._id, 'complete')}>
            <Check size={18} /> MARK PRINTING COMPLETED
          </button>
        )}

        {/* Section 17 & 45: Dedicated Cash Payment Request Banner */}
        {(job.paymentStatus === 'CASH_PAYMENT_PENDING' || job.paymentStatus === 'PAYMENT_PENDING_CASH') && !isPaid && (
          <div style={{
            background: '#FEF3C7',
            border: '2px solid #F59E0B',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
            color: '#92400E',
            width: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Banknote size={15} /> CASH PAYMENT REQUESTED
              </span>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#B45309' }}>
                ₹{job.finalPrice || job.estimatedPrice}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#78350F', marginBottom: 8 }}>
              Customer <strong>{job.customerName}</strong> requested cash payment. Verify cash received at counter.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id={`confirm-cash-${job._id}`}
                className="btn btn-success btn-xs"
                style={{ flex: 2, fontWeight: 800, fontSize: 11, padding: '6px 10px' }}
                onClick={async () => {
                  try {
                    toast.loading('Confirming cash received...', { id: 'cash-conf' })
                    await api.post('/payments/confirm-cash', { jobId: job._id })
                    toast.dismiss('cash-conf')
                    toast.success('Cash payment confirmed! 10-second cleanup started.')
                    if (onAction) onAction(job._id, 'refresh')
                  } catch (e) {
                    toast.dismiss('cash-conf')
                    toast.error(e.response?.data?.message || 'Failed to confirm cash.')
                  }
                }}
              >
                <Check size={13} /> CONFIRM CASH RECEIVED
              </button>
              <button
                id={`reject-cash-${job._id}`}
                className="btn btn-ghost btn-xs"
                style={{ flex: 1, fontWeight: 700, fontSize: 10, color: '#DC2626', border: '1px solid #FCA5A5' }}
                onClick={async () => {
                  try {
                    toast.loading('Rejecting cash payment...', { id: 'cash-rej' })
                    await api.post('/payments/reject-cash', { jobId: job._id })
                    toast.dismiss('cash-rej')
                    toast('Cash payment request rejected.')
                    if (onAction) onAction(job._id, 'refresh')
                  } catch (e) {
                    toast.dismiss('cash-rej')
                    toast.error('Failed to reject cash.')
                  }
                }}
              >
                REJECT
              </button>
            </div>
          </div>
        )}

        {job.status === 'AWAITING_PAYMENT' && !isPaid && job.paymentStatus !== 'CASH_PAYMENT_PENDING' && job.paymentStatus !== 'PAYMENT_PENDING_CASH' && (
          <button
            id={`mark-paid-${job._id}`}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, gap: 6, fontWeight: 700, borderColor: '#10B981', color: '#047857' }}
            onClick={async () => {
              try {
                toast.loading('Confirming counter payment...', { id: 'cash-pay' })
                await api.post('/payments/confirm-cash', { jobId: job._id })
                toast.dismiss('cash-pay')
                toast.success('Counter cash confirmed! 10-second file cleanup started.')
                if (onAction) onAction(job._id, 'refresh')
              } catch (e) {
                toast.dismiss('cash-pay')
                toast.error(e.response?.data?.message || 'Failed to confirm payment')
              }
            }}
          >
            💵 Confirm Counter Cash Payment
          </button>
        )}
        {['READY', 'RECEIVED'].includes(job.status) && (
          <button className="btn btn-ghost btn-icon" onClick={() => onAction(job._id, 'cancel')} title="Cancel job">
            <XCircle size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── QR Management ──────────────────────────────────────────────
const QRManagement = ({ shop }) => {
  const [qrData, setQrData] = useState(() => {
    if (shop?.permanentQrDataUrl) {
      return {
        qrDataUrl: shop.permanentQrDataUrl,
        qrTargetUrl: shop.permanentQrTargetUrl || `${window.location.origin}/shop/${shop.slug}`
      }
    }
    return null
  })
  const [loading, setLoading] = useState(!qrData)
  const [fetchError, setFetchError] = useState(false)

  const fetchPermanentQR = async () => {
    if (!shop?._id) return
    setLoading(true)
    setFetchError(false)
    try {
      const res = await api.get(`/shops/${shop._id}/permanent-qr`)
      if (res.data?.data) {
        setQrData(res.data.data)
      }
    } catch {
      // Fallback to shop's own cached permanentQrDataUrl without window.location.origin
      if (shop?.permanentQrDataUrl) {
        const target = shop.permanentQrTargetUrl || (import.meta.env.VITE_PUBLIC_APP_URL ? `${import.meta.env.VITE_PUBLIC_APP_URL}/shop/${shop.slug}` : `${window.location.origin}/shop/${shop.slug}`)
        setQrData({
          qrDataUrl: shop.permanentQrDataUrl,
          qrTargetUrl: target
        })
      } else {
        setFetchError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (shop?._id) {
      fetchPermanentQR()
    }
  }, [shop?._id])

  // Single source of truth for public QR destination
  const shopSlugUrl = qrData?.qrTargetUrl || shop?.permanentQrTargetUrl || (import.meta.env.VITE_PUBLIC_APP_URL ? `${import.meta.env.VITE_PUBLIC_APP_URL}/shop/${shop?.slug || 'my-shop'}` : `/shop/${shop?.slug || 'my-shop'}`)
  const isLocal = !shopSlugUrl || /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\./i.test(shopSlugUrl)

  const handlePrintStandee = () => {
    window.print()
  }

  return (
    <div className="animate-fadeIn">
      <h2 style={{ marginBottom: 'var(--space-2)' }}>Permanent Counter QR Code</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Display this permanent QR standee on your counter sticker or table stand. Customers scan this exact same QR code every time with any phone camera or Google Lens.
      </p>

      <div className="qr-container" id="printable-standee" style={{ background: 'white', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', border: '2px solid #E2E8F0', boxShadow: 'var(--shadow-md)' }}>
        {qrData ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#EFF6FF',
                color: 'var(--color-primary)',
                padding: '4px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 800,
                letterSpacing: '0.05em',
                marginBottom: 'var(--space-3)'
              }}>
                <Shield size={14} /> SECUREPRINT DIGITAL COUNTER
              </div>
              <div style={{ fontWeight: 900, fontSize: 'var(--font-size-2xl)', color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 2 }}>
                {shop?.name?.toUpperCase()}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                Direct Scan · No Saving Phone Number · No WhatsApp
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid #E2E8F0', display: 'inline-block' }}>
              <img
                src={qrData.qrDataUrl}
                alt="Shop Permanent QR Code"
                className="qr-image"
                style={{ width: 260, height: 260, display: 'block', borderRadius: 'var(--radius-md)' }}
              />
            </div>

            {/* Technical QR Destination Preview */}
            <div style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              background: '#F8FAFC',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid #E2E8F0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                QR Destination (Scannable Target):
              </div>
              <div style={{
                fontSize: 'var(--font-size-xs)',
                color: isLocal ? '#DC2626' : '#2563EB',
                fontFamily: 'monospace',
                fontWeight: 700,
                wordBreak: 'break-all'
              }}>
                {shopSlugUrl}
              </div>
            </div>

            {/* Developer Warning if local address is used */}
            {isLocal && (
              <div style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: 'var(--radius-md)',
                color: '#991B1B',
                fontSize: 'var(--font-size-xs)',
                textAlign: 'left',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <AlertCircle size={15} color="#DC2626" />
                  WARNING: Local Address Detected
                </div>
                <div>
                  This QR is using a local address (<code>{shopSlugUrl}</code>) and cannot be scanned from an external mobile device over cellular data.
                </div>
                <div style={{ marginTop: 4, color: '#7F1D1D', fontSize: '0.75rem' }}>
                  👉 Configure <code>PUBLIC_APP_URL</code> in <code>server/.env</code> to your live HTTPS domain or public development tunnel.
                </div>
              </div>
            )}

            {!isLocal && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 'var(--space-3)' }}>
                <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>
                  <CheckCircle size={10} /> Live Public HTTPS QR
                </span>
                <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>
                  <CheckCircle size={10} /> Scannable on Any Phone
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-8)' }}>
            {fetchError ? (
              <div>
                <AlertCircle size={32} color="#EF4444" style={{ margin: '0 auto var(--space-2)' }} />
                <p style={{ color: '#EF4444', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Unable to load counter QR</p>
                <button className="btn btn-secondary btn-sm" onClick={fetchPermanentQR}>
                  🔄 Retry Loading QR
                </button>
              </div>
            ) : (
              <div>
                <div className="spinner spinner-primary" style={{ margin: '0 auto var(--space-4)' }} />
                <p>Loading permanent counter QR...</p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons — NO REGENERATE BUTTON */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%', marginTop: 'var(--space-6)' }}>
          {qrData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 'var(--space-3)' }}>
              <button
                id="download-qr-btn"
                className="btn btn-primary"
                style={{ gap: 8, justifyContent: 'center', minHeight: 44 }}
                onClick={() => {
                  const link = document.createElement('a')
                  link.download = `${shop?.slug || 'shop'}-counter-qr.png`
                  link.href = qrData.qrDataUrl
                  link.click()
                  toast.success('Downloaded standee QR PNG!')
                }}
              >
                💾 Download QR Image
              </button>

              <button
                id="print-qr-btn"
                className="btn btn-secondary"
                style={{ gap: 8, justifyContent: 'center', minHeight: 44 }}
                onClick={handlePrintStandee}
              >
                🖨️ Print QR Standee
              </button>
            </div>
          )}

          <a
            href={shopSlugUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, wordBreak: 'break-all', textAlign: 'center', fontSize: '13px' }}
          >
            <ExternalLink size={16} style={{ flexShrink: 0 }} /> <span>Open Customer Flow</span>
          </a>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginTop: 'var(--space-4)' }}>
        <Shield size={16} />
        <span style={{ fontSize: 'var(--font-size-xs)' }}>
          <strong>Fixed QR Guarantee:</strong> This QR code is permanent and never expires. Multiple customers can scan it at the same time; each customer gets their own isolated upload session with zero file sharing.
        </span>
      </div>
    </div>
  )
}


// ── Job History ────────────────────────────────────────────────
const JobHistory = ({ shop, socket, refreshTrigger }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!shop?._id) return
    if (!isSilent) setLoading(true)
    try {
      const res = await api.get(`/shops/${shop._id}/jobs?status=COMPLETED&limit=50`)
      setJobs(res.data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shop?._id])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs, refreshTrigger])

  // Periodic polling fallback (every 8 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs(true)
    }, 8000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  useEffect(() => {
    if (!socket) return
    const handleUpdate = () => {
      fetchJobs(true)
    }
    socket.on('job-updated', handleUpdate)
    socket.on('payment-received', handleUpdate)
    socket.on('job-files-deleted', handleUpdate)
    return () => {
      socket.off('job-updated', handleUpdate)
      socket.off('payment-received', handleUpdate)
      socket.off('job-files-deleted', handleUpdate)
    }
  }, [socket, fetchJobs])

  return (
    <div className="animate-fadeIn">
      <h2 style={{ marginBottom: 'var(--space-2)' }}>Job History</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Zero-knowledge audit trail — document files are permanently deleted; only metadata is preserved for billing and logs.
      </p>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner spinner-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
          <History size={48} style={{ margin: '0 auto var(--space-4)', opacity: 0.3 }} />
          <h3 style={{ color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>No completed jobs yet</h3>
          <p style={{ fontSize: 'var(--font-size-sm)', maxWidth: 300, margin: '0 auto' }}>
            Once jobs in your print queue are marked complete, their billing records will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {jobs.map(job => (
            <div key={job._id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Job #{job.jobNumber}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    Completed: {new Date(job.completedAt || job.createdAt).toLocaleString('en-IN')}
                  </div>
                  {job.filesDeleted ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-verified)', fontSize: '11px', fontWeight: 700, marginTop: 3 }}>
                      <CheckCircle size={12} />
                      <span>Files deleted ({new Date(job.deletedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })})</span>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-warning)', fontSize: '11px', marginTop: 3 }}>
                      Cleanup in progress...
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--color-primary)' }}>₹{job.finalPrice || job.estimatedPrice}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {job.totalFiles} files · {job.totalPages} pages · {job.colorMode === 'BW' ? 'B&W' : 'Colour'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Customers Tab ──────────────────────────────────────────────
const CustomersTab = ({ shop }) => {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shop?._id) return
    api.get(`/shops/${shop._id}/jobs?limit=50`).then(res => {
      const jobs = res.data.data || []
      const customerMap = {}
      jobs.forEach(j => {
        const name = j.customerName || 'Customer'
        if (!customerMap[name]) {
          customerMap[name] = {
            name,
            totalJobs: 0,
            totalPages: 0,
            totalSpend: 0,
            lastVisit: j.createdAt
          }
        }
        customerMap[name].totalJobs += 1
        customerMap[name].totalPages += j.totalPages || 1
        customerMap[name].totalSpend += j.finalPrice || j.estimatedPrice || 0
      })
      setCustomers(Object.values(customerMap))
    }).catch(console.error).finally(() => setLoading(false))
  }, [shop])

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Customers</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Customer print sessions and engagement history for {shop?.name}.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}><div className="spinner spinner-primary" /></div>
      ) : customers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <Users size={40} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
          <p style={{ fontWeight: 600 }}>No customer sessions recorded yet</p>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Customers will appear here automatically when they scan your counter QR.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Jobs Printed</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Total Pages</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Total Revenue</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Last Printed</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>{c.name}</td>
                    <td style={{ padding: '14px 16px' }}>{c.totalJobs} job(s)</td>
                    <td style={{ padding: '14px 16px' }}>{c.totalPages} page(s)</td>
                    <td style={{ padding: '14px 16px', color: '#16A34A', fontWeight: 700 }}>₹{c.totalSpend}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                      {new Date(c.lastVisit).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Payments Tab ───────────────────────────────────────────────
const PaymentsTab = ({ shop }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shop?._id) return
    api.get(`/shops/${shop._id}/jobs?limit=50`).then(res => {
      setJobs(res.data.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [shop])

  const paidJobs = jobs.filter(j => j.paymentStatus === 'PAID')
  const totalRevenue = paidJobs.reduce((sum, j) => sum + (j.finalPrice || j.estimatedPrice || 0), 0)

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Payments & Transactions</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            Direct customer print payments verified by server.
          </p>
        </div>
        <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700 }}>Settled Total</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16A34A' }}>₹{totalRevenue}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}><div className="spinner spinner-primary" /></div>
      ) : paidJobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <CreditCard size={40} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
          <p style={{ fontWeight: 600 }}>No completed payments yet</p>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            When customers pay via UPI or Counter Cash, transaction records will appear here.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Job #</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Amount</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Method</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {paidJobs.map((j) => (
                  <tr key={j._id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>#{j.jobNumber}</td>
                    <td style={{ padding: '14px 16px' }}>{j.customerName}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--color-primary)' }}>₹{j.finalPrice || j.estimatedPrice}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge badge-verified" style={{ fontSize: '0.7rem' }}>UPI / Direct</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ color: '#16A34A', fontWeight: 700, fontSize: '0.75rem' }}>✓ PAID</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                      {new Date(j.paidAt || j.updatedAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Agent Tab ──────────────────────────────────────────────────
const AgentTab = ({ shop }) => {
  const [pairingCode, setPairingCode] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [agents, setAgents] = useState([])

  const fetchAgents = useCallback(() => {
    if (!shop?._id) return
    api.get('/printers').then(res => {
      setAgents(res.data.data?.agents || [])
    }).catch(console.error)
  }, [shop])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const handleGenerateCode = async () => {
    setGenerating(true)
    try {
      const res = await api.post('/printers/pairing-code')
      setPairingCode(res.data.data?.pairingCode)
      toast.success('Pairing code generated! Valid for 10 minutes.')
      fetchAgents()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate code')
    } finally {
      setGenerating(false)
    }
  }

  const activeAgent = agents.find(a => a.status === 'ONLINE') || agents[0]

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Print Agent Configuration</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            Desktop bridge connecting Windows hardware printers to SecurePrint Cloud.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleGenerateCode} disabled={generating}>
          <Laptop size={16} /> {generating ? 'Generating...' : '+ Connect Computer'}
        </button>
      </div>

      {pairingCode && (
        <div className="card" style={{ background: '#EFF6FF', border: '2px dashed #3B82F6', padding: 24, marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase' }}>
            Enter this 6-digit code in SecurePrint Print Agent:
          </div>
          <div style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '0.15em', color: '#1E40AF', margin: '12px 0' }}>
            {pairingCode}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#60A5FA' }}>
            Expires in 10 minutes · Single-use secure token exchange
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Laptop size={20} color="var(--color-primary)" />
            Agent Connection Status
          </h3>
          {activeAgent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
                <span style={{ fontWeight: 800, color: activeAgent.status === 'ONLINE' ? '#16A34A' : '#DC2626' }}>
                  {activeAgent.status === 'ONLINE' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Computer Name</span>
                <span style={{ fontWeight: 700 }}>{activeAgent.computerName || 'Counter Computer'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>OS</span>
                <span style={{ fontWeight: 700 }}>{activeAgent.os || 'Windows'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Last Seen</span>
                <span>{new Date(activeAgent.lastSeenAt).toLocaleString('en-IN')}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No Print Agent paired yet. Click <strong>+ Connect Computer</strong> above to link your Windows counter computer.
            </p>
          )}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={20} color="#D97706" />
            Quick CLI Runner
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Run directly in terminal on your shop's Windows PC:
          </p>
          <div style={{ background: '#0F172A', color: '#38BDF8', padding: 14, borderRadius: 10, fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.8, marginTop: 10 }}>
            <div>cd agent</div>
            <div>node cli.js pair &lt;6-DIGIT-CODE&gt;</div>
            <div>node cli.js start</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Analytics Tab ──────────────────────────────────────────────
const AnalyticsTab = ({ shop, stats }) => {
  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Shop Analytics</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Live metrics for {shop?.name} (Resets daily at 00:00 Asia/Kolkata).
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Today's Revenue</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16A34A', marginTop: 4 }}>₹{stats.todayRevenue || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Resets at midnight IST</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Lifetime Revenue</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary)', marginTop: 4 }}>₹{stats.lifetimeRevenue || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Total customer payments</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Today's Pages Printed</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#9333EA', marginTop: 4 }}>{stats.todayPages || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Total sheets printed</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Printers</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0284C7', marginTop: 4 }}>{stats.activePrinters || '0/0'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Ready machines</div>
        </div>
      </div>
    </div>
  )
}

// ── Subscription Tab ───────────────────────────────────────────
const SubscriptionTab = ({ shop, onUpdated }) => {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    api.get('/subscriptions/plans').then(res => {
      setPlans(res.data.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleActivateTrial = async () => {
    setActivating(true)
    try {
      const res = await api.post('/subscriptions/activate-trial')
      toast.success(res.data.data?.message || 'Trial activated!')
      if (onUpdated) onUpdated(prev => ({ ...prev, subscription: res.data.data.subscription }))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate trial')
    } finally {
      setActivating(false)
    }
  }

  const sub = shop?.subscription || {}

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>SaaS Subscription</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Manage your SecurePrint platform subscription plan and counter entitlements.
        </p>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 32, background: 'linear-gradient(135deg, #1E3A8A, #1D4ED8)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Active Plan
            </span>
            <h3 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '8px 0 4px', color: 'white' }}>
              {sub.plan || 'TRIAL'} PLAN
            </h3>
            <p style={{ color: '#BFDBFE', fontSize: '0.85rem', margin: 0 }}>
              Status: <strong>{sub.status || 'ACTIVE'}</strong> · Valid until: {new Date(sub.validUntil || Date.now()).toLocaleDateString('en-IN')}
            </p>
          </div>
          {sub.plan === 'TRIAL' && (
            <button className="btn btn-secondary" onClick={handleActivateTrial} disabled={activating} style={{ background: 'white', color: '#1D4ED8', fontWeight: 800 }}>
              {activating ? 'Extending...' : 'Extend 7-Day Trial'}
            </button>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 20 }}>Available Plans</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}><div className="spinner spinner-primary" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {plans.map((p) => (
            <div key={p.id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', borderRadius: 16 }}>
              <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 6 }}>{p.name}</h4>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-primary)', marginBottom: 16 }}>
                ₹{p.price} <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ {p.durationDays} days</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.features?.map((feat, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <CheckCircle size={16} color="#16A34A" /> {feat}
                  </li>
                ))}
              </ul>
              <button
                className={`btn ${sub.plan === p.id ? 'btn-secondary' : 'btn-primary'} w-full`}
                disabled={sub.plan === p.id}
                style={{ justifyContent: 'center', fontWeight: 700 }}
              >
                {sub.plan === p.id ? 'Current Plan' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings Tab ───────────────────────────────────────────────
const SettingsTab = ({ shop, onUpdated }) => {
  const [formData, setFormData] = useState({
    name: shop?.name || '',
    phone: shop?.phone || '',
    email: shop?.email || '',
    bwPerPage: shop?.pricing?.bwPerPage ?? 1,
    colorPerPage: shop?.pricing?.colorPerPage ?? 5
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.put('/shops/my', {
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        pricing: {
          bwPerPage: Number(formData.bwPerPage),
          colorPerPage: Number(formData.colorPerPage)
        }
      })
      toast.success('Shop settings updated successfully!')
      if (onUpdated) onUpdated(res.data.data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Shop Settings</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Configure your counter details and custom per-page customer print rates.
        </p>
      </div>

      <form onSubmit={handleSave} className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700 }}>Shop Display Name</label>
          <input
            type="text"
            className="form-input"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Contact Phone</label>
            <input
              type="text"
              className="form-input"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Contact Email</label>
            <input
              type="email"
              className="form-input"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>B&W Rate (₹/page)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              className="form-input"
              value={formData.bwPerPage}
              onChange={e => setFormData({ ...formData, bwPerPage: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Color Rate (₹/page)</label>
            <input
              type="number"
              min="1"
              step="0.5"
              className="form-input"
              value={formData.colorPerPage}
              onChange={e => setFormData({ ...formData, colorPerPage: e.target.value })}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 8, justifyContent: 'center' }}>
          {saving ? 'Saving...' : 'Save Counter Settings'}
        </button>
      </form>
    </div>
  )
}

// ── Notifications Tab ──────────────────────────────────────────
const NotificationsTab = ({ shop, socket }) => {
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'SecurePrint System Initialized', time: 'Just now', type: 'system', icon: '🔒' }
  ])

  useEffect(() => {
    if (!socket) return
    const onNewJob = (d) => {
      setNotifications(prev => [
        { id: Date.now(), title: `New Print Request: #${d.jobNumber} from ${d.customerName}`, time: 'Just now', type: 'job', icon: '🖨️' },
        ...prev
      ])
    }
    const onPayment = (d) => {
      setNotifications(prev => [
        { id: Date.now(), title: `Payment Verified: ₹${d.amount} for Job #${d.jobNumber}`, time: 'Just now', type: 'payment', icon: '💰' },
        ...prev
      ])
    }
    const onDeletion = (d) => {
      setNotifications(prev => [
        { id: Date.now(), title: `Files Purged: Job #${d.jobNumber} documents permanently removed from disk`, time: 'Just now', type: 'deletion', icon: '🛡️' },
        ...prev
      ])
    }

    socket.on('new-job', onNewJob)
    socket.on('payment-received', onPayment)
    socket.on('job-files-deleted', onDeletion)

    return () => {
      socket.off('new-job', onNewJob)
      socket.off('payment-received', onPayment)
      socket.off('job-files-deleted', onDeletion)
    }
  }, [socket])

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Real-Time Notifications</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Live feed of counter requests, print events, payments, and automated file deletions.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notifications.map((n) => (
          <div key={n.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: '1.4rem' }}>{n.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{n.title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Profile Tab ────────────────────────────────────────────────
const ProfileTab = ({ user }) => {
  return (
    <div className="animate-fadeIn" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 0 }}>Shopkeeper Profile</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          Authenticated account credentials and tenant security context.
        </p>
      </div>

      <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem' }}>
            {user?.name?.[0] || 'S'}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{user?.name || 'Shop Owner'}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>{user?.email}</div>
            <span className="badge badge-verified" style={{ marginTop: 6, fontSize: '0.7rem' }}>
              ROLE: {user?.role || 'SHOP_OWNER'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Tenant Isolation</span>
            <span style={{ fontWeight: 700, color: '#16A34A' }}>Active (Strict Server-Side)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Authentication Protocol</span>
            <span style={{ fontWeight: 700 }}>JWT + Refresh Tokens</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard Component ───────────────────────────────────
const ShopDashboard = () => {
  const { user } = useAuth()
  const location = useLocation()
  const [shop, setShop] = useState(null)
  const [stats, setStats] = useState({ active: 0, pending: 0, completed: 0, todayPages: 0, todayRevenue: 0 })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [socket, setSocket] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Fetch shop + connect socket
  useEffect(() => {
    api.get('/shops/my').then(res => {
      const s = res.data.data
      setShop(s)
      // Connect socket and join shop room
      const socketUrl = import.meta.env.VITE_SOCKET_URL || '/'
      const sock = io(socketUrl, { transports: ['websocket', 'polling'] })
      sock.emit('join-shop', s._id)
      setSocket(sock)
      return s
    }).catch(console.error)
  }, [])

  const fetchStats = useCallback(async () => {
    if (!shop?._id) return
    try {
      const res = await api.get(`/shops/${shop._id}/stats`)
      setStats(res.data.data)
    } catch {}
  }, [shop])

  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Listen for real-time events to update stats, show top notifications, and trigger auto-refresh
  useEffect(() => {
    if (!socket) return

    const onNewJob = (data) => {
      fetchStats()
      setRefreshTrigger(t => t + 1)
      showTopAlert({
        type: 'new-job',
        icon: '📄',
        title: `New Print Job #${data.jobNumber || ''}!`,
        subtitle: `${data.customerName || 'Customer'} · ${data.totalFiles || 1} file(s) (${data.totalPages || 1} pgs) · ₹${data.estimatedPrice || ''}`,
        duration: 6500
      })
    }

    const onPaymentReceived = (data) => {
      fetchStats()
      setRefreshTrigger(t => t + 1)
      showTopAlert({
        type: 'payment',
        icon: '💰',
        title: `Payment Received: ₹${data.amount || ''}!`,
        subtitle: `Job #${data.jobNumber || ''} (${data.customerName || 'Customer'}) · 10-sec cleanup started`,
        duration: 6500
      })
    }

    const onJobUpdated = (data) => {
      fetchStats()
      setRefreshTrigger(t => t + 1)
      if (data?.paymentStatus === 'PAID' && data?.amount) {
        showTopAlert({
          type: 'payment',
          icon: '💰',
          title: `Payment Verified: ₹${data.amount}!`,
          subtitle: `Job #${data.jobNumber || ''} (${data.customerName || 'Customer'})`,
          duration: 5000
        })
      }
    }

    const onJobFilesDeleted = (data) => {
      fetchStats()
      setRefreshTrigger(t => t + 1)
      showTopAlert({
        type: 'deletion',
        icon: '🛡️',
        title: 'Files Permanently Deleted',
        subtitle: `Job #${data?.jobNumber || ''} documents erased from counter storage.`,
        duration: 4000,
        playSound: false
      })
    }

    socket.on('new-job', onNewJob)
    socket.on('payment-received', onPaymentReceived)
    socket.on('job-updated', onJobUpdated)
    socket.on('job-files-deleted', onJobFilesDeleted)

    return () => {
      socket.off('new-job', onNewJob)
      socket.off('payment-received', onPaymentReceived)
      socket.off('job-updated', onJobUpdated)
      socket.off('job-files-deleted', onJobFilesDeleted)
    }
  }, [socket, fetchStats])

  // 1. If new admin/shopkeeper hasn't completed initial setup, show setup page first
  if (shop && !shop.isSetupComplete) {
    return <ShopSetupScreen shop={shop} onSetupComplete={(updated) => setShop(updated)} />
  }

  const pageTitle = () => {
    if (location.pathname.includes('/queue')) return 'Print Jobs'
    if (location.pathname.includes('/printers')) return 'Printer Management'
    if (location.pathname.includes('/customers')) return 'Customers'
    if (location.pathname.includes('/payments')) return 'Payments'
    if (location.pathname.includes('/agent')) return 'Windows Print Agent'
    if (location.pathname.includes('/qr')) return 'Shop QR Code'
    if (location.pathname.includes('/history')) return 'Job History'
    if (location.pathname.includes('/analytics')) return 'Analytics'
    if (location.pathname.includes('/subscription')) return 'Subscription & Billing'
    if (location.pathname.includes('/settings')) return 'Shop Settings'
    if (location.pathname.includes('/notifications')) return 'Notifications'
    if (location.pathname.includes('/profile')) return 'Shopkeeper Profile'
    return 'Dashboard'
  }

  return (
    <div className="dashboard-layout">
      <Sidebar
        shop={shop}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenEditModal={() => setEditModalOpen(true)}
      />

      <div className="dashboard-main">
        {/* Top bar */}
        <div className="dashboard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, overflow: 'hidden' }}>
            <button
              className="btn btn-ghost btn-icon"
              id="sidebar-toggle"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle navigation"
              style={{ flexShrink: 0, padding: 8 }}
            >
              <Menu size={20} />
            </button>
            <h3 style={{
              fontSize: 'var(--font-size-base)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {pageTitle()}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            {/* Edit button — compact on mobile */}
            <button
              id="header-edit-rates-btn"
              className="btn btn-secondary btn-sm"
              style={{ alignItems: 'center', gap: 6, fontWeight: 700, padding: '6px 10px' }}
              onClick={() => setEditModalOpen(true)}
              title="Edit Rates"
            >
              ✏️ <span className="desktop-only">Edit Rates</span>
            </button>

            {shop?.verificationStatus === 'VERIFIED' && (
              <span className="badge badge-verified desktop-only">
                <CheckCircle size={10} /> <span>Verified</span>
              </span>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="dashboard-content">
          <Routes>
            <Route index element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} refreshTrigger={refreshTrigger} onOpenEditModal={() => setEditModalOpen(true)} />} />
            <Route path="queue" element={<PrintQueue shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="printers" element={<PrinterManagement shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="customers" element={<CustomersTab shop={shop} />} />
            <Route path="payments" element={<PaymentsTab shop={shop} />} />
            <Route path="agent" element={<AgentTab shop={shop} />} />
            <Route path="qr" element={<QRManagement shop={shop} />} />
            <Route path="history" element={<JobHistory shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="analytics" element={<AnalyticsTab shop={shop} stats={stats} />} />
            <Route path="subscription" element={<SubscriptionTab shop={shop} onUpgrade={() => {}} />} />
            <Route path="settings" element={<SettingsTab shop={shop} onUpdate={(updated) => setShop(updated)} />} />
            <Route path="notifications" element={<NotificationsTab shop={shop} />} />
            <Route path="profile" element={<ProfileTab shop={shop} onUpdate={(updated) => setShop(updated)} />} />

            {/* Sub-paths when mounted at /shop/dashboard/* */}
            <Route path="dashboard" element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} refreshTrigger={refreshTrigger} onOpenEditModal={() => setEditModalOpen(true)} />} />
            <Route path="dashboard/queue" element={<PrintQueue shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="dashboard/printers" element={<PrinterManagement shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="dashboard/customers" element={<CustomersTab shop={shop} />} />
            <Route path="dashboard/payments" element={<PaymentsTab shop={shop} />} />
            <Route path="dashboard/agent" element={<AgentTab shop={shop} />} />
            <Route path="dashboard/qr" element={<QRManagement shop={shop} />} />
            <Route path="dashboard/history" element={<JobHistory shop={shop} socket={socket} refreshTrigger={refreshTrigger} />} />
            <Route path="dashboard/analytics" element={<AnalyticsTab shop={shop} stats={stats} />} />
            <Route path="dashboard/subscription" element={<SubscriptionTab shop={shop} onUpgrade={() => {}} />} />
            <Route path="dashboard/settings" element={<SettingsTab shop={shop} onUpdate={(updated) => setShop(updated)} />} />
            <Route path="dashboard/notifications" element={<NotificationsTab shop={shop} />} />
            <Route path="dashboard/profile" element={<ProfileTab shop={shop} onUpdate={(updated) => setShop(updated)} />} />
            <Route path="*" element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} refreshTrigger={refreshTrigger} onOpenEditModal={() => setEditModalOpen(true)} />} />
          </Routes>
        </div>
      </div>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile navigation">
        <NavLink to="/shop/dashboard" end className={({ isActive }) => isActive ? 'active' : ''}>
          <div className="nav-dot"><LayoutDashboard size={20} /></div>
          <span>Home</span>
        </NavLink>
        <NavLink to="/shop/dashboard/queue" className={({ isActive }) => isActive ? 'active' : ''}>
          <div className="nav-dot"><PrinterIcon size={20} /></div>
          <span>Queue</span>
        </NavLink>
        <NavLink to="/shop/dashboard/printers" className={({ isActive }) => isActive ? 'active' : ''}>
          <div className="nav-dot"><Laptop size={20} /></div>
          <span>Printers</span>
        </NavLink>
        <NavLink to="/shop/dashboard/qr" className={({ isActive }) => isActive ? 'active' : ''}>
          <div className="nav-dot"><QrCode size={20} /></div>
          <span>QR</span>
        </NavLink>
        <NavLink to="/shop/dashboard/history" className={({ isActive }) => isActive ? 'active' : ''}>
          <div className="nav-dot"><History size={20} /></div>
          <span>History</span>
        </NavLink>
        <button onClick={() => setEditModalOpen(true)}>
          <div className="nav-dot">✏️</div>
          <span>Rates</span>
        </button>
      </nav>

      {/* Global Edit Counter Details & Rates Modal */}
      <EditShopDetailsModal
        shop={shop}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={(updated) => setShop(updated)}
      />
    </div>
  )
}

export default ShopDashboard
