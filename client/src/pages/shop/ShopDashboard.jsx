import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Shield, LayoutDashboard, PrinterIcon, QrCode, History,
  LogOut, Menu, X, RefreshCw, ChevronRight,
  CheckCircle, Clock, AlertCircle, FileText, Image, File,
  Play, Check, XCircle, Eye, ExternalLink, Sparkles, MapPin, Tag, Users
} from 'lucide-react'
import api from '../../lib/api'
import EditShopDetailsModal from './EditShopDetailsModal'
import ShopSetupScreen from './ShopSetupScreen'


// ── Sidebar Navigation ─────────────────────────────────────────
const Sidebar = ({ shop, open, onClose, onOpenEditModal }) => {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/shop/login')
    toast.success('Logged out')
  }

  const navItems = [
    { path: '/shop/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
    { path: '/shop/dashboard/queue', label: 'Print Queue', icon: <PrinterIcon size={18} /> },
    { path: '/shop/dashboard/qr', label: 'Shop QR', icon: <QrCode size={18} /> },
    { path: '/shop/dashboard/history', label: 'History', icon: <History size={18} /> },
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
const DashboardHome = ({ shop, stats, refreshStats, socket, onOpenEditModal }) => {
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
  }, [fetchRecentJobs])

  // Socket listener for new jobs
  useEffect(() => {
    if (!socket) return
    const handleUpdate = () => {
      fetchRecentJobs()
      refreshStats()
    }
    socket.on('new-job', handleUpdate)
    return () => socket.off('new-job', handleUpdate)
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

      {/* Stats Grid — Requirement 12 */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
        {[
          { label: "Today's Customers", value: stats.todayCustomers ?? 0, icon: <Users size={20} />, bg: '#EFF6FF', color: 'var(--color-primary)' },
          { label: 'Total Customers', value: stats.totalCustomers ?? 0, icon: <Users size={20} />, bg: '#F5F3FF', color: '#7C3AED' },
          { label: "Today's Print Jobs", value: stats.todayJobs ?? ((stats.active || 0) + (stats.pending || 0) + (stats.completed || 0)), icon: <FileText size={20} />, bg: '#ECFDF5', color: '#059669' },
          { label: 'Pending in Queue', value: stats.pending ?? 0, icon: <Clock size={20} />, bg: '#FFF7ED', color: '#D97706' },
          { label: 'Completed Jobs', value: stats.completed ?? 0, icon: <CheckCircle size={20} />, bg: '#F0FDF4', color: 'var(--color-verified)' }
        ].map((s, i) => (
          <div key={i} className="stat-card animate-slideUp" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>
              {typeof s.icon === 'string' ? <span style={{ fontWeight: 800, fontSize: 18 }}>{s.icon}</span> : s.icon}
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Shop Info & Live Status Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
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
                        <button className="btn btn-success btn-sm" onClick={() => handleJobAction(job._id, 'print')}>
                          Print
                        </button>
                      )}
                      {job.status === 'PRINTING' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleJobAction(job._id, 'complete')}>
                          Complete
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
const PrintQueue = ({ shop, socket }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all') // Default to 'all' so shopkeeper sees everything

  const fetchJobs = useCallback(async () => {
    if (!shop?._id) return
    setLoading(true)
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

  useEffect(() => { fetchJobs() }, [fetchJobs])

  useEffect(() => {
    if (!socket) return
    socket.on('new-job', () => {
      fetchJobs()
      toast.success('📄 New print job received in queue!', { duration: 4000 })
    })
    socket.on('job-updated', () => {
      fetchJobs()
    })
    socket.on('job-files-deleted', () => {
      fetchJobs()
    })
    return () => {
      socket.off('new-job')
      socket.off('job-updated')
      socket.off('job-files-deleted')
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

  const tabs = [
    { key: 'all', label: 'All Jobs', color: 'var(--color-primary)' },
    { key: 'pending', label: 'Pending (Ready)', color: 'var(--color-warning)' },
    { key: 'active', label: 'Received', color: 'var(--color-primary)' },
    { key: 'printing', label: 'Printing', color: 'var(--color-verified)' },
    { key: 'completed', label: 'Completed', color: 'var(--color-text-muted)' }
  ]

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2>Print Queue</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Real-time incoming print requests from counter scans.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchJobs}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 'var(--space-1)',
        background: 'var(--color-surface-2)',
        borderRadius: 'var(--radius-lg)',
        padding: 4,
        marginBottom: 'var(--space-6)',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '10px var(--space-3)',
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
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
          <PrinterIcon size={52} style={{ margin: '0 auto var(--space-4)', opacity: 0.25 }} />
          <h3 style={{ color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>No {activeTab !== 'all' ? activeTab : ''} print jobs found</h3>
          <p style={{ fontSize: 'var(--font-size-sm)', maxWidth: 360, margin: '0 auto var(--space-4)' }}>
            When customers scan your counter QR code and submit documents, their jobs appear right here in real time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {jobs.map(job => (
            <JobCard key={job._id} job={job} onAction={updateJobStatus} />
          ))}
        </div>
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
          <button id={`print-now-${job._id}`} className="btn btn-primary" style={{ flex: 1, gap: 8, fontWeight: 700 }} onClick={() => onAction(job._id, 'print')}>
            <PrinterIcon size={18} /> PRINT NOW
          </button>
        )}
        {job.status === 'RECEIVED' && (
          <button id={`print-${job._id}`} className="btn btn-primary" style={{ flex: 1, gap: 8, fontWeight: 700 }} onClick={() => onAction(job._id, 'print')}>
            <PrinterIcon size={18} /> Start Printing
          </button>
        )}
        {job.status === 'PRINTING' && (
          <button id={`complete-${job._id}`} className="btn btn-success" style={{ flex: 1, gap: 8, fontWeight: 700 }} onClick={() => onAction(job._id, 'complete')}>
            <Check size={18} /> ✓ Mark as Completed
          </button>
        )}
        {job.status === 'AWAITING_PAYMENT' && !isPaid && (
          <button
            id={`mark-paid-${job._id}`}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, gap: 6, fontWeight: 700, borderColor: '#10B981', color: '#047857' }}
            onClick={async () => {
              try {
                toast.loading('Confirming counter payment...', { id: 'cash-pay' })
                await api.post('/payments/verify', {
                  jobId: job._id,
                  razorpay_order_id: `cash_${job._id}`,
                  razorpay_payment_id: `cash_pay_${Date.now()}`,
                  razorpay_signature: 'verified_counter_cash'
                })
                toast.dismiss('cash-pay')
                toast.success('Counter payment confirmed! 10-second file cleanup started.')
                if (onAction) onAction(job._id, 'refresh')
              } catch (e) {
                toast.dismiss('cash-pay')
                toast.error('Failed to confirm payment')
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
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchPermanentQR = async () => {
    if (!shop?._id) return
    setLoading(true)
    try {
      const res = await api.get(`/shops/${shop._id}/permanent-qr`)
      setQrData(res.data.data)
    } catch {
      // Fallback to shop's own cached permanentQrDataUrl without window.location.origin
      if (shop.permanentQrDataUrl) {
        const target = shop.permanentQrTargetUrl || (import.meta.env.VITE_PUBLIC_APP_URL ? `${import.meta.env.VITE_PUBLIC_APP_URL}/shop/${shop.slug}` : `/shop/${shop.slug}`)
        setQrData({
          qrDataUrl: shop.permanentQrDataUrl,
          qrTargetUrl: target
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPermanentQR()
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
            <div className="spinner spinner-primary" style={{ margin: '0 auto var(--space-4)' }} />
            <p>Loading permanent counter QR...</p>
          </div>
        )}

        {/* Action Buttons — NO REGENERATE BUTTON */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%', marginTop: 'var(--space-6)' }}>
          {qrData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
              <button
                id="download-qr-btn"
                className="btn btn-primary"
                style={{ gap: 8, justifyContent: 'center' }}
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
                style={{ gap: 8, justifyContent: 'center' }}
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
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <ExternalLink size={16} /> Open Customer Flow ({shopSlugUrl})
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
const JobHistory = ({ shop }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shop?._id) return
    api.get(`/shops/${shop._id}/jobs?status=COMPLETED&limit=50`)
      .then(res => setJobs(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shop])

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
      const sock = io('/', { transports: ['websocket'] })
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

  useEffect(() => { fetchStats() }, [fetchStats])

  // Listen for new jobs to update stats
  useEffect(() => {
    if (!socket) return
    socket.on('new-job', fetchStats)
    return () => socket.off('new-job', fetchStats)
  }, [socket, fetchStats])

  // 1. If new admin/shopkeeper hasn't completed initial setup, show setup page first
  if (shop && !shop.isSetupComplete) {
    return <ShopSetupScreen shop={shop} onSetupComplete={(updated) => setShop(updated)} />
  }

  const pageTitle = () => {
    if (location.pathname.includes('/queue')) return 'Print Queue'
    if (location.pathname.includes('/qr')) return 'Shop QR Code'
    if (location.pathname.includes('/history')) return 'Job History'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              className="btn btn-ghost btn-icon"
              id="sidebar-toggle"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{pageTitle()}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {/* Edit button — hidden on mobile, accessible from sidebar */}
            <button
              id="header-edit-rates-btn"
              className="btn btn-secondary btn-sm"
              style={{ alignItems: 'center', gap: 6, fontWeight: 700 }}
              onClick={() => setEditModalOpen(true)}
            >
              ✏️ <span style={{ display: 'var(--header-btn-label, inline)' }}>Edit Rates</span>
            </button>

            {shop?.verificationStatus === 'VERIFIED' && (
              <span className="badge badge-verified" style={{ display: 'var(--verified-badge, inline-flex)' }}>
                <CheckCircle size={10} /> <span>Verified</span>
              </span>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="dashboard-content">
          <Routes>
            <Route index element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} onOpenEditModal={() => setEditModalOpen(true)} />} />
            <Route path="queue" element={<PrintQueue shop={shop} socket={socket} />} />
            <Route path="qr" element={<QRManagement shop={shop} />} />
            <Route path="history" element={<JobHistory shop={shop} />} />
            <Route path="dashboard" element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} onOpenEditModal={() => setEditModalOpen(true)} />} />
            <Route path="dashboard/queue" element={<PrintQueue shop={shop} socket={socket} />} />
            <Route path="dashboard/qr" element={<QRManagement shop={shop} />} />
            <Route path="dashboard/history" element={<JobHistory shop={shop} />} />
            <Route path="*" element={<DashboardHome shop={shop} stats={stats} refreshStats={fetchStats} socket={socket} onOpenEditModal={() => setEditModalOpen(true)} />} />
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
