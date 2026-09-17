import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import {
  Shield, CheckCircle, Clock, Printer, Trash2,
  AlertCircle, Receipt, Lock, Banknote,
  QrCode, Smartphone, ArrowRight, Copy, Check, Camera, RefreshCw, Eye
} from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import CameraQrScannerModal from '../../components/CameraQrScannerModal'

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

export default function StatusPage() {
  const { jobId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionToken = searchParams.get('token')

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Payment states
  const [payingOnline, setPayingOnline] = useState(false)
  const [payingCash, setPayingCash] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState(null) // null | 'ONLINE' | 'CASH'
  const [showQrCode, setShowQrCode] = useState(false)
  const [upiQrUrl, setUpiQrUrl] = useState('')
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [scannedQrResult, setScannedQrResult] = useState(null)

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

  // Get Shop's configured UPI ID (Never hardcode secureprint@upi)
  const shopUpiId = job?.shopId?.upiId || (job?.shopId?.slug ? `${job?.shopId?.slug}@upi` : 'counter@upi')
  const payableAmount = job?.finalPrice != null ? job.finalPrice : (job?.estimatedPrice || 10)

  // Generate dynamic UPI QR code based on shop's configured payment setup
  useEffect(() => {
    if (!job) return
    const shopName = job?.shopId?.name || 'SecurePrint Counter'
    const upiStr = `upi://pay?pa=${encodeURIComponent(shopUpiId)}&pn=${encodeURIComponent(shopName)}&am=${payableAmount}&cu=INR&tn=Job_${job?.jobNumber || 'Print'}`
    QRCode.toDataURL(upiStr, {
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    }).then(setUpiQrUrl).catch(() => {})
  }, [job, shopUpiId, payableAmount])

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

        if (data.status === 'PRINTING_COMPLETED' || data.paymentStatus === 'AWAITING_PAYMENT') {
          toast.success('Printing completed! Please select payment method.', { icon: '🖨️' })
        }
      }
    })

    socket.on('job-updated', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setJob(prev => prev ? {
          ...prev,
          ...data
        } : prev)
      }
    })

    socket.on('payment-success', (data) => {
      if (data.jobId === jobId || data.jobId?.toString() === jobId) {
        setJob(prev => prev ? {
          ...prev,
          paymentStatus: 'PAID',
          status: 'PAYMENT_SUCCESS',
          paidAt: data.paidAt || new Date().toISOString(),
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
          status: 'JOB_CLOSED',
          filesDeleted: true,
          deletedAt: data.deletedAt || new Date().toISOString(),
          cleanupStatus: 'SUCCESS'
        } : prev)
        toast.success('Your uploaded files have been permanently deleted!')
      }
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
          setJob(prev => ({ ...prev, ...res.data.data }))
        }
      } catch (e) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [jobId, job?.filesDeleted, sessionToken])

  // Live 10-second countdown calculation based on backend timestamp
  useEffect(() => {
    const isPaidState = job?.paymentStatus === 'PAID' || job?.status === 'PAYMENT_SUCCESS' || job?.status === 'CLEANUP_COUNTDOWN'
    if (isPaidState && !job?.filesDeleted) {
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
  }, [job?.paymentStatus, job?.status, job?.filesDeleted, job?.cleanupScheduledAt, countdown])

  // Handle Online Payment Gateway (Razorpay)
  const handleStartOnlinePayment = async () => {
    if (payingOnline) return
    setPayingOnline(true)
    try {
      const orderRes = await api.post('/payments/create-order', { jobId })
      const orderData = orderRes.data.data

      const isSdkLoaded = await loadRazorpayScript()

      if ((isSdkLoaded || window.Razorpay) && window.Razorpay && orderData.keyId) {
        const options = {
          key: orderData.keyId,
          amount: orderData.amountPaise,
          currency: orderData.currency || 'INR',
          name: 'SecurePrint',
          description: `Print Job #${orderData.jobNumber || ''} at ${orderData.shopName || 'Shop'}`,
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
              setJob(prev => ({ ...prev, ...verifyRes.data.data, paymentStatus: 'PAID', status: 'PAYMENT_SUCCESS' }))
              setCountdown(10)
            } catch (vErr) {
              toast.dismiss('verify-pay')
              toast.error(vErr.response?.data?.message || 'Payment verification failed.')
            } finally {
              setPayingOnline(false)
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
              setPayingOnline(false)
              toast('Payment cancelled. Your document has not been deleted.')
            }
          }
        }
        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', (response) => {
          setPayingOnline(false)
          toast.error(response.error?.description || 'Payment failed. Your document is still safe.')
        })
        rzp.open()
      } else {
        // Verification Simulation Mode (when live Razorpay keys are not configured in dev)
        toast.loading('Processing secure payment verification...', { id: 'verify-pay' })
        const verifyRes = await api.post('/payments/verify', {
          jobId,
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: `pay_${Date.now()}`,
          razorpay_signature: 'verified_server'
        })
        toast.dismiss('verify-pay')
        toast.success('Payment verified! 10-second file cleanup countdown started.')
        setJob(prev => ({ ...prev, ...verifyRes.data.data, paymentStatus: 'PAID', status: 'PAYMENT_SUCCESS' }))
        setCountdown(10)
        setPayingOnline(false)
      }
    } catch (err) {
      toast.dismiss('verify-pay')
      toast.error(err.response?.data?.message || 'Unable to start online payment. Please try again.')
      setPayingOnline(false)
    }
  }

  // Handle Counter Cash Payment Request
  const handleRequestCashPayment = async () => {
    if (payingCash) return
    setPayingCash(true)
    try {
      toast.loading('Requesting cash payment at counter...', { id: 'req-cash' })
      const res = await api.post('/payments/request-cash', { jobId })
      toast.dismiss('req-cash')
      toast.success(res.data.message || 'Cash payment requested. Please pay at counter.')
      setJob(prev => ({
        ...prev,
        paymentStatus: 'CASH_PAYMENT_PENDING',
        status: 'CASH_PAYMENT_PENDING',
        paymentMethod: 'CASH'
      }))
      setSelectedMethod('CASH')
    } catch (err) {
      toast.dismiss('req-cash')
      toast.error(err.response?.data?.message || 'Failed to request cash payment.')
    } finally {
      setPayingCash(false)
    }
  }

  // Copy Shop UPI ID
  const handleCopyUpi = () => {
    if (!shopUpiId) return
    navigator.clipboard.writeText(shopUpiId)
    setCopiedUpi(true)
    toast.success('Shop UPI ID copied to clipboard!')
    setTimeout(() => setCopiedUpi(false), 2500)
  }

  // Handle camera QR scan success (Extracts info, does NOT assume payment completed!)
  const handleScanSuccess = (decodedText) => {
    setIsCameraOpen(false)
    setScannedQrResult(decodedText)
    toast.success('Shop QR scanned! Proceed to pay securely.', { icon: '📷' })
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

  // ── State Machine Evaluation ──────────────────────────────────
  const isPrintingCompleted = [
    'PRINTING_COMPLETED', 'AWAITING_PAYMENT', 'PAYMENT_METHOD_SELECTED', 'PAYMENT_PROCESSING',
    'CASH_PAYMENT_PENDING', 'CASH_PAYMENT_CONFIRMED', 'PAID', 'PAYMENT_SUCCESS',
    'CLEANUP_PENDING', 'CLEANUP_COUNTDOWN', 'FILES_DELETED', 'JOB_CLOSED', 'COMPLETED'
  ].includes(job?.status) || job?.paymentStatus === 'AWAITING_PAYMENT' || Boolean(job?.completedAt)

  const isPaid = [
    'PAID', 'PAYMENT_SUCCESS', 'CLEANUP_PENDING', 'CLEANUP_COUNTDOWN', 'FILES_DELETED', 'JOB_CLOSED', 'COMPLETED'
  ].includes(job?.status) || job?.paymentStatus === 'PAID'

  const isFilesDeleted = Boolean(job?.filesDeleted)
  const isCashPending = job?.paymentStatus === 'CASH_PAYMENT_PENDING' || job?.paymentStatus === 'PAYMENT_PENDING_CASH'

  // VERY IMPORTANT BUSINESS RULE: Payment option MUST NOT be visible before shopkeeper marks PRINTING_COMPLETED!
  const shouldShowPayment = isPrintingCompleted && !isPaid && !isFilesDeleted

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBottom: 'var(--space-12)' }}>
      {/* Header Banner */}
      <div style={{
        background: isFilesDeleted
          ? 'linear-gradient(135deg, #059669 0%, #064E3B 100%)'
          : isPaid
            ? 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)'
            : isPrintingCompleted
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
            ? '✓ Payment Successful'
            : isPaid
              ? '✓ Payment Successful'
              : isPrintingCompleted
                ? '✓ Printing Completed'
                : 'PRINTING YOUR DOCUMENT'}
        </h1>
        <p style={{ opacity: 0.9, fontSize: 'var(--font-size-sm)' }}>
          Job #{job?.jobNumber} · {job?.shopId?.name || 'SecurePrint Partner'}
        </p>
      </div>

      <div className="container" style={{ paddingTop: 'var(--space-6)', maxWidth: 540 }}>

        {/* ═══════════════════════════════════════════════════════════
            PHASE 1: BEFORE PRINTING IS COMPLETED (NO PAYMENT SHOWN)
            ═══════════════════════════════════════════════════════════ */}
        {!isPrintingCompleted && !isPaid && !isFilesDeleted && (
          <div className="card animate-fadeIn" style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            border: '2px solid #3B82F6',
            background: 'white',
            boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.15)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#EFF6FF', color: '#1A56DB',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)'
            }}>
              <Printer size={28} className="animate-pulse" />
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 'var(--space-4)' }}>
              PRINTING YOUR DOCUMENT
            </h2>

            {/* Checklist items requested in Section 1 */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              textAlign: 'left',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                <CheckCircle size={18} />
                <span>Document sent to shop</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                <CheckCircle size={18} />
                <span>Shop received document</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1A56DB', fontWeight: 700, fontSize: 14 }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span>Printing in progress</span>
              </div>
            </div>

            <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.5, marginBottom: 'var(--space-2)' }}>
              Please wait for the shopkeeper to complete printing.
            </p>
            <p style={{ color: '#64748B', fontSize: 13, fontWeight: 600, margin: 0 }}>
              Payment will become available after printing is completed.
            </p>

            <div style={{
              marginTop: 'var(--space-6)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              color: 'var(--color-text-secondary)'
            }}>
              <span>Job #{job?.jobNumber}</span>
              <span>{job?.colorMode === 'COLOR' ? 'Color Print' : 'B&W Print'} · {job?.totalPages || 1} Pages</span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PHASE 2: PRINTING COMPLETED — CHOOSE PAYMENT METHOD
            ═══════════════════════════════════════════════════════════ */}
        {shouldShowPayment && !isCashPending && (
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
                <h3 style={{ fontSize: 'var(--font-size-lg)', color: '#92400E', margin: 0 }}>
                  ✓ Printing Completed
                </h3>
                <p style={{ fontSize: 'var(--font-size-sm)', color: '#B45309', margin: 0 }}>
                  Your document has been printed. Choose how you'd like to pay:
                </p>
              </div>
            </div>

            {/* Amount Payable Card */}
            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-5)',
              border: '1px solid #FDE68A'
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Job #{job?.jobNumber}
                </div>
                <div style={{ fontSize: 14, color: '#475569', fontWeight: 600 }}>Amount Payable:</div>
              </div>
              <span style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 900, color: '#1A56DB' }}>
                ₹{payableAmount}
              </span>
            </div>

            {/* Exactly TWO primary payment options (Section 5 & 27) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* OPTION 1: PAY ONLINE */}
              <div style={{
                background: selectedMethod === 'ONLINE' ? '#EFF6FF' : 'white',
                border: selectedMethod === 'ONLINE' ? '2px solid #1A56DB' : '1px solid #E2E8F0',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                transition: 'all 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: selectedMethod === 'ONLINE' ? 14 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#DBEAFE', color: '#1A56DB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>📱 PAY ONLINE</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Scan UPI QR / Camera Scanner / Gateway</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn ${selectedMethod === 'ONLINE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    style={{ fontWeight: 700 }}
                    onClick={() => setSelectedMethod(selectedMethod === 'ONLINE' ? null : 'ONLINE')}
                  >
                    {selectedMethod === 'ONLINE' ? 'Selected' : 'PAY ONLINE'}
                  </button>
                </div>

                {/* Sub-section when PAY ONLINE is active (Section 6 & 28) */}
                {selectedMethod === 'ONLINE' && (
                  <div className="animate-fadeIn" style={{ borderTop: '1px solid #DBEAFE', paddingTop: 14, marginTop: 10 }}>
                    
                    {/* Action buttons: Camera scanner & Show QR */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', fontSize: 13, fontWeight: 700 }}
                        onClick={() => setIsCameraOpen(true)}
                      >
                        <Camera size={16} /> SCAN QR WITH CAMERA
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', fontSize: 13, fontWeight: 700 }}
                        onClick={() => setShowQrCode(!showQrCode)}
                      >
                        <QrCode size={16} /> {showQrCode ? 'HIDE PAYMENT QR' : 'SHOW PAYMENT QR'}
                      </button>
                    </div>

                    {/* Copy UPI ID */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <input
                        readOnly
                        className="input"
                        style={{ fontSize: 12, height: 36, background: '#F8FAFC' }}
                        value={shopUpiId}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ whiteSpace: 'nowrap', border: '1px solid #CBD5E1' }}
                        onClick={handleCopyUpi}
                      >
                        {copiedUpi ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy UPI ID</>}
                      </button>
                    </div>

                    {/* On-screen UPI QR display */}
                    {showQrCode && (
                      <div className="animate-scaleIn" style={{ textAlign: 'center', padding: '14px', background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid #E2E8F0', marginBottom: 14 }}>
                        {upiQrUrl ? (
                          <img src={upiQrUrl} alt="Shop UPI QR" style={{ width: 180, height: 180, margin: '0 auto 8px', display: 'block' }} />
                        ) : (
                          <div className="spinner spinner-primary" style={{ margin: '20px auto' }} />
                        )}
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{job?.shopId?.name || 'Shop Counter'}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>Scan using Google Pay, PhonePe, Paytm or BHIM</div>
                      </div>
                    )}

                    {/* Scanned QR alert if scanned with camera */}
                    {scannedQrResult && (
                      <div style={{ padding: '10px 12px', background: '#DCFCE7', borderRadius: 8, color: '#166534', fontSize: 12, marginBottom: 12 }}>
                        ✓ QR Scanned successfully. Click Pay Securely to verify.
                      </div>
                    )}

                    {/* Gateway Checkout Button */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payingOnline}
                      style={{ width: '100%', padding: '12px', fontWeight: 800, fontSize: 15 }}
                      onClick={handleStartOnlinePayment}
                    >
                      {payingOnline ? (
                        <><div className="spinner" /> Opening Payment Gateway...</>
                      ) : (
                        <><Lock size={16} /> Pay ₹{payableAmount} Securely</>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* OPTION 2: CASH PAYMENT */}
              <div style={{
                background: selectedMethod === 'CASH' ? '#F0FDF4' : 'white',
                border: selectedMethod === 'CASH' ? '2px solid #059669' : '1px solid #E2E8F0',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                transition: 'all 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: selectedMethod === 'CASH' ? 14 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#DCFCE7', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Banknote size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>💵 CASH PAYMENT</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Pay directly at shop counter</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn ${selectedMethod === 'CASH' ? 'btn-success' : 'btn-secondary'} btn-sm`}
                    style={{ fontWeight: 700 }}
                    onClick={() => setSelectedMethod(selectedMethod === 'CASH' ? null : 'CASH')}
                  >
                    {selectedMethod === 'CASH' ? 'Selected' : 'PAY CASH'}
                  </button>
                </div>

                {selectedMethod === 'CASH' && (
                  <div className="animate-fadeIn" style={{ borderTop: '1px solid #BBF7D0', paddingTop: 14, marginTop: 10 }}>
                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 14 }}>
                      Hand ₹{payableAmount} in cash to the shopkeeper. Click below to notify the counter for confirmation.
                    </p>
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={payingCash}
                      style={{ width: '100%', padding: '12px', fontWeight: 800, fontSize: 15 }}
                      onClick={handleRequestCashPayment}
                    >
                      {payingCash ? <><div className="spinner" /> Notifying Counter...</> : <><Banknote size={16} /> Request Cash Payment (₹{payableAmount})</>}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PHASE 3: CASH PAYMENT PENDING (WAITING FOR SHOP CONFIRMATION)
            ═══════════════════════════════════════════════════════════ */}
        {isCashPending && !isPaid && !isFilesDeleted && (
          <div className="card animate-fadeIn" style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            border: '2px solid #059669',
            background: '#F0FDF4',
            boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.15)',
            marginBottom: 'var(--space-6)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#DCFCE7', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)'
            }}>
              <Banknote size={28} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#065F46', marginBottom: 8 }}>
              Cash Payment
            </h3>
            <p style={{ fontSize: 15, color: '#166534', fontWeight: 600, marginBottom: 12 }}>
              Please pay ₹{payableAmount} at the shop counter.
            </p>
            <p style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 'var(--space-5)' }}>
              After paying, ask the shopkeeper to confirm your cash payment.
            </p>

            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              border: '1px solid #86EFAC',
              marginBottom: 'var(--space-4)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Status:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, color: '#065F46', fontSize: 14 }}>
                <div className="spinner spinner-primary" style={{ width: 14, height: 14, borderWidth: 2 }} />
                WAITING FOR SHOP CONFIRMATION
              </div>
            </div>

            {/* Option to switch to Online if customer changes their mind */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectedMethod('ONLINE')
                setJob(prev => ({ ...prev, paymentStatus: 'AWAITING_PAYMENT' }))
              }}
              style={{ color: '#1A56DB', fontWeight: 600 }}
            >
              Want to pay online instead? Click here
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PHASE 4: PAYMENT SUCCESS & 10-SECOND CLEANUP COUNTDOWN
            ═══════════════════════════════════════════════════════════ */}
        {isPaid && !isFilesDeleted && (
          <div className="card animate-scaleIn" style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            border: '2px solid #7C3AED',
            background: '#F5F3FF',
            marginBottom: 'var(--space-6)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#EDE9FE', color: '#7C3AED',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)'
            }}>
              <CheckCircle size={32} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#5B21B6', marginBottom: 4 }}>
              ✓ Payment Successful
            </h3>
            <p style={{ fontSize: 14, color: '#6D28D9', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
              Amount: ₹{payableAmount}
            </p>

            {/* Countdown widget */}
            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              border: '2px solid #DDD6FE',
              marginBottom: 'var(--space-4)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Privacy File Auto-Deletion:
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#7C3AED' }}>
                {countdown != null ? countdown : 10}s
              </div>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                Uploaded files are permanently deleted from storage for customer privacy.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PHASE 5: FILES PERMANENTLY DELETED (SECTION 23 FINAL STATUS)
            ═══════════════════════════════════════════════════════════ */}
        {isFilesDeleted && (
          <div className="card animate-scaleIn" style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            border: '2px solid #059669',
            background: 'white',
            marginBottom: 'var(--space-6)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#D1FAE5', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)'
            }}>
              <CheckCircle size={32} />
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#065F46', marginBottom: 4 }}>
              ✓ Payment Successful
            </h3>
            <p style={{ fontSize: 16, color: '#059669', fontWeight: 800, marginBottom: 'var(--space-5)' }}>
              Amount: ₹{payableAmount}
            </p>

            {/* Final checklist from Section 23 */}
            <div style={{
              background: '#F0FDF4',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              textAlign: 'left',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                <Check size={18} /> <span>Printing Completed</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                <Check size={18} /> <span>Payment Received</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontWeight: 700, fontSize: 14 }}>
                <Check size={18} /> <span>Document Deleted</span>
              </div>
            </div>

            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
              Your document has been securely deleted for privacy.
            </p>

            {/* Section 24: Upload again to print */}
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 700 }}
              onClick={() => {
                toast('Your document was deleted for privacy. Please upload it again to print.')
                navigate(`/shop/${job?.shopId?.slug || ''}`)
              }}
            >
              📄 Print Another Document (Upload Fresh Files)
            </button>
          </div>
        )}

      </div>

      {/* Camera QR Scanner Modal */}
      <CameraQrScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScanSuccess={handleScanSuccess}
        shopUpiId={shopUpiId}
        amount={payableAmount}
        onShowQrFallback={() => setShowQrCode(true)}
      />
    </div>
  )
}
