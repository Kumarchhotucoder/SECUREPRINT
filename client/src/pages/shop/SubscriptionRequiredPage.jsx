import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Shield, Check, AlertCircle, CreditCard,
  Lock, ArrowRight, CheckCircle, RefreshCw, LogOut,
  AlertTriangle, HelpCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

const PLANS_DATA = [
  {
    id: 'STARTER',
    name: 'Starter Print Partner',
    price: 499,
    durationDays: 30,
    badge: 'Popular for Single Shops',
    features: [
      '30 Days Full Operational Access',
      'Permanent Counter Standee QR Code',
      'Up to 500 Print Jobs / Month',
      'Standard B&W and Color Printing',
      'Automatic 10s Document Privacy Cleanup',
      'Desktop Print Agent Integration'
    ]
  },
  {
    id: 'PRO',
    name: 'Pro Printing Center',
    price: 999,
    durationDays: 30,
    badge: 'Best Value',
    features: [
      'Unlimited Monthly Print Jobs',
      'Multi-Printer & Wi-Fi LAN Support',
      'Real-Time Hardware Spooling Queue',
      'Priority Dashboard Analytics',
      'Instant Razorpay Direct Settlement',
      '24/7 Phone & WhatsApp Support'
    ]
  },
  {
    id: 'ENTERPRISE',
    name: 'Commercial Print Hub',
    price: 2499,
    durationDays: 30,
    badge: 'Multi-Counter Centers',
    features: [
      'Multi-Branch & Multi-Counter Support',
      'Custom Standee Counter Branding',
      'Automated Daily P&L Accounting Reports',
      'Direct Gateway Custom Account Integration',
      'Dedicated Account Manager'
    ]
  }
]

// Dynamic loader helper for official Razorpay checkout script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]')
    if (existing) {
      existing.onload = () => resolve(true)
      existing.onerror = () => resolve(false)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function SubscriptionRequiredPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [loading, setLoading] = useState(true)
  const [shopData, setShopData] = useState(null)
  const [selectedPlanId, setSelectedPlanId] = useState('STARTER')
  const [paying, setPaying] = useState(false)
  const [activated, setActivated] = useState(false)
  const [paymentError, setPaymentError] = useState(null)

  // 1. Fetch Subscription Status or Tokenized Data
  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      if (token) {
        // Public tokenized payment link
        const res = await api.get(`/subscriptions/by-token/${token}`)
        if (res.data?.success) {
          setShopData(res.data.data)
          if (res.data.data.plan) setSelectedPlanId(res.data.data.plan)
          if (res.data.data.shopStatus === 'ACTIVE') setActivated(true)
        }
      } else {
        // Authenticated shopkeeper session
        const res = await api.get('/subscriptions/status')
        if (res.data?.success) {
          setShopData(res.data.data)
          if (res.data.data.plan) setSelectedPlanId(res.data.data.plan)
          if (res.data.data.isOperational) setActivated(true)
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load subscription details.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const selectedPlan = PLANS_DATA.find(p => p.id === selectedPlanId) || PLANS_DATA[0]

  // 2. Handle Subscription Payment
  const handlePaySubscription = async () => {
    if (paying) return
    setPaying(true)
    setPaymentError(null)

    try {
      toast.loading('Initializing subscription order...', { id: 'sub-order' })
      let orderRes
      try {
        orderRes = await api.post('/subscriptions/create-order', {
          planId: selectedPlan.id,
          token: token || undefined
        })
      } catch (reqErr) {
        toast.dismiss('sub-order')
        const code = reqErr.response?.data?.code || 'ORDER_CREATION_FAILED'
        const message = reqErr.response?.data?.message || 'Unable to create payment order. Please try again.'

        if (code === 'PAYMENT_CONFIG_REQUIRED') {
          setPaymentError({
            code: 'PAYMENT_CONFIG_ERROR',
            title: 'Payment Gateway Configuration Required',
            message: 'Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are missing or unconfigured on the server. Please contact administrator to configure Razorpay keys, or have Super Admin activate your shop via Manual Administrative Override.'
          })
        } else {
          setPaymentError({
            code,
            title: 'Unable to Create Payment Order',
            message
          })
        }
        setPaying(false)
        return
      }

      toast.dismiss('sub-order')
      const orderData = orderRes.data?.data

      if (!orderData || !orderData.orderId) {
        setPaymentError({
          code: 'ORDER_CREATION_FAILED',
          title: 'Unable to Create Payment Order',
          message: 'Server failed to generate order ID. Please try again.'
        })
        setPaying(false)
        return
      }

      // If server explicitly reported gateway is unconfigured
      if (orderData.isConfigured === false) {
        setPaymentError({
          code: 'PAYMENT_CONFIG_ERROR',
          title: 'Payment Gateway Configuration Required',
          message: 'Razorpay credentials are required to process online payment. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env or activate the shop via Super Admin Manual Activation.'
        })
        setPaying(false)
        return
      }

      // Check / load Razorpay SDK
      const isSdkReady = await loadRazorpayScript()
      if (!isSdkReady || !window.Razorpay) {
        setPaymentError({
          code: 'SDK_LOAD_ERROR',
          title: 'Secure Payment Checkout Could Not Be Loaded',
          message: 'Razorpay Checkout script could not be loaded. Please check your internet connection or disable ad-blockers, then try again.'
        })
        setPaying(false)
        return
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency || 'INR',
        name: 'SecurePrint SaaS',
        description: `Subscription: ${selectedPlan.name} (₹${selectedPlan.price}/mo)`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.name || shopData?.shopName || 'Shop Owner',
          email: user?.email || '',
          contact: user?.phone || ''
        },
        theme: {
          color: '#1A56DB'
        },
        modal: {
          ondismiss: () => {
            setPaying(false)
            setPaymentError({
              code: 'PAYMENT_CANCELLED',
              title: 'Payment Cancelled',
              message: 'Payment was cancelled before completion. Your shop is still inactive. No subscription was activated.'
            })
          }
        },
        handler: async (response) => {
          try {
            toast.loading('Cryptographically verifying payment on server...', { id: 'sub-verify' })
            const verifyRes = await api.post('/subscriptions/verify', {
              token: token || undefined,
              planId: selectedPlan.id,
              razorpay_order_id: response.razorpay_order_id || orderData.orderId,
              razorpay_payment_id: response.razorpay_payment_id || `pay_${Date.now()}`,
              razorpay_signature: response.razorpay_signature || 'verified_server'
            })

            toast.dismiss('sub-verify')
            toast.success(verifyRes.data?.message || 'Subscription activated successfully!')
            setActivated(true)
            setPaymentError(null)
            setShopData(prev => ({ ...prev, shopStatus: 'ACTIVE', subscriptionStatus: 'ACTIVE' }))
          } catch (vErr) {
            toast.dismiss('sub-verify')
            const vCode = vErr.response?.data?.code || 'PAYMENT_VERIFICATION_FAILED'
            const vMsg = vErr.response?.data?.message || 'Payment verification failed. Your shop has not been activated.'
            setPaymentError({
              code: vCode,
              title: vCode === 'ACTIVATION_FAILED' ? 'Shop Activation Pending' : 'Payment Verification Failed',
              message: vMsg
            })
          } finally {
            setPaying(false)
          }
        }
      }

      const rzpInstance = new window.Razorpay(options)
      rzpInstance.on('payment.failed', (failResp) => {
        setPaying(false)
        setPaymentError({
          code: 'PAYMENT_GATEWAY_FAILED',
          title: 'Payment Failed',
          message: failResp.error?.description || 'The payment gateway reported a failure. No subscription was activated.'
        })
      })
      rzpInstance.open()
    } catch (err) {
      toast.dismiss('sub-order')
      setPaymentError({
        code: 'NETWORK_ERROR',
        title: 'Connection Error',
        message: 'Unable to connect to SecurePrint server. Please check your network connection.'
      })
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div className="spinner spinner-primary" style={{ width: 44, height: 44 }} />
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading SecurePrint account details...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <nav style={{
        background: 'white',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Shield size={20} />
          </div>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
            Secure<span style={{ color: 'var(--color-primary)' }}>Print</span>
          </span>
          <span style={{ fontSize: '0.72rem', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
            SAAS ONBOARDING
          </span>
        </div>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Logged in as <strong>{user.email}</strong>
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
              onClick={() => logout && logout()}
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        )}
      </nav>

      {/* Main Container */}
      <div style={{ maxWidth: 860, margin: '40px auto', padding: '0 20px', width: '100%' }}>
        {/* Structured Error State Card */}
        {paymentError && (
          <div
            className="card animate-fadeIn"
            style={{
              border: '2px solid #DC2626',
              background: '#FEF2F2',
              padding: 24,
              borderRadius: 'var(--radius-lg)',
              marginBottom: 24,
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#DC2626'
              }}>
                <AlertTriangle size={24} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                    {paymentError.title}
                  </h3>
                  {paymentError.code && (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      background: '#FEE2E2',
                      color: '#991B1B',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid #FCA5A5'
                    }}>
                      {paymentError.code}
                    </span>
                  )}
                </div>

                <p style={{ color: '#B91C1C', fontSize: '0.9rem', margin: '8px 0 14px', lineHeight: 1.5 }}>
                  {paymentError.message}
                </p>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.8)',
                  border: '1px dashed #F87171',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  color: '#7F1D1D',
                  marginBottom: 16
                }}>
                  <strong>Status:</strong> Your shop is still <strong>INACTIVE (PENDING_PAYMENT)</strong>. No subscription was activated. Operational features remain locked until verified payment.
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ fontWeight: 700, padding: '8px 16px', background: '#DC2626', borderColor: '#DC2626', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      setPaymentError(null)
                      handlePaySubscription()
                    }}
                  >
                    <RefreshCw size={14} /> Try Again
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: 600, padding: '8px 16px' }}
                    onClick={() => setPaymentError(null)}
                  >
                    Dismiss
                  </button>
                  <a
                    href="mailto:support@secureprint.in"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.8rem', color: '#991B1B', textDecoration: 'underline' }}
                  >
                    Contact Administrator / Super Admin
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {activated ? (
          /* Activated Success Card */
          <div className="card animate-slideUp" style={{ textAlign: 'center', padding: '48px 24px', border: '2px solid #10B981' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#D1FAE5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={40} />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#065F46', marginBottom: 8 }}>
              Shop Activated Successfully! 🎉
            </h2>
            <p style={{ color: '#047857', fontSize: '1rem', maxWidth: 480, margin: '0 auto 24px' }}>
              Your SecurePrint SaaS subscription is now <strong>ACTIVE</strong>. All operational tools, hardware print agent, and customer QR are fully unlocked.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ padding: '14px 32px', fontSize: '1rem', fontWeight: 800, gap: 10 }}
              onClick={() => navigate('/admin/dashboard')}
            >
              Enter Admin Dashboard <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          /* Pending Payment Notice & Plan Selection */
          <>
            {/* Header Box */}
            <div className="card" style={{ marginBottom: 24, textAlign: 'center', padding: '32px 24px', border: '1.5px solid #FDE68A', background: '#FFFBEB' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FEF3C7', padding: '6px 16px', borderRadius: 20, color: '#92400E', fontSize: '0.85rem', fontWeight: 700, marginBottom: 16 }}>
                <span style={{ fontSize: 14 }}>🟡</span> Subscription Payment Pending
              </div>

              <h1 style={{ fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#78350F', marginBottom: 6 }}>
                Your shop is almost ready!
              </h1>

              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#92400E', marginBottom: 12 }}>
                Shop: <u>{shopData?.shopName || 'Your Shop'}</u>
              </div>

              <p style={{ color: '#B45309', fontSize: 'var(--font-size-sm)', maxWidth: 540, margin: '0 auto' }}>
                To activate your SecurePrint software, hardware print agent, and customer counter QR, please choose a subscription plan below.
              </p>
            </div>

            {/* Plan Selector Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 28 }}>
              {PLANS_DATA.map((plan) => {
                const isSelected = selectedPlanId === plan.id
                return (
                  <div
                    key={plan.id}
                    className="card"
                    style={{
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isSelected ? '#EFF6FF' : 'white',
                      boxShadow: isSelected ? '0 8px 24px rgba(26, 86, 219, 0.15)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    {plan.badge && (
                      <div style={{
                        position: 'absolute',
                        top: -10,
                        right: 16,
                        background: isSelected ? 'var(--color-primary)' : '#64748B',
                        color: 'white',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        textTransform: 'uppercase'
                      }}>
                        {plan.badge}
                      </div>
                    )}

                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8, color: isSelected ? 'var(--color-primary)' : 'inherit' }}>
                        {plan.name}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                        <span style={{ fontSize: '2rem', fontWeight: 900 }}>₹{plan.price}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>/ month</span>
                      </div>

                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                        {plan.features.map((f, idx) => (
                          <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#334155' }}>
                            <Check size={14} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <button
                        type="button"
                        className={`btn w-full ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.85rem', fontWeight: 700 }}
                        onClick={(e) => { e.stopPropagation(); setSelectedPlanId(plan.id) }}
                      >
                        {isSelected ? '✓ Selected' : 'Choose Plan'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Payment Trigger Card */}
            <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Total Payable Now
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-text)' }}>
                  ₹{selectedPlan.price} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>({selectedPlan.name} • 30 Days)</span>
                </div>
              </div>

              <button
                id="pay-subscription-btn"
                className="btn btn-primary btn-lg"
                style={{
                  minWidth: 260,
                  height: 52,
                  fontSize: '1rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10
                }}
                disabled={paying}
                onClick={handlePaySubscription}
              >
                {paying ? (
                  <><div className="spinner" /> Launching Razorpay...</>
                ) : (
                  <>
                    <CreditCard size={20} />
                    <span>PAY ₹{selectedPlan.price} & ACTIVATE SHOP</span>
                  </>
                )}
              </button>
            </div>

            {/* Security Guarantee Footnote */}
            <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Lock size={13} /> 256-bit encrypted Razorpay checkout. Server-verified activation instantly unlocks your account.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
