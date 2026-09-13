import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Shield, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const SuperAdminLogin = () => {
  const { login, user, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  // Already logged in as SUPER_ADMIN
  if (user && user.role === 'SUPER_ADMIN') {
    return <Navigate to="/super-admin" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Email and password required.'); return }
    setLoading(true)
    try {
      const u = await login(email, password)
      if (u.role !== 'SUPER_ADMIN') {
        toast.error('Access denied. This login is only for Super Admin.')
        // Log out immediately — wrong portal
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.reload()
        return
      }
      toast.success(`Welcome, ${u.name}!`)
      navigate('/super-admin', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F0F23 0%, #1A1040 50%, #0F172A 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background decorative blobs */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(26,86,219,0.12) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-5)',
            boxShadow: '0 0 40px rgba(124,58,237,0.4)',
          }}>
            <Shield size={34} color="white" />
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'white', marginBottom: 'var(--space-2)', fontWeight: 800 }}>
            Super Admin Portal
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            SecurePrint — Restricted Access Only
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--radius-2xl)',
          padding: 'var(--space-8)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
        }}>
          {/* Active non-super-admin session indicator */}
          {user && user.role !== 'SUPER_ADMIN' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              marginBottom: 'var(--space-4)',
              color: '#FCA5A5',
              fontSize: 12, fontWeight: 600
            }}>
              <span>Active session: <strong>{user.name}</strong> ({user.role})</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: '#FCA5A5', padding: '2px 8px', fontSize: 11, textDecoration: 'underline' }}
                onClick={() => logout()}
              >
                Sign out first
              </button>
            </div>
          )}

          {/* Warning badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: 'var(--space-6)',
            color: '#FCD34D',
            fontSize: 12, fontWeight: 600
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            Super Admin access only. All actions are logged.
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="input-group">
              <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
                Admin Email
              </label>
              <input
                id="superadmin-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@secureprint.in"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  color: 'white',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              />
            </div>

            <div className="input-group">
              <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="superadmin-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Secure admin password"
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 48px 14px 16px',
                    color: 'white',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position: 'absolute', right: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)', display: 'flex', padding: 0
                  }}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              id="superadmin-login-btn"
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px',
                background: loading ? 'rgba(124,58,237,0.5)' : 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 'var(--space-2)',
                transition: 'all 0.15s',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(124,58,237,0.4)',
                minHeight: 52
              }}
            >
              {loading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Signing in...</>
                : <><Lock size={16} /> Access Super Admin</>}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Link
              to="/shop/login"
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Are you a shopkeeper? → Shop Login
            </Link>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 'var(--space-4)' }}>
          Locked after 5 failed attempts • All logins audited
        </p>
      </div>
    </div>
  )
}

export default SuperAdminLogin
