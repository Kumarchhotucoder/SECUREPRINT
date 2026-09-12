import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Shield, Eye, EyeOff, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

const ShopLogin = () => {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  // Already logged in — declarative redirect
  if (user) {
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/super-admin" replace />
    }
    return <Navigate to="/shop/dashboard" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Email and password are required.'); return }
    setLoading(true)
    try {
      const u = await login(email, password)
      if (u.role === 'SUPER_ADMIN') {
        toast.error('Super Admin detected. Please use the Super Admin login portal.')
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/super-admin/login'
        return
      }
      toast.success(`Welcome back, ${u.name}!`)
      navigate('/shop/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, var(--color-bg) 60%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)'
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-4)',
            color: 'white',
            boxShadow: 'var(--shadow-primary)'
          }}>
            <Shield size={28} />
          </div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--space-1)' }}>SecurePrint</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Shopkeeper & Print Partner Login</p>
        </div>

        <div className="card animate-slideUp">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-primary)'
            }}>
              <Lock size={18} />
            </div>
            <h2 style={{ fontSize: 'var(--font-size-xl)' }}>Shopkeeper Sign in</h2>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="input-group">
              <label htmlFor="email" className="input-label">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="shop@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="password" className="input-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position: 'absolute', right: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', display: 'flex'
                  }}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              id="login-btn"
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              style={{ marginTop: 'var(--space-2)' }}
            >
              {loading ? <><div className="spinner" />Signing in...</> : 'Sign in to Shop Dashboard'}
            </button>
          </form>

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-sm)' }}>
            <a href="/" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
              ← Back to Home
            </a>
            <a href="/super-admin/login" style={{ color: 'var(--color-primary)', fontWeight: 500, textDecoration: 'none' }}>
              Super Admin Portal →
            </a>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
          Account locked after 5 failed attempts for 30 minutes
        </p>
      </div>
    </div>
  )
}

export default ShopLogin
