import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Shield, CheckCircle, AlertTriangle, Printer, FileText, Image as ImageIcon,
  Trash2, Plus, ArrowRight, Lock, Sparkles, User, RefreshCw, Send, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

const CustomerShopFlow = () => {
  const { slug } = useParams()
  const navigate = useNavigate()

  // State
  const [loadingShop, setLoadingShop] = useState(true)
  const [shop, setShop] = useState(null)
  const [isInactive, setIsInactive] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  // Step 1: Customer Name
  const [customerName, setCustomerName] = useState('')
  const [session, setSession] = useState(null)
  const [sessionToken, setSessionToken] = useState(null)
  const [startingSession, setStartingSession] = useState(false)

  // Step 2: Documents & Settings
  const [files, setFiles] = useState([])
  const [copies, setCopies] = useState(1)
  const [colorMode, setColorMode] = useState('BW')
  const [paperSize, setPaperSize] = useState('A4')
  const [duplex, setDuplex] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState('')

  // 1. Fetch Shop details by slug
  const fetchShop = useCallback(async () => {
    if (!slug) return
    setLoadingShop(true)
    setErrorMessage(null)
    try {
      const res = await api.get(`/shops/by-slug/${slug}`)
      if (res.data.isInactive) {
        setIsInactive(true)
        setShop(res.data.data)
      } else {
        setIsInactive(false)
        setShop(res.data.data)
      }
    } catch (err) {
      if (err.response?.data?.isInactive) {
        setIsInactive(true)
        setShop(err.response.data.data)
      } else {
        setErrorMessage(err.response?.data?.message || 'Shop not found. Please scan the counter QR again.')
      }
    } finally {
      setLoadingShop(false)
    }
  }, [slug])

  useEffect(() => {
    fetchShop()
  }, [fetchShop])

  // 2. Start session with customer's name
  const handleStartSession = async (e) => {
    e.preventDefault()
    if (!customerName.trim()) {
      toast.error('Please enter your name to proceed')
      return
    }
    setStartingSession(true)
    try {
      const res = await api.post('/sessions/start-by-slug', {
        slug,
        customerName: customerName.trim()
      })
      setSession(res.data.data)
      setSessionToken(res.data.data.sessionToken)
      toast.success(`Welcome, ${res.data.data.customerName}!`)
    } catch (err) {
      if (err.response?.data?.isInactive) {
        setIsInactive(true)
      }
      toast.error(err.response?.data?.message || 'Could not start print session')
    } finally {
      setStartingSession(false)
    }
  }

  // 3. Dropzone for selecting documents
  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length > 0) {
      rejected.forEach(({ errors }) => {
        toast.error(errors[0]?.message || 'File not supported')
      })
    }
    if (accepted.length > 0) {
      setFiles(prev => [...prev, ...accepted])
      toast.success(`${accepted.length} file${accepted.length > 1 ? 's' : ''} added`)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    noClick: true, // We have explicit "+ SELECT DOCUMENTS" button and drop area
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    maxSize: 50 * 1024 * 1024,
    multiple: true
  })

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Estimated Price Calculation
  const totalFiles = files.length
  const estimatedPages = Math.max(1, totalFiles)
  const ratePerPage = colorMode === 'COLOR' ? (shop?.pricing?.colorPerPage || 5) : (shop?.pricing?.bwPerPage || 1)
  const estimatedTotal = Math.ceil(estimatedPages * ratePerPage * copies)

  // 4. Send for print (one tap, direct job creation)
  const handleSendForPrint = async () => {
    if (files.length === 0) {
      toast.error('Please select at least 1 PDF or Photo to print')
      return
    }
    if (!session?.sessionId || !sessionToken) {
      toast.error('Session expired. Please re-enter your name.')
      return
    }

    setSending(true)
    setSendProgress('Encrypting & uploading documents...')

    try {
      // Step A: Upload files to session
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))

      await api.post(`/documents/sessions/${session.sessionId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Session-Token': sessionToken
        }
      })

      setSendProgress('Sending to merchant print queue...')

      // Step B: Submit print job directly to merchant
      const jobRes = await api.post('/jobs', {
        sessionId: session.sessionId,
        copies,
        colorMode,
        paperSize,
        duplex,
        customerName: session.customerName || customerName.trim()
      }, {
        headers: {
          'X-Session-Token': sessionToken
        }
      })

      const jobData = jobRes.data.data
      toast.success('Print request sent successfully!', { icon: '🖨️' })

      // Step C: Route directly to status page
      navigate(`/status/${jobData.jobId}?token=${sessionToken}`)
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Failed to send documents. Please try again.')
      setSending(false)
      setSendProgress('')
    }
  }

  // Loading Screen
  if (loadingShop) {
    return (
      <div className="loading-screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-primary" style={{ width: 44, height: 44, borderWidth: 4 }} />
        <p style={{ marginTop: 'var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Connecting to shop counter...
        </p>
      </div>
    )
  }

  // Error State: Shop not found
  if (errorMessage && !isInactive) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', background: 'var(--color-bg)' }}>
        <div className="card" style={{ maxWidth: 460, width: '100%', textAlign: 'center', padding: 'var(--space-8)' }}>
          <AlertTriangle size={52} color="var(--color-warning)" style={{ margin: '0 auto var(--space-4)' }} />
          <h2 style={{ marginBottom: 'var(--space-2)' }}>Shop Not Found</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
            {errorMessage}
          </p>
          <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Return to Home
          </Link>
        </div>
      </div>
    )
  }

  // Inactive Shop State (Super Admin marked shop inactive)
  if (isInactive) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', background: 'var(--color-bg)' }}>
        <div className="card" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: 'var(--space-10)', borderTop: '4px solid var(--color-warning)' }}>
          <div style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-4)'
          }}>
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-2)' }}>
            Shop Currently Unavailable
          </h2>
          <div style={{
            background: 'var(--color-surface-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text)',
            marginBottom: 'var(--space-4)'
          }}>
            {shop?.name || 'SecurePrint Counter'}
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
            This SecurePrint shop is currently unavailable. The counter may be closed or temporarily paused by the shopkeeper.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={fetchShop}>
              <RefreshCw size={16} /> Check Again
            </button>
            <Link to="/" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              SecurePrint Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 1: Enter Customer Name ──────────────────────────────
  if (!session) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #EFF6FF 0%, var(--color-bg) 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)'
      }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          {/* Shop Header Card */}
          <div className="card animate-fadeIn" style={{ padding: 'var(--space-8)', boxShadow: 'var(--shadow-lg)' }}>
            {/* Counter Identity */}
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              <div style={{
                width: 52, height: 52,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-primary)',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto var(--space-3)',
                boxShadow: 'var(--shadow-primary)'
              }}>
                <Printer size={26} />
              </div>
              <span className="badge badge-verified" style={{ marginBottom: 'var(--space-2)' }}>
                <CheckCircle size={12} /> Verified Printing Counter
              </span>
              <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-text)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {shop?.name}
              </h1>
              {shop?.address?.city && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', wordBreak: 'break-word' }}>
                  {shop.address.street ? `${shop.address.street}, ` : ''}{shop.address.city}
                </p>
              )}
            </div>

            {/* Privacy Promise */}
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 'var(--space-6)'
            }}>
              <Shield size={20} color="var(--color-verified)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: '#166534', lineHeight: 1.4 }}>
                <strong>Zero WhatsApp needed.</strong> Your files are encrypted and automatically deleted after printing.
              </div>
            </div>

            {/* Name Input Form */}
            <form onSubmit={handleStartSession}>
              <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                  Enter Your Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    id="customer-name-input"
                    className="form-input"
                    style={{ paddingLeft: 42, fontSize: 'var(--font-size-base)', fontWeight: 600 }}
                    placeholder="e.g. Rahul Kumar"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 6 }}>
                  This name will appear on the shopkeeper's counter queue so they hand you the right printout.
                </div>
              </div>

              <button
                type="submit"
                id="start-flow-btn"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', gap: 8 }}
                disabled={startingSession}
              >
                {startingSession ? (
                  <><div className="spinner" /> Connecting...</>
                ) : (
                  <>Continue to Upload <ArrowRight size={18} /></>
                )}
              </button>
            </form>
          </div>

          <div style={{ textAlign: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Powered by SecurePrint · Ephemeral Digital Printing
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2: Customer User Dashboard ──────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', paddingBottom: 'var(--space-16)' }}>
      {/* Top Navigation Bar */}
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Shield size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
                SecurePrint
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Sending to: <strong>{shop?.name}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="badge badge-verified" style={{ fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}>
              <Lock size={12} /> E2E Encrypted
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }} {...getRootProps()}>
        <input {...getInputProps()} />

        {/* User Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1A56DB 0%, #0F3BA0 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          color: 'white',
          marginBottom: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)'
        }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93C5FD', fontWeight: 700, marginBottom: 4 }}>
              Customer User Dashboard
            </div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'white', margin: 0 }}>
              Hello, {session?.customerName || customerName}! 👋
            </h1>
            <p style={{ color: '#E0E7FF', fontSize: 'var(--font-size-sm)', marginTop: 4, margin: 0 }}>
              Select documents to send directly to the shopkeeper's counter.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--font-size-xs)', textAlign: 'right' }}>
            <div>Counter: <strong>{shop?.name}</strong></div>
            <div style={{ color: '#BFDBFE' }}>B&W ₹{shop?.pricing?.bwPerPage || 1} · Colour ₹{shop?.pricing?.colorPerPage || 5}</div>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="card" style={{
          padding: 'var(--space-6)',
          marginBottom: 'var(--space-6)',
          border: isDragActive ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
          background: isDragActive ? '#EFF6FF' : 'var(--color-surface)',
          transition: 'all 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0 }}>Documents to Print</h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                PDF, JPG, PNG supported (up to 50MB per file)
              </p>
            </div>

            {/* High-visibility Button */}
            <button
              type="button"
              id="select-docs-btn"
              className="btn btn-primary"
              style={{ gap: 8, boxShadow: 'var(--shadow-primary)' }}
              onClick={openFilePicker}
            >
              <Plus size={18} /> + SELECT DOCUMENTS
            </button>
          </div>

          {/* Files List or Empty State */}
          {files.length === 0 ? (
            <div
              style={{
                border: '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-10)',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--color-surface-2)'
              }}
              onClick={openFilePicker}
            >
              <Printer size={44} style={{ margin: '0 auto var(--space-3)', color: 'var(--color-primary)', opacity: 0.7 }} />
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                Drag & drop your files here, or click to browse
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Aadhaar card, Resume, College notes, Boarding pass, Photos...
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {files.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    {file.type.includes('pdf') ? (
                      <FileText size={24} color="#EF4444" style={{ flexShrink: 0 }} />
                    ) : (
                      <ImageIcon size={24} color="#3B82F6" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => removeFile(idx)}
                    title="Remove file"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={openFilePicker}
                  style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                >
                  <Plus size={16} /> Add More Files
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Print Configuration Grid */}
        <div className="customer-config-grid">
          {/* Color Option */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Color Mode
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className={`btn ${colorMode === 'BW' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px 8px', fontSize: 'var(--font-size-sm)' }}
                onClick={() => setColorMode('BW')}
              >
                Black & White (₹{shop?.pricing?.bwPerPage || 1})
              </button>
              <button
                type="button"
                className={`btn ${colorMode === 'COLOR' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px 8px', fontSize: 'var(--font-size-sm)' }}
                onClick={() => setColorMode('COLOR')}
              >
                Colour (₹{shop?.pricing?.colorPerPage || 5})
              </button>
            </div>
          </div>

          {/* Copies Stepper */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Number of Copies
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 44, height: 44, fontSize: '1.2rem', padding: 0 }}
                onClick={() => setCopies(Math.max(1, copies - 1))}
              >
                -
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 'var(--font-size-xl)', color: 'var(--color-text)' }}>
                {copies}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 44, height: 44, fontSize: '1.2rem', padding: 0 }}
                onClick={() => setCopies(copies + 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Paper Size & Sides */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Paper & Sides
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
              >
                <option value="A4">A4 (Standard)</option>
                <option value="A3">A3</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
              <button
                type="button"
                className={`btn ${duplex ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 'var(--font-size-xs)', padding: '0 12px' }}
                onClick={() => setDuplex(!duplex)}
              >
                {duplex ? 'Double Sided' : 'Single Sided'}
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Summary & Send Action Card */}
        <div className="card" style={{
          padding: 'var(--space-6)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-lg)',
          borderTop: '3px solid var(--color-primary)'
        }}>
          <div className="customer-send-card">
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Estimated Total Amount
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 'var(--font-size-4xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                  ₹{estimatedTotal}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  ({totalFiles} file{totalFiles !== 1 ? 's' : ''} × {copies} cop{copies > 1 ? 'ies' : 'y'})
                </span>
              </div>
            </div>

            {/* Big PhonePe-style Action Button */}
            <button
              type="button"
              id="send-for-print-btn"
              className="btn btn-primary btn-lg customer-send-btn"
              disabled={files.length === 0 || sending}
              onClick={handleSendForPrint}
            >
              {sending ? (
                <>
                  <div className="spinner" />
                  <span>{sendProgress || 'Sending...'}</span>
                </>
              ) : (
                <>
                  <Send size={20} />
                  <span>SEND FOR PRINT</span>
                </>
              )}
            </button>
          </div>

          {/* Privacy Security Note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
            <Shield size={14} color="var(--color-verified)" />
            <span>Encrypted transmission. Your documents will be permanently purged once printed.</span>
          </div>
        </div>
      </main>
    </div>
  )
}

export default CustomerShopFlow
