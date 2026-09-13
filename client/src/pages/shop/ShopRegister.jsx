import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, CheckCircle, ArrowRight, Sparkles, Lock, Store, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

const ShopRegister = () => {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [step, setStep] = useState(1) // 1: Details, 2: Select Plan
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState('TRIAL')
  const [loading, setLoading] = useState(false)

  // Registration Form State
  const [formData, setFormData] = useState({
    ownerName: '',
    email: '',
    password: '',
    shopName: '',
    phone: '',
    city: 'Pune',
    state: 'Maharashtra',
    bwPerPage: 2,
    colorPerPage: 10
  })

  useEffect(() => {
    api.get('/subscriptions/plans')
      .then(res => {
        if (res.data?.data) {
          setPlans(res.data.data)
        }
      })
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // Step 1: Submit Details & Register Shop Account
  const handleProceedToPlans = async (e) => {
    e.preventDefault()
    if (!formData.ownerName || !formData.email || !formData.password || !formData.shopName || !formData.phone) {
      toast.error('Please fill in all required fields.')
      return
    }
    setStep(2)
  }

  // Step 2: Complete Registration & Activate Selected Plan
  const handleCompleteRegistration = async () => {
    setLoading(true)
    try {
      // 1. Register User & Shop
      const regRes = await api.post('/auth/register-shop', {
        name: formData.ownerName,
        email: formData.email,
        password: formData.password,
        shopName: formData.shopName,
        phone: formData.phone,
        address: {
          city: formData.city,
          state: formData.state
        },
        pricing: {
          bwPerPage: Number(formData.bwPerPage) || 2,
          colorPerPage: Number(formData.colorPerPage) || 10
        },
        planId: selectedPlan
      })

      toast.success('Shop registered successfully!')

      // 2. Automatically log in the user
      try {
        await login(formData.email, formData.password)
        navigate('/shop/dashboard', { replace: true })
      } catch (loginErr) {
        toast.success('Shop created successfully! Please sign in.')
        navigate('/shop/login', { replace: true })
      }
    } catch (err) {
      console.error('Registration error:', err)
      const errorMsg = err.response?.data?.message || err.message || 'Registration failed. Please check your details.'
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 100%)',
      padding: 'var(--space-8) var(--space-4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ width: '100%', maxWidth: step === 1 ? 480 : 700 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-3)',
            color: 'white',
            boxShadow: '0 4px 12px rgba(26, 86, 219, 0.3)'
          }}>
            <Store size={28} />
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-1)' }}>
            Join SecurePrint Network
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Multi-Tenant SaaS Platform for Modern Printing Centers
          </p>
        </div>

        {/* Step 1: Account & Counter Information */}
        {step === 1 && (
          <div className="card animate-slideUp">
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>1. Counter & Shop Details</span>
            </h2>

            <form onSubmit={handleProceedToPlans} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="input-group">
                <label className="input-label">Shop / Cyber Cafe Name *</label>
                <input
                  name="shopName"
                  className="input"
                  placeholder="e.g. Apex Digital Print Hub"
                  value={formData.shopName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="input-group">
                  <label className="input-label">Owner Name *</label>
                  <input
                    name="ownerName"
                    className="input"
                    placeholder="Your name"
                    value={formData.ownerName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Phone Number *</label>
                  <input
                    name="phone"
                    className="input"
                    placeholder="+91-98765-43210"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Email Address (Login) *</label>
                <input
                  name="email"
                  type="email"
                  className="input"
                  placeholder="shop@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password *</label>
                <input
                  name="password"
                  type="password"
                  className="input"
                  placeholder="Create secure password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 'var(--space-3)' }}>
                <div className="input-group">
                  <label className="input-label">B&W Rate (₹/page)</label>
                  <input
                    name="bwPerPage"
                    type="number"
                    min="1"
                    className="input"
                    value={formData.bwPerPage}
                    onChange={handleChange}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Colour Rate (₹/page)</label>
                  <input
                    name="colorPerPage"
                    type="number"
                    min="1"
                    className="input"
                    value={formData.colorPerPage}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg w-full"
                style={{ marginTop: 'var(--space-3)', fontWeight: 800 }}
              >
                Continue to SaaS Plans <ArrowRight size={18} />
              </button>
            </form>

            <div className="divider" />
            <div style={{ textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
              Already have an account?{' '}
              <Link to="/shop/login" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Step 2: Select SaaS Subscription Plan */}
        {step === 2 && (
          <div className="card animate-slideUp">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>
                2. Select SaaS Subscription Plan
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
                ← Back
              </button>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
              SecurePrint charges a flat platform subscription. You receive 100% of your printing earnings directly from your customers.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
              {(plans.length > 0 ? plans : [
                { id: 'TRIAL', name: 'Free Trial', price: 0, durationDays: 7, features: ['7 Days Full Access', 'Permanent Shop QR', 'Up to 50 Print Jobs'] },
                { id: 'STARTER', name: 'Starter Partner', price: 499, durationDays: 30, features: ['30 Days Access', 'Permanent Standee QR', 'Up to 500 Print Jobs/mo', 'Automatic 10s Cleanup'] },
                { id: 'PRO', name: 'Pro Center', price: 999, durationDays: 30, features: ['Unlimited Print Jobs', 'Priority Analytics', 'Instant Settlement', 'Priority Support'] }
              ]).map((p) => {
                const isSelected = selectedPlan === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    style={{
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isSelected ? '#EFF6FF' : 'var(--color-surface)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'var(--color-primary)', color: 'white',
                        borderRadius: '50%', width: 20, height: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <CheckCircle size={14} />
                      </div>
                    )}
                    <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 4 }}>{p.name}</h3>
                    <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-text)', marginBottom: 8 }}>
                      ₹{p.price}
                      <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                        /{p.durationDays} days
                      </span>
                    </div>

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {p.features?.map((f, fi) => (
                        <li key={fi} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={12} color="#059669" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>

            <button
              className="btn btn-primary btn-lg w-full"
              style={{ fontWeight: 800, height: 50 }}
              disabled={loading}
              onClick={handleCompleteRegistration}
            >
              {loading ? (
                <><div className="spinner" /> Activating Shop...</>
              ) : selectedPlan === 'TRIAL' ? (
                <>🚀 Activate Free 7-Day Trial & Unlock Shop</>
              ) : (
                <>💳 Pay ₹{(plans.find(p => p.id === selectedPlan) || { price: 499 }).price} & Activate Shop</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ShopRegister
