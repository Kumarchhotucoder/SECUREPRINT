import { useState, useEffect, useRef } from 'react'
import { Camera, X, AlertTriangle, RefreshCw, QrCode, Copy, Shield, Check } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import toast from 'react-hot-toast'

export default function CameraQrScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  shopUpiId,
  amount,
  onShowQrFallback
}) {
  // permissionState: 'PRE_PROMPT' | 'SCANNING' | 'DENIED' | 'UNAVAILABLE' | 'INSECURE'
  const [permissionState, setPermissionState] = useState('PRE_PROMPT')
  const [errorMessage, setErrorMessage] = useState('')
  const [copiedUpi, setCopiedUpi] = useState(false)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)
  const isStoppingRef = useRef(false)

  // Safe camera stream cleanup
  const stopCameraStream = async () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true

    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop().catch(() => {})
        }
        await html5QrCodeRef.current.clear().catch(() => {})
        html5QrCodeRef.current = null
      }
    } catch (e) {
      console.warn('[CameraScanner] Error stopping html5Qrcode:', e)
    }

    // Direct browser media track cleanup
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Any lingering tracks are automatically released when html5Qrcode stops
      }
    } catch (e) {}

    isStoppingRef.current = false
  }

  // Handle modal open / close lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream()
      setPermissionState('PRE_PROMPT')
      setErrorMessage('')
    } else {
      // Check if secure context
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const isHttps = window.location.protocol === 'https:'
      if (!isLocal && !isHttps) {
        setPermissionState('INSECURE')
      } else {
        setPermissionState('PRE_PROMPT')
      }
    }

    return () => {
      stopCameraStream()
    }
  }, [isOpen])

  // Start Scanner with environment / rear camera
  const startScanner = async () => {
    try {
      setPermissionState('SCANNING')
      setErrorMessage('')

      // Wait a tick for the DOM container #camera-qr-reader to be mounted
      await new Promise(r => setTimeout(r, 100))

      const container = document.getElementById('camera-qr-reader')
      if (!container) {
        setPermissionState('UNAVAILABLE')
        setErrorMessage('Scanner container not found in DOM.')
        return
      }

      // Check device mediaDevices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionState('UNAVAILABLE')
        setErrorMessage('Camera is not available on this device.')
        return
      }

      // Stop any existing instance
      await stopCameraStream()

      const qrScanner = new Html5Qrcode('camera-qr-reader')
      html5QrCodeRef.current = qrScanner

      const qrConfig = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0
      }

      await qrScanner.start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => {
          console.log('[CameraScanner] QR scanned successfully:', decodedText)
          stopCameraStream()
          if (onScanSuccess) {
            onScanSuccess(decodedText)
          }
        },
        () => {
          // Frame decode error (normal between frames, suppress noisy logging)
        }
      )
    } catch (err) {
      console.error('[CameraScanner] Camera error:', err)
      const errStr = (err?.message || String(err)).toLowerCase()

      if (errStr.includes('denied') || errStr.includes('notallowed') || err?.name === 'NotAllowedError') {
        setPermissionState('DENIED')
        setErrorMessage('Camera permission was denied.')
      } else if (errStr.includes('notfound') || err?.name === 'NotFoundError' || errStr.includes('device')) {
        setPermissionState('UNAVAILABLE')
        setErrorMessage('Camera is not available on this device.')
      } else {
        setPermissionState('DENIED')
        setErrorMessage('Camera permission was denied or device is busy.')
      }
    }
  }

  const handleCopyUpi = () => {
    if (!shopUpiId) return
    navigator.clipboard.writeText(shopUpiId)
    setCopiedUpi(true)
    toast.success('Shop UPI ID copied!')
    setTimeout(() => setCopiedUpi(false), 2500)
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 'var(--space-4)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-xl)',
        maxWidth: 420,
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        position: 'relative'
      }} className="animate-scaleIn">
        
        {/* Header */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          background: 'linear-gradient(135deg, #1A56DB 0%, #1E40AF 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={20} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>SCAN PAYMENT QR</span>
          </div>
          <button
            type="button"
            onClick={() => { stopCameraStream(); onClose(); }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>

          {/* STATE: PRE-PROMPT */}
          {permissionState === 'PRE_PROMPT' && (
            <div>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: '#EFF6FF',
                color: '#1A56DB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)'
              }}>
                <Camera size={36} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#0F172A' }}>
                Scan Shop Payment QR
              </h3>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
                Allow camera access to scan the shop's UPI QR.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontWeight: 700, fontSize: 15 }}
                  onClick={startScanner}
                >
                  <Camera size={18} /> Allow Camera
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%' }}
                  onClick={() => { stopCameraStream(); onClose(); onShowQrFallback && onShowQrFallback(); }}
                >
                  <QrCode size={16} /> Show Shop QR Instead
                </button>
              </div>
            </div>
          )}

          {/* STATE: SCANNING */}
          {permissionState === 'SCANNING' && (
            <div>
              <div style={{
                position: 'relative',
                width: 280,
                height: 280,
                margin: '0 auto var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: '#0F172A',
                border: '2px solid #3B82F6'
              }}>
                {/* HTML5 QR Code Mount Element */}
                <div id="camera-qr-reader" style={{ width: '100%', height: '100%' }} />

                {/* Animated Targeting Border */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 190,
                  height: 190,
                  border: '2px dashed #60A5FA',
                  borderRadius: 12,
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)'
                }} />
              </div>

              <p style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                Point your camera at the shop's UPI QR.
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { stopCameraStream(); onClose(); onShowQrFallback && onShowQrFallback(); }}
                >
                  <QrCode size={16} /> Show QR
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => { stopCameraStream(); onClose(); }}
                >
                  Close Scanner
                </button>
              </div>
            </div>
          )}

          {/* STATE: PERMISSION DENIED */}
          {permissionState === 'DENIED' && (
            <div>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)'
              }}>
                <AlertTriangle size={32} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#991B1B', marginBottom: 6 }}>
                Camera permission was denied.
              </h3>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4, marginBottom: 'var(--space-6)' }}>
                To scan with your camera, allow permission in your browser settings or choose a fallback below.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startScanner}
                  style={{ width: '100%' }}
                >
                  <RefreshCw size={16} /> Try Again
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { stopCameraStream(); onClose(); onShowQrFallback && onShowQrFallback(); }}
                  style={{ width: '100%' }}
                >
                  <QrCode size={16} /> Show Payment QR
                </button>

                {shopUpiId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleCopyUpi}
                    style={{ width: '100%' }}
                  >
                    {copiedUpi ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy UPI ID ({shopUpiId})</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STATE: CAMERA UNAVAILABLE */}
          {permissionState === 'UNAVAILABLE' && (
            <div>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)'
              }}>
                <Camera size={32} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>
                Camera is not available on this device.
              </h3>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4, marginBottom: 'var(--space-6)' }}>
                No compatible video input device was found. You can scan the shop's displayed QR or copy the UPI ID directly.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { stopCameraStream(); onClose(); onShowQrFallback && onShowQrFallback(); }}
                  style={{ width: '100%' }}
                >
                  <QrCode size={16} /> Show QR
                </button>

                {shopUpiId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCopyUpi}
                    style={{ width: '100%' }}
                  >
                    {copiedUpi ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy UPI ID</>}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { stopCameraStream(); onClose(); }}
                  style={{ width: '100%' }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STATE: INSECURE HTTP */}
          {permissionState === 'INSECURE' && (
            <div>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)'
              }}>
                <Shield size={32} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>
                HTTPS Required for Camera
              </h3>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4, marginBottom: 'var(--space-6)' }}>
                Modern browsers require a secure HTTPS connection to grant camera permission. Please use the on-screen QR code.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { stopCameraStream(); onClose(); onShowQrFallback && onShowQrFallback(); }}
                  style={{ width: '100%' }}
                >
                  <QrCode size={16} /> Show QR
                </button>

                {shopUpiId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCopyUpi}
                    style={{ width: '100%' }}
                  >
                    {copiedUpi ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy UPI ID</>}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
