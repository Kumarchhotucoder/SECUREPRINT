import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import {
  Shield, CheckCircle, Upload, FileText, Image as ImageIcon, X,
  Printer, AlertCircle, Clock, File, Plus, ArrowRight, Sparkles, Check, ChevronDown
} from 'lucide-react'
import api from '../../lib/api'

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ScanPage = () => {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const shopId = searchParams.get('shop')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Session & shop state
  const [session, setSession] = useState(null)
  const [sessionToken, setSessionToken] = useState(null)
  const [shop, setShop] = useState(null)

  // Files selected by customer
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState('')

  // Print settings
  const [colorMode, setColorMode] = useState('BW') // 'BW' | 'COLOR'
  const [copies, setCopies] = useState(1)
  const [paperSize, setPaperSize] = useState('A4')
  const [duplex, setDuplex] = useState(false)

  const fileInputRef = useRef(null)

  // ── Auto-initialize session from QR token ───────────────────
  useEffect(() => {
    if (!token || !shopId) {
      setError('Invalid QR code link. Please scan the shop counter QR code again.')
      setLoading(false)
      return
    }

    const initSession = async () => {
      try {
        const res = await api.post('/sessions', { qrToken: token, shopId })
        const { sessionId, sessionToken: sToken, shop: shopData } = res.data.data
        setSession({ id: sessionId })
        setSessionToken(sToken)
        setShop(shopData)
        setLoading(false)
      } catch (err) {
        setError(err.response?.data?.message || 'Could not connect to shop counter. Please scan again.')
        setLoading(false)
      }
    }

    initSession()
  }, [token, shopId])

  // ── Dropzone & File Pickers ─────────────────────────────────
  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length > 0) {
      rejected.forEach(({ errors }) => {
        toast.error(errors[0]?.message || 'File rejected')
      })
    }
    if (accepted.length > 0) {
      setFiles(prev => [...prev, ...accepted])
      toast.success(`${accepted.length} file${accepted.length > 1 ? 's' : ''} added`)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    maxSize: 50 * 1024 * 1024,
    multiple: true
  })

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Calculations ───────────────────────────────────────────
  const totalFiles = files.length
  // Estimate page count: 1 per file initially, will be accurately counted on server
  const estimatedPages = Math.max(1, totalFiles)
  const ratePerPage = colorMode === 'COLOR' ? (shop?.pricing?.colorPerPage || 5) : (shop?.pricing?.bwPerPage || 1)
  const estimatedTotal = Math.ceil(estimatedPages * ratePerPage * copies)

  // ── Single-Click Send (PhonePe Style) ───────────────────────
  const handleSendToMerchant = async () => {
    if (files.length === 0) {
      toast.error('Please select at least 1 PDF or Photo to send!')
      return
    }
    if (!session?.id || !sessionToken) {
      toast.error('Session expired. Please scan QR again.')
      return
    }

    setSending(true)
    setSendProgress('Encrypting & uploading documents...')

    try {
      // 1. Upload files directly to session
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))

      const uploadRes = await api.post(`/documents/sessions/${session.id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Session-Token': sessionToken
        }
      })

      const uploadedDocs = uploadRes.data.data
      setSendProgress('Sending to merchant queue...')

      // 2. Submit print job in one click
      const jobRes = await api.post('/jobs', {
        sessionId: session.id,
        colorMode,
        copies,
        paperSize,
        duplex,
        pagesPerSheet: 1
      }, {
        headers: { 'X-Session-Token': sessionToken }
      })

      const jobData = jobRes.data.data
      toast.success(`🎉 Sent to ${shop?.name || 'Counter'}!`)

      // 3. Immediately redirect to live tracking
      navigate(`/status/${jobData.jobId}?token=${sessionToken}&session=${session.id}`, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send documents. Please try again.')
      setSending(false)
      setSendProgress('')
    }
  }

  // ── Loading & Error States ─────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0F172A',
        color: 'white',
        gap: 'var(--space-4)'
      }}>
        <div className="spinner" style={{ width: 44, height: 44, borderColor: 'white', borderTopColor: 'transparent' }} />
        <p style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', letterSpacing: '0.02em' }}>
          Connecting to Merchant Counter...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        background: 'var(--color-bg)'
      }}>
        <div className="card" style={{ maxWidth: 400, textAlign: 'center', padding: 'var(--space-8)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)'
          }}>
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}>Scan Failed</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
            {error}
          </p>
          <button className="btn btn-primary w-full" onClick={() => navigate('/')}>
            Scan Counter QR Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      paddingBottom: 110 /* space for bottom PhonePe send bar */
    }}>
      {/* ── Merchant Header Banner (PhonePe Style) ─────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
        color: 'white',
        padding: 'var(--space-5) var(--space-4) var(--space-8)',
        boxShadow: '0 4px 20px -2px rgba(29, 78, 216, 0.3)'
      }}>
        <div className="container" style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.9, fontSize: 'var(--font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Shield size={14} /> SecurePrint Verified Counter
            </div>
            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999 }}>
              Auto-delete enabled
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'white',
              color: '#1D4ED8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 22,
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
              flexShrink: 0
            }}>
              {shop?.name?.charAt(0) || 'P'}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.8 }}>Sending Documents To:</div>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                {shop?.name}
                <CheckCircle size={18} color="#4ADE80" fill="#4ADE80" stroke="#1E3A8A" />
              </h1>
              <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.85, marginTop: 2 }}>
                {shop?.address?.city || 'Pune'}, {shop?.address?.state || 'Maharashtra'} • Rates: ₹{shop?.pricing?.bwPerPage ?? 1} B&W / ₹{shop?.pricing?.colorPerPage ?? 5} Colour
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Upload & Print Card ─────────────────────────── */}
      <div className="container" style={{ maxWidth: 520, margin: '-24px auto 0', padding: '0 var(--space-4)' }}>
        <div className="card" style={{
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)'
        }}>

          {/* Section 1: Document Upload */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text)' }}>
                1. Select Documents to Print
              </span>
              {files.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#DC2626', fontSize: 'var(--font-size-xs)', padding: '2px 6px' }}
                  onClick={() => setFiles([])}
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Dropzone Box */}
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? '#2563EB' : files.length > 0 ? 'var(--color-border)' : '#3B82F6'}`,
                background: isDragActive ? '#EFF6FF' : files.length > 0 ? 'var(--color-surface-2)' : '#F0F7FF',
                borderRadius: 'var(--radius-lg)',
                padding: files.length > 0 ? 'var(--space-3)' : 'var(--space-6)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input {...getInputProps()} />

              {files.length === 0 ? (
                <div>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: '#DBEAFE', color: '#2563EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto var(--space-3)'
                  }}>
                    <Upload size={24} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: '#1E293B', marginBottom: 4 }}>
                    Tap to Choose PDF or Photos
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Select Aadhaar, Resume, Notes, Bills, Images (up to 50MB)
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#2563EB', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                  <Plus size={18} /> Add More Files (PDF or Image)
                </div>
              )}
            </div>

            {/* Selected Files List */}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                {files.map((file, idx) => {
                  const isPdf = file.type === 'application/pdf'
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-2) var(--space-3)',
                        background: 'white',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                          background: isPdf ? '#FEE2E2' : '#DCFCE7',
                          color: isPdf ? '#DC2626' : '#16A34A',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {isPdf ? <FileText size={18} /> : <ImageIcon size={18} />}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{
                            fontWeight: 600,
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {file.name}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                            {formatBytes(file.size)} • Ready to send
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--color-text-muted)',
                          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center'
                        }}
                        aria-label="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="divider" style={{ margin: 'var(--space-4) 0' }} />

          {/* Section 2: Print Settings (Compact & Fast) */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: 'var(--space-3)' }}>
              2. Print Options
            </span>

            {/* B&W vs Colour */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <button
                type="button"
                onClick={() => setColorMode('BW')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${colorMode === 'BW' ? '#2563EB' : 'var(--color-border)'}`,
                  background: colorMode === 'BW' ? '#EFF6FF' : 'white',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  color: colorMode === 'BW' ? '#1D4ED8' : 'var(--color-text)',
                  cursor: 'pointer'
                }}
              >
                <span>⬛ Black & White</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>₹{shop?.pricing?.bwPerPage ?? 1}</span>
              </button>

              <button
                type="button"
                onClick={() => setColorMode('COLOR')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${colorMode === 'COLOR' ? '#2563EB' : 'var(--color-border)'}`,
                  background: colorMode === 'COLOR' ? '#EFF6FF' : 'white',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  color: colorMode === 'COLOR' ? '#1D4ED8' : 'var(--color-text)',
                  cursor: 'pointer'
                }}
              >
                <span>🎨 Colour</span>
                <span style={{ fontSize: '0.7rem', color: '#059669' }}>₹{shop?.pricing?.colorPerPage ?? 5}</span>
              </button>
            </div>

            {/* Copies & Sides */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {/* Copies Counter */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)'
              }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' }}>Copies:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setCopies(c => Math.max(1, c - 1))}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: 'white', border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 800 }}
                  >
                    -
                  </button>
                  <span style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', minWidth: 16, textAlign: 'center' }}>{copies}</span>
                  <button
                    type="button"
                    onClick={() => setCopies(c => Math.min(50, c + 1))}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: 'white', border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 800 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Sides Switch */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)'
              }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' }}>Sides:</span>
                <button
                  type="button"
                  onClick={() => setDuplex(d => !d)}
                  style={{
                    background: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 8px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {duplex ? 'Double-sided' : 'Single-sided'}
                </button>
              </div>
            </div>
          </div>

          {/* Privacy Note */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 'var(--space-3)',
            background: '#F8FAFC',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)'
          }}>
            <Shield size={14} color="#2563EB" style={{ flexShrink: 0 }} />
            <span>Files are encrypted & auto-deleted from shop storage once printed.</span>
          </div>

        </div>
      </div>

      {/* ── PhonePe-Style Sticky Bottom Bar ──────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        padding: 'var(--space-3) var(--space-4)',
        paddingBottom: 'max(var(--space-3), env(safe-area-inset-bottom))',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        zIndex: 100
      }}>
        <div className="container" style={{
          maxWidth: 520,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)'
        }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {totalFiles === 0 ? 'Select files above' : `${totalFiles} file${totalFiles > 1 ? 's' : ''} • ${colorMode === 'BW' ? 'B&W' : 'Colour'}`}
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'baseline', gap: 4 }}>
              ₹{files.length === 0 ? 0 : estimatedTotal}
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-muted)' }}>est.</span>
            </div>
          </div>

          <button
            id="instant-send-btn"
            type="button"
            className="btn btn-primary btn-lg"
            style={{
              flex: 1,
              maxWidth: 280,
              background: files.length === 0 || sending ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
              color: files.length === 0 ? 'var(--color-text-muted)' : 'white',
              boxShadow: files.length > 0 && !sending ? '0 4px 14px rgba(29, 78, 216, 0.4)' : 'none',
              cursor: files.length === 0 || sending ? 'not-allowed' : 'pointer',
              border: 'none',
              fontSize: 'var(--font-size-base)',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            onClick={handleSendToMerchant}
            disabled={files.length === 0 || sending}
          >
            {sending ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderColor: 'white', borderTopColor: 'transparent' }} />
                <span>{sendProgress || 'Sending...'}</span>
              </>
            ) : (
              <>
                <Printer size={18} />
                <span>Send & Print Now</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScanPage
