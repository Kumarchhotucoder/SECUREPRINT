import { useState, useEffect } from 'react'
import {
  PrinterIcon, X, Check, Play, AlertCircle, RefreshCw,
  Usb, Wifi, Globe, ExternalLink, ShieldCheck, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

export default function SmartPrintModal({ job, onClose, onJobUpdated, socket }) {
  const [printers, setPrinters] = useState([])
  const [loadingPrinters, setLoadingPrinters] = useState(true)
  const [isAgentOnline, setIsAgentOnline] = useState(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState('')
  const [colorMode, setColorMode] = useState(job.colorMode || 'BW')
  const [copies, setCopies] = useState(job.copies || 1)
  const [paperSize, setPaperSize] = useState(job.paperSize || 'A4')
  const [duplex, setDuplex] = useState(Boolean(job.duplex))

  const [printingStatus, setPrintingStatus] = useState(null) // null | 'SENDING' | 'DOWNLOADING' | 'SUBMITTED' | 'PRINT_COMPLETED' | 'FAILED'
  const [statusMessage, setStatusMessage] = useState('')
  const [popupBlockedUrl, setPopupBlockedUrl] = useState(null)

  const isDeleted = Boolean(job.filesDeleted || job.deletedAt)

  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        setLoadingPrinters(true)
        const res = await api.get('/printers')
        if (res.data?.success) {
          const list = res.data.data.printers || []
          const agentOnline = Boolean(res.data.data.isAgentOnline)
          setPrinters(list)
          setIsAgentOnline(agentOnline)

          // Preselect default or first ready printer
          const def = list.find(p => p.isDefault) || list.find(p => p.status === 'READY') || list[0]
          if (def) {
            setSelectedPrinterId(def.printerId)
            // Adjust color mode if printer is B&W only
            if (!def.isColorCapable && colorMode === 'COLOR') {
              setColorMode('BW')
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch printers:', err)
      } finally {
        setLoadingPrinters(false)
      }
    }
    fetchPrinters()
  }, [])

  const selectedPrinter = printers.find(p => p.printerId === selectedPrinterId)

  // Auto-switch color mode if selected printer doesn't support color
  const handleSelectPrinter = (id) => {
    setSelectedPrinterId(id)
    const p = printers.find(item => item.printerId === id)
    if (p && !p.isColorCapable && colorMode === 'COLOR') {
      setColorMode('BW')
      toast('Switched to Black & White (Printer is B&W only)', { icon: 'ℹ️' })
    }
  }

  // Socket listener for real-time attempt progress
  useEffect(() => {
    if (!socket) return

    const handlePrintProgress = (data) => {
      if (data.jobId === job._id) {
        setPrintingStatus(data.status)
        if (data.status === 'DOWNLOADING') {
          setStatusMessage('Agent downloading document securely...')
        } else if (data.status === 'SUBMITTED') {
          setStatusMessage('Document spooled to physical printer buffer...')
        } else if (data.status === 'PRINT_COMPLETED') {
          setStatusMessage('Print Completed successfully!')
          toast.success('Physical print completed by agent!')
          if (onJobUpdated) onJobUpdated(job._id, 'complete')
          setTimeout(() => {
            onClose()
          }, 1800)
        } else if (data.status === 'FAILED') {
          setStatusMessage(`Print failed: ${data.errorMessage || 'Unknown error'}`)
          toast.error('Print failed at agent')
        }
      }
    }

    socket.on('print-attempt-status', handlePrintProgress)
    return () => {
      socket.off('print-attempt-status', handlePrintProgress)
    }
  }, [socket, job._id, onJobUpdated, onClose])

  const handleSendToPhysicalPrinter = async () => {
    if (isDeleted) {
      toast.error('Document has already been deleted for privacy and cannot be printed again.')
      return
    }

    if (!isAgentOnline) {
      toast.error('SecurePrint Agent is offline. Please launch the agent on the shop computer.')
      return
    }

    if (!selectedPrinterId) {
      toast.error('Please select a hardware printer')
      return
    }

    try {
      setPrintingStatus('SENDING')
      setStatusMessage('Dispatching print job to shop computer...')

      const res = await api.post(`/printers/jobs/${job._id}/print`, {
        printerId: selectedPrinterId,
        options: {
          copies: parseInt(copies, 10) || 1,
          color: colorMode === 'COLOR',
          paperSize,
          duplex
        }
      })

      if (res.data?.success) {
        setStatusMessage('Print instruction sent to agent! Awaiting hardware spool...')
      }
    } catch (err) {
      setPrintingStatus('FAILED')
      const msg = err.response?.data?.message || 'Failed to dispatch print job'
      setStatusMessage(msg)
      toast.error(msg)
    }
  }

  const handleManualFallback = async () => {
    if (isDeleted) {
      toast.error('Document has already been deleted for privacy and cannot be printed again.')
      return
    }

    try {
      // Mark as printing in SaaS (non-fatal if already transitioning)
      try {
        await api.post(`/jobs/${job._id}/print`)
        if (onJobUpdated) onJobUpdated(job._id, 'print')
      } catch (err) {
        // Continue to preview even if status was already updated
        console.warn('Job status update notice:', err.response?.data?.message)
      }

      // Include auth token query parameter so browser preview tab can authenticate reliably
      const token = localStorage.getItem('secureprint_token') || ''
      const previewUrl = `/api/jobs/${job._id}/preview?token=${encodeURIComponent(token)}`

      // Attempt to open preview window
      const win = window.open(previewUrl, '_blank')
      if (!win || win.closed || typeof win.closed === 'undefined') {
        setPopupBlockedUrl(previewUrl)
        toast('Popup blocked by browser. Click "Open Print Preview" below.', { icon: '⚠️' })
      } else {
        toast.success('Document opened in preview. Press Ctrl+P or Cmd+P to print.')
        setPopupBlockedUrl(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to open preview for manual printing')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, padding: 'var(--space-6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <PrinterIcon size={20} color="var(--color-primary)" />
              Smart Print Dialog
            </h3>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Job #{job.jobNumber} • {job.customerName || 'Customer'}
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Real-time status progress banner if in progress */}
        {printingStatus && (
          <div style={{
            background: printingStatus === 'FAILED' ? '#FEF2F2' : printingStatus === 'PRINT_COMPLETED' ? '#ECFDF5' : '#EFF6FF',
            border: `1px solid ${printingStatus === 'FAILED' ? '#F87171' : printingStatus === 'PRINT_COMPLETED' ? '#34D399' : '#60A5FA'}`,
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            {printingStatus === 'PRINT_COMPLETED' ? (
              <Check size={20} color="#059669" />
            ) : printingStatus === 'FAILED' ? (
              <AlertCircle size={20} color="#DC2626" />
            ) : (
              <RefreshCw size={18} color="var(--color-primary)" className="spin" />
            )}
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: printingStatus === 'FAILED' ? '#DC2626' : printingStatus === 'PRINT_COMPLETED' ? '#059669' : 'var(--color-primary)' }}>
              {statusMessage}
            </div>
          </div>
        )}

        {/* Privacy Deletion Notice */}
        {isDeleted && (
          <div style={{
            background: '#FEF2F2',
            border: '1.5px solid #DC2626',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <AlertCircle size={22} color="#DC2626" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--font-size-sm)', color: '#991B1B', fontWeight: 600 }}>
              Document has already been deleted for privacy and cannot be printed again.
            </div>
          </div>
        )}

        {/* Step 1: Printer Selection */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
            Select Hardware Printer
          </label>
          
          {loadingPrinters ? (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 'var(--font-size-xs)' }}>Loading printers...</div>
          ) : !isAgentOnline ? (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 'var(--font-size-xs)',
              color: '#991B1B'
            }}>
              ⚠️ <strong>SecurePrint Agent is Offline.</strong> Please launch the agent on the shop computer to enable automated physical printing, or use <b>Manual Browser Print</b> below.
            </div>
          ) : printers.length === 0 ? (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 'var(--font-size-xs)',
              color: '#92400E'
            }}>
              ⚠️ SecurePrint Agent is connected, but no physical printers were detected. Check your USB/Wi-Fi printer cable or driver.
            </div>
          ) : (
            <select
              value={selectedPrinterId}
              onChange={e => handleSelectPrinter(e.target.value)}
              disabled={isDeleted}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600
              }}
            >
              {printers.map(p => (
                <option key={p.printerId} value={p.printerId}>
                  {p.name} [{p.connectionType}] {p.isColorCapable ? '🎨 Color' : '⬛ B&W'} {p.status === 'READY' ? '● Ready' : `(${p.status})`}
                </option>
              ))}
            </select>
          )}

          {/* Color compatibility warning if B&W only */}
          {selectedPrinter && !selectedPrinter.isColorCapable && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.72rem',
              color: '#D97706',
              marginTop: 6,
              background: '#FFFBEB',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <AlertCircle size={14} /> Color printing unavailable on this printer. Prints in sharp Black & White.
            </div>
          )}

          {/* Printer offline warning */}
          {selectedPrinter && selectedPrinter.status === 'OFFLINE' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.72rem',
              color: '#DC2626',
              marginTop: 6,
              background: '#FEF2F2',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <AlertCircle size={14} /> Selected printer is currently OFFLINE. Check printer power and USB connection.
            </div>
          )}
        </div>

        {/* Step 2: Print Settings Form */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          background: 'var(--color-surface-2)',
          padding: 14,
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
          opacity: isDeleted ? 0.5 : 1,
          pointerEvents: isDeleted ? 'none' : 'auto'
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 4 }}>Color Mode</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${colorMode === 'BW' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.75rem' }}
                onClick={() => setColorMode('BW')}
              >
                Black & White
              </button>
              <button
                type="button"
                className={`btn btn-sm ${colorMode === 'COLOR' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.75rem' }}
                onClick={() => setColorMode('COLOR')}
                disabled={selectedPrinter && !selectedPrinter.isColorCapable}
              >
                Colour
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 4 }}>Number of Copies</label>
            <input
              type="number"
              min="1"
              max="99"
              value={copies}
              onChange={e => setCopies(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 'var(--font-size-sm)'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 4 }}>Paper Size</label>
            <select
              value={paperSize}
              onChange={e => setPaperSize(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              <option value="A4">A4 (Standard)</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 4 }}>Duplex (Sides)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${!duplex ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.75rem' }}
                onClick={() => setDuplex(false)}
              >
                1-Sided
              </button>
              <button
                type="button"
                className={`btn btn-sm ${duplex ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: '0.75rem' }}
                onClick={() => setDuplex(true)}
              >
                2-Sided
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            id="confirm-physical-print-btn"
            className="btn btn-primary"
            style={{ fontWeight: 800, padding: '12px', justifyContent: 'center', gap: 8 }}
            onClick={handleSendToPhysicalPrinter}
            disabled={
              isDeleted ||
              !isAgentOnline ||
              !selectedPrinterId ||
              selectedPrinter?.status === 'OFFLINE' ||
              ['SENDING', 'DOWNLOADING', 'SUBMITTED'].includes(printingStatus)
            }
          >
            <PrinterIcon size={18} />
            {['SENDING', 'DOWNLOADING', 'SUBMITTED'].includes(printingStatus)
              ? 'Printing in Progress...'
              : isDeleted
                ? 'Document Deleted (Cannot Print)'
                : !isAgentOnline
                  ? 'Agent Offline (Cannot Physical Print)'
                  : 'SEND TO PHYSICAL PRINTER'}
          </button>

          {/* Popup Blocked Notification */}
          {popupBlockedUrl && (
            <div style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 'var(--radius-md)',
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: '#1E40AF' }}>Browser blocked the print popup:</span>
              <a
                href={popupBlockedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-primary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setPopupBlockedUrl(null)}
              >
                Open Print Preview ↗
              </a>
            </div>
          )}

          {/* Controlled Manual Fallback */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Agent offline or manual print needed?
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: 'var(--font-size-xs)',
                color: isDeleted ? 'var(--color-text-muted)' : 'var(--color-primary)',
                textDecoration: isDeleted ? 'none' : 'underline',
                cursor: isDeleted ? 'not-allowed' : 'pointer'
              }}
              onClick={handleManualFallback}
              disabled={isDeleted}
            >
              Manual Browser Print ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
