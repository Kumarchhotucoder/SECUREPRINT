import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import {
  Shield, CheckCircle, Clock, Printer, Trash2,
  AlertCircle, Receipt, CreditCard, Sparkles, Lock, Banknote,
  QrCode, Smartphone, ArrowRight, Copy, Check
} from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import api from '../../lib/api'

// Helper to load Razorpay SDK dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

const StatusPage = () => {
  const { jobId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionToken = searchParams.get('token')

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Payment & Countdown state
  const [paying, setPaying] = useState(false)
  const [payingCash, setPayingCash] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [paymentTab, setPaymentTab] = useState('ONLINE') // 'ONLINE' | 'CASH'
  const [upiQrUrl, setUpiQrUrl] = useState('')
  const [copiedUpi, setCopiedUpi] = useState(false)

  // Fetch initial job details
  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await api.get(`/jobs/${jobId}`, {
          headers: sessionToken ? { 'X-Session-Token': sessionToken } : {}
        })
        setJob(res.data.data)
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load job status.')
      } finally {
        setLoading(false)
      }
    }
    fetchJob()
  }, [jobId, sessionToken])

  // Generate dynamic UPI QR code
  useEffect(() => {
    const amt = job?.finalPrice != null ? job.finalPrice : (job?.estimatedPrice || 2)
    const shopName = job?.shopId?.name || 'SecurePrint Counter'
    const upiStr = `upi://pay?pa=secureprint@upi&pn=${encodeURIComponent(shopName)}&am=${amt}&cu=INR&tn=Job_${job?.jobNumber || 'Print'}`
    QRCode.toDataURL(upiStr, {
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    }).then(setUpiQrUrl).catch(() => {})
  }, [job?.finalPrice, job?.estimatedPrice, job?.jobNumber, job?.shopId?.name])

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || '/'
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] })

    socket.emit('join-job', jobId)

    socket.on('job-status', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setJob(prev => prev ? {
          ...prev,
          status: data.status,
          completedAt: data.completedAt || prev.completedAt,
          paymentStatus: data.paymentStatus || prev.paymentStatus,
          finalPrice: data.finalPrice || prev.finalPrice,
          filesDeleted: data.filesDeleted !== undefined ? data.filesDeleted : prev.filesDeleted,
          deletedAt: data.deletedAt || prev.deletedAt,
          cleanupStatus: data.cleanupStatus || prev.cleanupStatus
        } : prev)

        if (data.status === 'AWAITING_PAYMENT') {
          toast('Printing completed! Please complete payment.', { icon: '🖨️' })
        }
      }
    })

    socket.on('payment-success', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setJob(prev => prev ? {
          ...prev,
          paymentStatus: 'PAID',
          paidAt: data.paidAt || new Date().toISOString(),
          status: 'CLEANUP_COUNTDOWN',
          cleanupScheduledAt: data.cleanupScheduledAt
        } : prev)
        setCountdown(10)
        toast.success('Payment verified! 10-second file cleanup countdown started.')
      }
    })

    socket.on('cleanup-countdown', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setCountdown(data.countdownSeconds || 10)
        setJob(prev => prev ? {
          ...prev,
          status: 'CLEANUP_COUNTDOWN',
          paymentStatus: 'PAID',
          cleanupScheduledAt: data.scheduledAt
        } : prev)
      }
    })

    socket.on('job-files-deleted', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setCountdown(0)
        setJob(prev => prev ? {
          ...prev,
          status: 'COMPLETED',
          filesDeleted: true,
          deletedAt: data.deletedAt || new Date().toISOString(),
          cleanupStatus: 'SUCCESS'
        } : prev)
        toast.success('Your uploaded files have been permanently deleted!')
      }
    })

    socket.on('session-deleted', (data) => {
      setCountdown(0)
      setJob(prev => prev ? {
        ...prev,
        filesDeleted: true,
        deletedAt: data?.deletedAt || prev.deletedAt || new Date().toISOString()
      } : prev)
    })

    return () => socket.disconnect()
  }, [jobId])

  // Periodic polling fallback to maintain sync if socket drops
  useEffect(() => {
    if (!jobId || job?.filesDeleted) return

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/jobs/${jobId}`, {
          headers: sessionToken ? { 'X-Session-Token': sessionToken } : {}
        })
        if (res.data?.data) {
          const updated = res.data.data
          setJob(prev => ({ ...prev, ...updated }))
        }
      } catch (e) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [jobId, job?.filesDeleted, sessionToken])

  // Live 10-second countdown calculation based on backend timestamp
  useEffect(() => {
    if (job?.paymentStatus === 'PAID' && !job?.filesDeleted) {
      const updateTimer = () => {
        if (job.cleanupScheduledAt) {
          const target = new Date(job.cleanupScheduledAt).getTime()
          const diff = Math.max(0, Math.ceil((target - Date.now()) / 1000))
          setCountdown(diff)
        } else if (countdown === null) {
          setCountdown(10)
        }
      }

      updateTimer()
      const timer = setInterval(updateTimer, 500)
      return () => clearInterval(timer)
    }
  }, [job?.paymentStatus, job?.filesDeleted, job?.cleanupScheduledAt, countdown])

  // Handle Payment flow
  const handlePayment = async () => {
    if (paying) return
    setPaying(true)
    try {
      // 1. Create order on backend (amount strictly verified from trusted DB)
      const orderRes = await api.post('/payments/create-order', { jobId })
      const orderData = orderRes.data.data

      const isSdkLoaded = await loadRazorpayScript()

      // If Razorpay SDK loaded and is live gateway, open standard Razorpay checkout
      if (isSdkLoaded && window.Razorpay && orderData.isLiveGateway) {
        const options = {
          key: orderData.keyId,
          amount: orderData.amountPaise,
          currency: 'INR',
          name: 'SecurePrint',
          description: `Print Job #${orderData.jobNumber} at ${orderData.shopName}`,
          image: '/favicon.svg',
          order_id: orderData.orderId,
          handler: async (response) => {
            try {
              toast.loading('Verifying payment on server...', { id: 'verify-pay' })
              const verifyRes = await api.post('/payments/verify', {
                jobId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
              toast.dismiss('verify-pay')
              toast.success('Payment confirmed! Secure 10-second cleanup started.')
              setJob(prev => ({ ...prev, ...verifyRes.data.data }))
              setCountdown(10)
            } catch (vErr) {
              toast.dismiss('verify-pay')
              toast.error(vErr.response?.data?.message || 'Verification failed')
            }
          },
          prefill: {
            name: orderData.customerName || 'Customer'
          },
          theme: {
            color: '#1A56DB'
          },
          modal: {
            ondismiss: () => {
              setPaying(false)
              toast('Payment window closed. You can retry whenever ready.')
            }
          }
        }
        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', (response) => {
          toast.error(response.error.description || 'Payment failed. Please try again.')
          setPaying(false)
        })
        rzp.open()
      } else {
        // Direct Server Verification (Sandbox/Direct UPI mode)
        toast.loading('Processing secure payment verification...', { id: 'verify-pay' })
        const verifyRes = await api.post('/payments/verify', {
          jobId,
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: `pay_${Date.now()}`,
          razorpay_signature: 'verified_server'
        })
        toast.dismiss('verify-pay')
        toast.success('Payment verified! 10-second file cleanup countdown started.')
        setJob(prev => ({ ...prev, ...verifyRes.data.data }))
        setCountdown(10)
      }
    } catch (err) {
      toast.dismiss('verify-pay')
      toast.error(err.response?.data?.message || 'Payment initiation failed. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  // Handle Counter Cash Payment
  const handleCashPayment = async () => {
    if (paying || payingCash) return
    setPayingCash(true)
    try {
      toast.loading('Confirming counter cash payment...', { id: 'verify-cash' })
      const verifyRes = await api.post('/payments/verify', {
        jobId,
        paymentMethod: 'CASH',
        razorpay_order_id: `cash_${jobId}`,
        razorpay_payment_id: `cash_pay_${Date.now()}`,
        razorpay_signature: 'verified_counter_cash'
      })
      toast.dismiss('verify-cash')
      toast.success('Cash payment confirmed! 10-second file cleanup started.')
      setJob(prev => ({ ...prev, ...verifyRes.data.data }))
      setCountdown(10)
    } catch (err) {
      toast.dismiss('verify-cash')
      toast.error(err.response?.data?.message || 'Cash payment confirmation failed. Please try again.')
    } finally {
      setPayingCash(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="spinner spinner-primary" style={{ width: 48, height: 48, borderWidth: 5 }} />
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading status...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-page" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <div className="error-icon"><AlertCircle size={36} /></div>
        <h2>Could not load job</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
        <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => navigate('/')}>
          Return Home
        </button>
      </div>
    )
  }

  const isPrintingDone = ['AWAITING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'CLEANUP_COUNTDOWN', 'COMPLETED'].includes(job?.status) || Boolean(job?.completedAt)
  const isAwaitingPayment = (job?.status === 'AWAITING_PAYMENT' || isPrintingDone) && job?.paymentStatus !== 'PAID' && !job?.filesDeleted
  const isPaid = job?.paymentStatus === 'PAID'
  const isFilesDeleted = Boolean(job?.filesDeleted)
  const isFailed = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(job?.status)

  const payableAmount = job?.finalPrice != null ? job.finalPrice : job?.estimatedPrice || 10

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBottom: 'var(--space-12)' }}>
      {/* Header Banner */}
      <div style={{
        background: isFilesDeleted
          ? 'linear-gradient(135deg, #059669 0%, #064E3B 100%)'
          : isPaid
            ? 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)'
            : isAwaitingPayment
              ? 'linear-gradient(135deg, #D97706 0%, #B45309 100%)'
              : 'linear-gradient(135deg, #1A56DB 0%, #1246B5 100%)',
        padding: 'var(--space-8) var(--space-4)',
        color: 'white',
        textAlign: 'center',
        transition: 'background 0.5s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <Shield size={20} />
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)' }}>SecurePrint</span>
        </div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', color: 'white', marginBottom: 'var(--space-2)' }}>
          {isFilesDeleted
            ? '✓ Files Permanently Deleted'
            : isPaid
              ? '✓ Payment Successful'
              : isAwaitingPayment
                ? 'Payment Required'
                : 'Printing Status'}
        </h1>
        <p style={{ opacity: 0.9, fontSize: 'var(--font-size-sm)' }}>
          Job #{job?.jobNumber} · {job?.shopId?.name || 'SecurePrint Partner'}
        </p>
      </div>

      <div className="container" style={{ paddingTop: 'var(--space-6)', maxWidth: 540 }}>
        {/* 1. PAYMENT REQUIRED BANNER & ACTION */}
        {isAwaitingPayment && (
          <div className="card animate-slideUp" style={{
            marginBottom: 'var(--space-6)',
            border: '2px solid #F59E0B',
            background: '#FFFBEB',
            boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-full)',
                background: '#FEF3C7', color: '#B45309',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', color: '#92400E', margin: 0 }}>Printing Completed</h3>
                <p style={{ fontSize: 'var(--font-size-sm)', color: '#B45309', margin: 0 }}>
                  Your documents are ready. Please complete payment to the shop.
                </p>
              </div>
            </div>

            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
              border: '1px solid #FDE68A'
            }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Amount Payable:
              </span>
              <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: '#1A56DB' }}>
                ₹{payableAmount}
              </span>
            </div>

            {/* Payment Method Selector Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <button
                type="button"
                className="btn"
                style={{
                  background: paymentTab === 'ONLINE' ? '#1A56DB' : '#F1F5F9',
                  color: paymentTab === 'ONLINE' ? 'white' : '#475569',
                  border: paymentTab === 'ONLINE' ? 'none' : '1px solid #CBD5E1',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 46
                }}
                onClick={() => setPaymentTab('ONLINE')}
              >
                <Smartphone size={16} /> Pay Online (UPI)
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  background: paymentTab === 'CASH' ? '#059669' : '#F1F5F9',
                  color: paymentTab === 'CASH' ? 'white' : '#475569',
                  border: paymentTab === 'CASH' ? 'none' : '1px solid #CBD5E1',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 46
                }}
                onClick={() => setPaymentTab('CASH')}
              >
                <Banknote size={16} /> Pay Cash at Counter
              </button>
            </div>

            {/* TAB 1: ONLINE / UPI PAYMENT */}
            {paymentTab === 'ONLINE' && (
              <div className="animate-fadeIn">
                {/* 1-Click Mobile UPI App Launchers */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: '#475569', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tap to pay with your UPI app:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
                    {/* Google Pay */}
                    <a
                      href={`upi://pay?pa=secureprint@upi&pn=${encodeURIComponent(job?.shopId?.name || 'SecurePrint')}&am=${payableAmount}&cu=INR&tn=Job_${job?.jobNumber || 'Print'}`}
                      className="btn btn-secondary"
                      style={{
                        padding: '10px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        border: '1.5px solid #E2E8F0',
                        background: 'white',
                        textDecoration: 'none',
                        color: '#1E293B',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-lg)'
                      }}
                      onClick={() => toast.success('Opening Google Pay / UPI app...')}
                    >
                      <span style={{ fontSize: '1.25rem' }}>🔵</span>
                      Google Pay
                    </a>

                    {/* PhonePe */}
                    <a
                      href={`phonepe://pay?pa=secureprint@upi&pn=${encodeURIComponent(job?.shopId?.name || 'SecurePrint')}&am=${payableAmount}&cu=INR&tn=Job_${job?.jobNumber || 'Print'}`}
                      className="btn btn-secondary"
                      style={{
                        padding: '10px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        border: '1.5px solid #5F259F',
                        background: '#FAF5FF',
                        textDecoration: 'none',
                        color: '#5F259F',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-lg)'
                      }}
                      onClick={() => toast.success('Opening PhonePe...')}
                    >
                      <span style={{ fontSize: '1.25rem' }}>🟣</span>
                      PhonePe
                    </a>

                    {/* Paytm */}
                    <a
                      href={`paytmmp://pay?pa=secureprint@upi&pn=${encodeURIComponent(job?.shopId?.name || 'SecurePrint')}&am=${payableAmount}&cu=INR&tn=Job_${job?.jobNumber || 'Print'}`}
                      className="btn btn-secondary"
                      style={{
                        padding: '10px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        border: '1.5px solid #00BAF2',
                        background: '#F0F9FF',
                        textDecoration: 'none',
                        color: '#0369A1',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-lg)'
                      }}
                      onClick={() => toast.success('Opening Paytm...')}
                    >
                      <span style={{ fontSize: '1.25rem' }}>🔷</span>
                      Paytm / UPI
                    </a>
                  </div>
                </div>

                {/* Scan UPI QR code */}
                {upiQrUrl && (
                  <div style={{
                    background: 'white',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-4)',
                    textAlign: 'center',
                    border: '1px solid #E2E8F0',
                    marginBottom: 'var(--space-4)'
                  }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                      Scan this QR with any UPI App (GPay / PhonePe / Paytm):
                    </div>
                    <img
                      src={upiQrUrl}
                      alt="UPI Payment QR Code"
                      style={{
                        width: 170,
                        height: 170,
                        margin: '0 auto',
                        display: 'block',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #CBD5E1'
                      }}
                    />
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      marginTop: 'var(--space-2)',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span>UPI ID: <strong>secureprint@upi</strong></span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ padding: 2, height: 'auto', width: 'auto' }}
                        onClick={() => {
                          navigator.clipboard.writeText('secureprint@upi')
                          setCopiedUpi(true)
                          toast.success('UPI ID copied!')
                          setTimeout(() => setCopiedUpi(false), 2000)
                        }}
                      >
                        {copiedUpi ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Online Payment Button */}
                <button
                  id="confirm-online-pay-btn"
                  className="btn btn-primary btn-lg w-full"
                  style={{
                    height: 52,
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #1A56DB 0%, #1E40AF 100%)',
                    boxShadow: '0 4px 14px 0 rgba(26, 86, 219, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10
                  }}
                  disabled={paying}
                  onClick={handlePayment}
                >
                  {paying ? (
                    <><div className="spinner" /> Verifying Online Payment...</>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      <span>✓ I Have Paid Online (Start 10s Cleanup)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: CASH AT COUNTER */}
            {paymentTab === 'CASH' && (
              <div className="animate-fadeIn" style={{
                background: '#ECFDF5',
                border: '1.5px solid #10B981',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-5)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: '#D1FAE5', color: '#047857',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto var(--space-3)'
                }}>
                  <Banknote size={32} />
                </div>
                <h4 style={{ color: '#065F46', margin: '0 0 var(--space-1)', fontSize: 'var(--font-size-lg)' }}>
                  Pay ₹{payableAmount} in Cash
                </h4>
                <p style={{ color: '#047857', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-4)' }}>
                  Please hand over ₹{payableAmount} cash directly to the shopkeeper at the counter.
                </p>

                <button
                  id="confirm-cash-btn"
                  className="btn btn-success btn-lg w-full"
                  style={{
                    height: 52,
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    boxShadow: '0 4px 14px 0 rgba(5, 150, 105, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10
                  }}
                  disabled={payingCash}
                  onClick={handleCashPayment}
                >
                  {payingCash ? (
                    <><div className="spinner" /> Confirming Cash Payment...</>
                  ) : (
                    <>
                      <Banknote size={20} />
                      <span>💵 Confirm Cash Paid (नकद दे दिया)</span>
                    </>
                  )}
                </button>

                <div style={{ fontSize: 'var(--font-size-xs)', color: '#065F46', marginTop: 'var(--space-3)', opacity: 0.9 }}>
                  💡 Shopkeeper can also confirm from their counter screen. Once confirmed, file deletion countdown begins immediately!
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--font-size-xs)', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Lock size={12} /> Pay online or pay cash at shop counter. Files auto-delete in 10s after payment!
            </div>
          </div>
        )}

        {/* 2. PAYMENT SUCCESSFUL & 10-SECOND COUNTDOWN */}
        {isPaid && !isFilesDeleted && (
          <div className="card animate-slideUp" style={{
            marginBottom: 'var(--space-6)',
            border: '2px solid #7C3AED',
            background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
            textAlign: 'center',
            padding: 'var(--space-6)'
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#7C3AED', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-3)',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
            }}>
              <CheckCircle size={28} />
            </div>

            <h3 style={{ fontSize: 'var(--font-size-xl)', color: '#5B21B6', marginBottom: 'var(--space-1)' }}>
              Payment Successful
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: '#6D28D9', marginBottom: 'var(--space-4)' }}>
              Payment received: <strong>₹{payableAmount}</strong>. Preparing secure cleanup...
            </p>

            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              border: '1px solid #DDD6FE',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                Documents will be removed automatically
              </p>

              {/* Big animated countdown number */}
              <div style={{
                fontSize: '3.5rem',
                fontWeight: 900,
                color: '#7C3AED',
                lineHeight: 1,
                marginBottom: 'var(--space-2)',
                fontVariantNumeric: 'tabular-nums',
                animation: 'pulse 1s infinite'
              }}>
                {countdown !== null ? countdown : 10}
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                seconds remaining until permanent disk deletion
              </span>
            </div>
          </div>
        )}

        {/* 3. FILES DELETED CONFIRMATION */}
        {isFilesDeleted && (
          <div className="card animate-slideUp" style={{
            marginBottom: 'var(--space-6)',
            border: '2px solid #059669',
            background: '#ECFDF5',
            padding: 'var(--space-6)',
            textAlign: 'center'
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#059669', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-3)'
            }}>
              <Trash2 size={26} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-xl)', color: '#065F46', marginBottom: 'var(--space-1)' }}>
              ✓ Files Deleted
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: '#047857', marginBottom: 'var(--space-3)' }}>
              Your uploaded documents have been permanently removed from private storage.
            </p>

            {job?.deletedAt && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: '#065F46', opacity: 0.85, fontWeight: 600 }}>
                Deleted at: {new Date(job.deletedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>
            )}
          </div>
        )}

        {/* Status Timeline */}
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-lg)' }}>Order Lifecycle</h3>
          <div className="status-timeline">
            {[
              {
                id: 'READY',
                label: 'Documents sent to shop',
                sub: 'Files uploaded and encrypted',
                isDone: true,
                isActive: false
              },
              {
                id: 'RECEIVED',
                label: 'Shop received documents',
                sub: 'Shopkeeper received print request',
                isDone: ['RECEIVED', 'PRINTING', 'AWAITING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'CLEANUP_COUNTDOWN', 'COMPLETED'].includes(job?.status) || isPrintingDone,
                isActive: job?.status === 'READY'
              },
              {
                id: 'PRINTING',
                label: 'Printing in progress',
                sub: job?.status === 'PRINTING' ? 'Printing your physical documents...' : '',
                isDone: isPrintingDone,
                isActive: job?.status === 'PRINTING'
              },
              {
                id: 'COMPLETED',
                label: 'Printing completed',
                sub: job?.completedAt ? `Finished at ${new Date(job.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Physical print completed',
                isDone: isPrintingDone,
                isActive: false
              },
              {
                id: 'PAYMENT',
                label: isPaid ? 'Payment successful' : 'Payment required',
                sub: isPaid ? `₹${payableAmount} paid via Razorpay` : isAwaitingPayment ? `Amount: ₹${payableAmount}` : 'Awaiting completion',
                isDone: isPaid,
                isActive: isAwaitingPayment
              },
              {
                id: 'DELETED',
                label: 'Files deleted',
                sub: isFilesDeleted
                  ? 'Actual PDF/images deleted from server'
                  : isPaid
                    ? `Secure 10s cleanup in progress (${countdown ?? 10}s)...`
                    : 'Session files destroyed permanently after payment',
                isDone: isFilesDeleted,
                isActive: isPaid && !isFilesDeleted
              }
            ].map((item, i) => {
              const { isDone, isActive } = item

              return (
                <div key={i} className={`status-item ${isDone ? 'completed' : ''}`} style={{ paddingBottom: i < 5 ? 'var(--space-5)' : 0 }}>
                  <div className={`status-icon ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}>
                    {isDone ? (
                      <CheckCircle size={14} />
                    ) : isActive ? (
                      <div className="spinner spinner-primary" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    ) : (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-border)' }} />
                    )}
                  </div>
                  <div className="status-content">
                    <h4 style={{ color: isDone || isActive ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                      {item.label}
                    </h4>
                    {item.sub && (
                      <p style={{
                        color: isActive
                          ? 'var(--color-primary)'
                          : isDone && item.id === 'DELETED'
                            ? 'var(--color-verified)'
                            : undefined
                      }}>
                        {item.sub}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Job Summary */}
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-base)' }}>Job Summary</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
            {[
              ['Job ID', `#${job?.jobNumber}`],
              ['Customer', job?.customerName || 'You'],
              ['Files', `${job?.totalFiles} file(s)`],
              ['Pages', `${job?.totalPages} pages`],
              ['Copies', job?.copies],
              ['Print Mode', job?.colorMode === 'BW' ? 'Black & White' : 'Colour'],
              ['Paper Size', job?.paperSize || 'A4'],
              ['Payment Status', isPaid ? '✓ PAID' : 'PENDING']
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 600, color: k === 'Payment Status' && isPaid ? '#059669' : 'var(--color-text)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Receipt / Actions */}
        {isPaid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <button
              id="view-receipt-btn"
              className="btn btn-success btn-lg"
              style={{ fontWeight: 700 }}
              onClick={() => navigate(`/receipt/${jobId}?token=${sessionToken}`)}
            >
              <Receipt size={20} />
              View Official Receipt
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              Print another document
            </button>
          </div>
        )}

        {isFailed && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Try Again
            </button>
          </div>
        )}

        {/* Real-time sync badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-xs)',
          marginTop: 'var(--space-4)'
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-verified)', animation: 'pulse 2s infinite' }} />
          Server-synchronized real-time status
        </div>
      </div>
    </div>
  )
}

export default StatusPage
