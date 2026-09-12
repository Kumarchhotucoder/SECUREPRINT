import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, QrCode, Upload, CheckCircle, Clock, Trash2, ChevronRight, X, Camera, Image as ImageIcon, Sparkles } from 'lucide-react'
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode'
import toast from 'react-hot-toast'
import api from '../../lib/api'

const LandingPage = () => {
  const navigate = useNavigate()
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const fileInputRef = useRef(null)

  // Direct 1-click launch to active demo shop
  const handleLaunchDemo = async () => {
    setLoadingDemo(true)
    try {
      const res = await api.get('/shops/public/demo')
      if (res.data?.data?.scanUrl) {
        toast.success(`Connected to ${res.data.data.shopName}!`)
        setShowScannerModal(false)
        navigate(res.data.data.scanUrl)
      } else {
        toast.error('No active shop counter found.')
      }
    } catch {
      toast.error('Could not connect to counter. Please try again.')
    } finally {
      setLoadingDemo(false)
    }
  }

  // Camera QR Scanner instance
  useEffect(() => {
    if (!showScannerModal) return

    let scanner = null
    try {
      scanner = new Html5QrcodeScanner("reader", {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        rememberLastUsedCamera: true,
        supportedScanTypes: []
      }, false)

      scanner.render(
        (decodedText) => {
          scanner.clear()
          setShowScannerModal(false)
          try {
            if (decodedText.includes('/scan/')) {
              const url = new URL(decodedText, window.location.origin)
              navigate(url.pathname + url.search)
            } else {
              toast.error('Not a valid SecurePrint shop QR code.')
            }
          } catch {
            if (decodedText.startsWith('/scan/')) {
              navigate(decodedText)
            } else {
              toast.error('Invalid QR code format.')
            }
          }
        },
        () => {}
      )
    } catch (err) {
      console.warn('Scanner init error:', err)
    }

    return () => {
      if (scanner) {
        try { scanner.clear() } catch {}
      }
    }
  }, [showScannerModal, navigate])

  // Scan from uploaded photo
  const handleScanFromImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const html5QrCode = new Html5Qrcode("reader-hidden")
      const decodedText = await html5QrCode.scanFile(file, true)
      setShowScannerModal(false)

      if (decodedText.includes('/scan/')) {
        const url = new URL(decodedText, window.location.origin)
        navigate(url.pathname + url.search)
      } else if (decodedText.startsWith('/scan/')) {
        navigate(decodedText)
      } else {
        toast.error('This image does not contain a valid SecurePrint QR code.')
      }
    } catch (err) {
      toast.error('No QR code detected in this photo.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Hidden file input for gallery QR upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleScanFromImage}
      />
      <div id="reader-hidden" style={{ display: 'none' }} />

      {/* Navbar */}
      <nav className="navbar">
        <div className="container-xl navbar-inner">
          <div className="navbar-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div className="brand-icon">
              <Shield size={20} />
            </div>
            SecurePrint
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div className="desktop-only" style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
              <a href="#how-it-works" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>How it Works</a>
              <a href="#features" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Features</a>
              <a href="/plans" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Pricing</a>
            </div>
            <a href="/shop/login" className="btn btn-ghost btn-sm">
              Shop Login
            </a>
            <a href="/shop/register" className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>
              Register Shop
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(180deg, #EFF6FF 0%, var(--color-bg) 100%)',
        padding: 'var(--space-16) var(--space-4) var(--space-12)',
        textAlign: 'center'
      }}>
        <div className="container animate-fadeIn" style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Trust badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--color-verified-light)',
            color: 'var(--color-verified)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 16px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 700,
            marginBottom: 'var(--space-4)'
          }}>
            <Sparkles size={16} />
            Print documents without WhatsApp
          </div>

          <h1 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text)', fontSize: 'var(--font-size-4xl)', lineHeight: 1.15 }}>
            Scan Shop QR.<br />
            <span style={{ color: 'var(--color-primary)' }}>Send PDF or Photos Instantly.</span>
          </h1>

          {/* SaaS Core Process Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#F1F5F9',
            border: '1px solid #CBD5E1',
            borderRadius: 'var(--radius-full)',
            padding: '6px 18px',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 800,
            letterSpacing: '0.05em',
            color: '#334155',
            marginBottom: 'var(--space-6)'
          }}>
            <span>SCAN</span> → <span>UPLOAD</span> → <span>SEND</span> → <span>PRINT</span> → <span>PAY</span>
          </div>

          <p style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-text-secondary)',
            maxWidth: 500,
            margin: '0 auto var(--space-8)',
            lineHeight: 1.6
          }}>
            No saving numbers. No WhatsApp. Scan the counter QR code, pick your files, and your print job reaches the merchant in seconds. Files automatically deleted post-payment.
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 360, margin: '0 auto' }}>
            <button
              id="scan-qr-btn"
              className="btn btn-primary btn-lg"
              style={{
                background: 'linear-gradient(135deg, #1A56DB 0%, #1246B5 100%)',
                fontSize: 'var(--font-size-base)',
                fontWeight: 800,
                boxShadow: 'var(--shadow-primary)',
                padding: '14px var(--space-6)'
              }}
              onClick={() => setShowScannerModal(true)}
            >
              <QrCode size={22} />
              Scan Shop QR to Send Files
            </button>

            <button
              id="shop-register-hero-btn"
              className="btn btn-secondary"
              onClick={() => navigate('/shop/register')}
            >
              🏪 Register Your Printing Shop
              <ChevronRight size={18} />
            </button>
          </div>

          <p style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-5)'
          }}>
            Files auto-deleted from shop storage 10s after payment • Zero permanent document storage
          </p>
        </div>
      </section>

      {/* ── PHONEPE-STYLE QR SCANNER MODAL ───────────────────── */}
      {showScannerModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)'
        }}>
          <div className="card animate-slideUp" style={{
            maxWidth: 420,
            width: '100%',
            background: 'white',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            padding: 0
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#1E293B',
              color: 'white',
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={18} color="#60A5FA" />
                <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Scan Shop Counter QR</span>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                style={{ color: 'white' }}
                onClick={() => setShowScannerModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Camera Viewfinder */}
            <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              <div
                id="reader"
                style={{
                  width: '100%',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  background: '#0F172A',
                  minHeight: 250
                }}
              />

              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
                Point your camera at the SecurePrint QR code displayed at the printing shop counter.
              </p>

              <div className="divider" style={{ margin: 'var(--space-4) 0' }} />

              {/* Alternative scan options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  <ImageIcon size={16} /> Upload QR Screenshot from Gallery
                </button>

                <button
                  type="button"
                  className="btn btn-primary w-full"
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    border: 'none',
                    fontSize: 'var(--font-size-sm)'
                  }}
                  onClick={handleLaunchDemo}
                  disabled={loadingDemo}
                >
                  {loadingDemo ? (
                    <><div className="spinner" /> Connecting...</>
                  ) : (
                    <><Sparkles size={16} /> Quick Test: Send to ABC Digital Center</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <section style={{ padding: 'var(--space-16) var(--space-4)' }}>
        <div className="container-lg">
          <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-3xl)' }}>
            How it works
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-12)', fontSize: 'var(--font-size-lg)' }}>
            Four simple steps. Just like sending money on PhonePe, but for printing.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-6)'
          }}>
            {[
              { icon: <QrCode size={28} />, step: '01', title: 'Scan Counter QR', desc: 'Scan the SecurePrint counter QR with your phone camera or our scanner.', color: '#EFF6FF', iconColor: 'var(--color-primary)' },
              { icon: <Upload size={28} />, step: '02', title: 'Pick PDF / Photo', desc: 'Select Aadhaar, bills, resumes, or photos directly from your device.', color: '#F0FDF4', iconColor: 'var(--color-verified)' },
              { icon: <Shield size={28} />, step: '03', title: 'One-Tap Send', desc: 'Pick B&W or Colour, tap Send. Document instantly hits the shop queue.', color: '#FFF7ED', iconColor: '#D97706' },
              { icon: <Trash2 size={28} />, step: '04', title: 'Auto-Deleted', desc: 'Once printed by the shop, files are wiped from storage permanently.', color: '#FDF4FF', iconColor: '#9333EA' }
            ].map((item, i) => (
              <div key={i} className="card animate-slideUp" style={{ animationDelay: `${i * 0.1}s` }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: item.color,
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: item.iconColor,
                  marginBottom: 'var(--space-4)'
                }}>
                  {item.icon}
                </div>
                <div style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.1em',
                  marginBottom: 'var(--space-2)'
                }}>
                  STEP {item.step}
                </div>
                <h3 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}>{item.title}</h3>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: 'var(--space-8) var(--space-4)',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <div style={{
            width: 28,
            height: 28,
            background: 'var(--color-primary)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <Shield size={16} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)' }}>SecurePrint</span>
        </div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Scan. Send. Print. Gone. — Privacy-first document printing for India
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
          © 2026 SecurePrint. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

export default LandingPage
