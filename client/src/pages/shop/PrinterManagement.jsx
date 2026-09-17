import { useState, useEffect, useCallback } from 'react'
import {
  Printer as PrinterIcon, Laptop, Wifi, Usb, Globe, CheckCircle2,
  AlertCircle, RefreshCw, Plus, Trash2, Play, Check, ShieldCheck,
  Copy, Clock, ExternalLink, Zap, HelpCircle, PowerOff, Settings2,
  Loader2, Radio
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

export default function PrinterManagement({ shop, socket, refreshTrigger }) {
  const [agents, setAgents] = useState([])
  const [connectedPrinters, setConnectedPrinters] = useState([])
  const [availablePrinters, setAvailablePrinters] = useState([])
  const [isAgentOnline, setIsAgentOnline] = useState(false)
  const [activeAgent, setActiveAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState(null)

  // Action states
  const [connectingId, setConnectingId] = useState(null)
  const [disconnectingId, setDisconnectingId] = useState(null)
  const [testPrintingId, setTestPrintingId] = useState(null)
  const [unpairingId, setUnpairingId] = useState(null)

  // Pairing Modal state
  const [pairingModalOpen, setPairingModalOpen] = useState(false)
  const [pairingData, setPairingData] = useState(null)
  const [timeLeft, setTimeLeft] = useState(600)
  const [generatingCode, setGeneratingCode] = useState(false)

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setScanning(true)
      else setLoading(true)

      const res = await api.get('/printers')
      if (res.data?.success) {
        const data = res.data.data
        setAgents(data.agents || [])
        setConnectedPrinters(data.connectedPrinters || data.printers || [])
        setAvailablePrinters(data.availablePrinters || [])
        setIsAgentOnline(Boolean(data.isAgentOnline))
        setActiveAgent(data.activeAgent || null)

        if (isManualRefresh) {
          const totalFound = (data.connectedPrinters?.length || 0) + (data.availablePrinters?.length || 0)
          setScanMessage(`${totalFound} printer${totalFound === 1 ? '' : 's'} detected on shop computer.`)
          setTimeout(() => setScanMessage(null), 6000)
        }
      }
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Failed to load printer status')
    } finally {
      setLoading(false)
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  // Real-time WebSocket Listeners
  useEffect(() => {
    if (!socket) return

    const handleAgentConnected = (data) => {
      setIsAgentOnline(true)
      setActiveAgent(data)
      toast.success(`Shop Computer "${data.computerName || data.agentId}" is now Connected!`)
      fetchData()
    }

    const handleAgentStatus = (data) => {
      setAgents(prev => prev.map(ag => ag.agentId === data.agentId ? { ...ag, status: data.status, lastSeenAt: new Date() } : ag))
      if (data.status === 'ONLINE') {
        setIsAgentOnline(true)
        toast.success(`Shop Computer is Online!`)
      } else {
        setIsAgentOnline(false)
      }
    }

    const handlePrintersUpdated = () => {
      fetchData()
    }

    const handlePrinterConnected = (data) => {
      toast.success(`Printer "${data.name}" is now Ready for printing!`)
      fetchData()
    }

    const handlePrinterDisconnected = (data) => {
      toast.info(`Printer "${data.name}" disconnected.`)
      fetchData()
    }

    const handlePrintAttemptUpdate = (data) => {
      if (data.status === 'SUBMITTED') {
        toast.success(`Job #${data.jobId.slice(-4)} spooled to physical printer!`)
      } else if (data.status === 'FAILED') {
        toast.error(`Print failed: ${data.errorMessage || 'Unknown hardware error'}`)
      }
    }

    socket.on('agent-connected', handleAgentConnected)
    socket.on('agent-status-changed', handleAgentStatus)
    socket.on('printers-updated', handlePrintersUpdated)
    socket.on('printer-connected', handlePrinterConnected)
    socket.on('printer-disconnected', handlePrinterDisconnected)
    socket.on('print-attempt-update', handlePrintAttemptUpdate)

    return () => {
      socket.off('agent-connected', handleAgentConnected)
      socket.off('agent-status-changed', handleAgentStatus)
      socket.off('printers-updated', handlePrintersUpdated)
      socket.off('printer-connected', handlePrinterConnected)
      socket.off('printer-disconnected', handlePrinterDisconnected)
      socket.off('print-attempt-update', handlePrintAttemptUpdate)
    }
  }, [socket, fetchData])

  // Timer for Pairing Code
  useEffect(() => {
    if (!pairingData || !pairingModalOpen) return
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(pairingData.expiresAt).getTime() - Date.now()) / 1000))
      setTimeLeft(diff)
      if (diff <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [pairingData, pairingModalOpen])

  // Trigger On-Demand Discovery
  const handleTriggerDiscovery = async () => {
    try {
      setScanning(true)
      toast.loading('Scanning USB, Wi-Fi, LAN and Windows printers...', { id: 'scan-printers' })
      await api.post('/printers/discover')
      setTimeout(() => {
        toast.dismiss('scan-printers')
        fetchData(true)
      }, 1500)
    } catch (err) {
      toast.dismiss('scan-printers')
      // Fallback: direct refresh
      fetchData(true)
    }
  }

  // Generate 6-Digit Pairing Code
  const handleGeneratePairingCode = async () => {
    try {
      setGeneratingCode(true)
      const res = await api.post('/printers/pairing-code')
      if (res.data?.success) {
        setPairingData(res.data.data)
        setPairingModalOpen(true)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate pairing code')
    } finally {
      setGeneratingCode(false)
    }
  }

  // Bluetooth-like [ CONNECT ]
  const handleConnectPrinter = async (printerId, printerName) => {
    try {
      setConnectingId(printerId)
      toast.loading(`Connecting & validating ${printerName}...`, { id: 'connect-prn' })
      const res = await api.post(`/printers/${printerId}/connect`)
      toast.dismiss('connect-prn')
      if (res.data?.success) {
        toast.success(`✓ ${printerName} connected and ready for prints!`)
        fetchData()
      }
    } catch (err) {
      toast.dismiss('connect-prn')
      toast.error(err.response?.data?.message || 'Failed to connect printer')
    } finally {
      setConnectingId(null)
    }
  }

  // [ DISCONNECT ]
  const handleDisconnectPrinter = async (printerId, printerName) => {
    if (!window.confirm(`Disconnect "${printerName}" from SecurePrint?\n\nNote: This will not uninstall the printer from Windows. It only removes it from your SecurePrint active printing list.`)) {
      return
    }

    try {
      setDisconnectingId(printerId)
      toast.loading(`Disconnecting ${printerName}...`, { id: 'disconnect-prn' })
      const res = await api.post(`/printers/${printerId}/disconnect`)
      toast.dismiss('disconnect-prn')
      if (res.data?.success) {
        toast.success(`Printer "${printerName}" disconnected.`)
        fetchData()
      }
    } catch (err) {
      toast.dismiss('disconnect-prn')
      toast.error(err.response?.data?.message || 'Failed to disconnect printer')
    } finally {
      setDisconnectingId(null)
    }
  }

  // [ UNPAIR COMPUTER ]
  const handleUnpairComputer = async (agentId, computerName) => {
    if (!window.confirm(`Unpair computer "${computerName || agentId}"?\n\nThis computer will no longer receive print jobs until you enter a new 6-digit pairing code.`)) {
      return
    }

    try {
      setUnpairingId(agentId)
      toast.loading(`Unpairing computer...`, { id: 'unpair-pc' })
      const res = await api.post(`/printers/agents/${agentId}/unpair`)
      toast.dismiss('unpair-pc')
      if (res.data?.success) {
        toast.success(`Computer "${computerName}" unpaired.`)
        fetchData()
      }
    } catch (err) {
      toast.dismiss('unpair-pc')
      toast.error(err.response?.data?.message || 'Failed to unpair computer')
    } finally {
      setUnpairingId(null)
    }
  }

  // [ TEST PRINT ]
  const handleTestPrint = async (printerId, printerName) => {
    try {
      setTestPrintingId(printerId)
      toast.loading(`Sending test page to "${printerName}"...`, { id: 'test-print' })
      const res = await api.post(`/printers/${printerId}/test-print`)
      toast.dismiss('test-print')
      if (res.data?.success) {
        toast.success(`✓ Test page sent to ${printerName}!`)
      }
    } catch (err) {
      toast.dismiss('test-print')
      toast.error(err.response?.data?.message || 'Test print failed')
    } finally {
      setTestPrintingId(null)
    }
  }

  // Set as Default
  const handleSetDefault = async (printerId) => {
    try {
      await api.patch(`/printers/${printerId}`, { isDefault: true })
      toast.success('Default printer updated')
      fetchData()
    } catch (err) {
      toast.error('Failed to set default printer')
    }
  }

  const handleCopyCode = () => {
    if (pairingData?.pairingCode) {
      navigator.clipboard.writeText(pairingData.pairingCode)
      toast.success('Pairing code copied to clipboard!')
    }
  }

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const getConnectionIcon = (type) => {
    switch (type) {
      case 'USB': return <Usb size={15} color="#0284C7" />
      case 'WIFI': return <Wifi size={15} color="#10B981" />
      case 'LAN': return <Globe size={15} color="#8B5CF6" />
      default: return <PrinterIcon size={15} color="#64748B" />
    }
  }

  const getStatusBadge = (status, isConnected = true) => {
    if (!isConnected) {
      return (
        <span className="badge" style={{ background: '#F1F5F9', color: '#64748B', fontWeight: 600, fontSize: '0.72rem' }}>
          ⚪ Available to Connect
        </span>
      )
    }

    switch (status) {
      case 'READY':
      case 'CONNECTED':
      case 'ONLINE':
        return (
          <span className="badge" style={{ background: '#ECFDF5', color: '#059669', fontWeight: 700, fontSize: '0.72rem' }}>
            🟢 Ready
          </span>
        )
      case 'PRINTING':
        return (
          <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: '0.72rem' }}>
            🔄 Printing...
          </span>
        )
      case 'PAPER_OUT':
        return (
          <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem' }}>
            ⚠️ Out of Paper
          </span>
        )
      case 'PAPER_JAM':
        return (
          <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem' }}>
            ⚠️ Paper Jam
          </span>
        )
      case 'LOW_TONER':
      case 'LOW_INK':
        return (
          <span className="badge" style={{ background: '#FFFBEB', color: '#D97706', fontWeight: 700, fontSize: '0.72rem' }}>
            ⚠️ Ink/Toner Low
          </span>
        )
      case 'OFFLINE':
      case 'DISCONNECTED':
        return (
          <span className="badge" style={{ background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem' }}>
            🔴 Offline
          </span>
        )
      default:
        return (
          <span className="badge" style={{ background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: '0.72rem' }}>
            ● {status || 'UNKNOWN'}
          </span>
        )
    }
  }

  return (
    <div className="animate-fadeIn" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      
      {/* ── HEADER BAR (Section 43) ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.04) 0%, rgba(2, 132, 199, 0.06) 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: 'var(--color-primary)',
                color: '#FFF',
                padding: 10,
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <PrinterIcon size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                  Printers & Desktop Agent
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '4px 0 0' }}>
                  Bridge between SecurePrint Cloud and your physical USB, Wi-Fi, and LAN printers.
                </p>
              </div>
            </div>

            {/* Agent Live Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="badge" style={{
                background: isAgentOnline ? '#ECFDF5' : '#FEF2F2',
                color: isAgentOnline ? '#059669' : '#DC2626',
                fontWeight: 800,
                fontSize: '0.78rem',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                {isAgentOnline ? '🟢 Print Agent Connected' : '🔴 Print Agent Offline'}
              </span>

              {activeAgent && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Laptop size={14} /> <strong>{activeAgent.computerName || 'Counter PC'}</strong>
                  {activeAgent.os && <span>({activeAgent.os})</span>}
                  <span>• {connectedPrinters.length} Connected Printer{connectedPrinters.length === 1 ? '' : 's'}</span>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleTriggerDiscovery}
              disabled={scanning || loading}
              style={{ fontWeight: 600, gap: 6 }}
            >
              <RefreshCw size={15} className={scanning ? 'spin' : ''} />
              {scanning ? 'Searching...' : 'Refresh'}
            </button>
            <button
              id="connect-computer-btn"
              className="btn btn-primary btn-sm"
              onClick={handleGeneratePairingCode}
              disabled={generatingCode}
              style={{ fontWeight: 700, gap: 6 }}
            >
              <Plus size={16} /> Add / Connect Computer
            </button>
          </div>
        </div>

        {/* Live Scanning Banner (Section 28) */}
        {scanning && (
          <div style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--font-size-sm)',
            color: '#1E40AF'
          }}>
            <Loader2 size={18} className="spin" />
            <div>
              <strong>Searching for printers...</strong>
              <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginTop: 2 }}>
                Checking: USB • Wi-Fi • LAN • Windows Printing Subsystem
              </div>
            </div>
          </div>
        )}

        {/* Scan Message / Toast notice */}
        {scanMessage && !scanning && (
          <div style={{
            marginTop: 14,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            fontSize: 'var(--font-size-xs)',
            color: '#166534',
            fontWeight: 600
          }}>
            ✓ {scanMessage}
          </div>
        )}
      </div>

      {/* ── SECTION 1: CONNECTED COMPUTERS (Section 30 & 43) ── */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Laptop size={18} color="var(--color-text-secondary)" />
            Connected Computers ({agents.length})
          </h3>
        </div>

        {agents.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', background: 'var(--color-surface-2)' }}>
            <Laptop size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 'var(--font-size-base)', marginBottom: 6 }}>No Computers Paired Yet</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', maxWidth: 460, margin: '0 auto 16px' }}>
              Install the <b>SecurePrint Desktop Agent</b> on your shop computer to enable automated physical printing to USB, Wi-Fi, and LAN printers.
            </p>
            <button className="btn btn-primary btn-sm" onClick={handleGeneratePairingCode} style={{ margin: '0 auto', gap: 6 }}>
              <Plus size={16} /> Generate 6-Digit Pairing Code
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
            {agents.map(ag => {
              const isOnline = ag.status === 'ONLINE' && (Date.now() - new Date(ag.lastSeenAt || 0).getTime() < 3 * 60 * 1000)
              return (
                <div key={ag.agentId} className="card" style={{
                  padding: 'var(--space-4)',
                  borderLeft: isOnline ? '4px solid #10B981' : '4px solid #EF4444',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                          {ag.computerName || 'Shop Counter PC'}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          ID: {ag.agentId}
                        </div>
                      </div>
                      <span className="badge" style={{
                        background: isOnline ? '#ECFDF5' : '#FEF2F2',
                        color: isOnline ? '#059669' : '#DC2626',
                        fontWeight: 700,
                        fontSize: '0.72rem'
                      }}>
                        {isOnline ? '🟢 Online' : '🔴 Offline'}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4, margin: '10px 0' }}>
                      <div>OS: <strong>{ag.os || 'Windows 11'}</strong></div>
                      <div>Agent: <strong>v{ag.appVersion || '1.0.0'}</strong></div>
                      <div>Printers: <strong>{ag.printerCount !== undefined ? ag.printerCount : '—'}</strong></div>
                      <div>Last Seen: <strong>{ag.lastSeenAt ? new Date(ag.lastSeenAt).toLocaleTimeString() : 'Never'}</strong></div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleUnpairComputer(ag.agentId, ag.computerName)}
                      disabled={unpairingId === ag.agentId}
                      style={{ color: '#DC2626', fontSize: '0.72rem', gap: 4 }}
                    >
                      <PowerOff size={13} /> {unpairingId === ag.agentId ? 'Unpairing...' : 'Unpair Computer'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 2: AVAILABLE PRINTERS (Bluetooth-like Discovery) (Section 9, 10, 11, 28) ── */}
      {availablePrinters.length > 0 && (
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0369A1' }}>
                <Radio size={18} color="#0284C7" />
                Available Printers ({availablePrinters.length})
              </h3>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                Discovered on your shop computer. Click <b>Connect</b> to make them ready for SecurePrint.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {availablePrinters.map(p => {
              const isConnecting = connectingId === p.printerId
              return (
                <div key={p.printerId} className="card" style={{
                  padding: 'var(--space-4)',
                  border: '1.5px dashed #38BDF8',
                  background: '#F0F9FF',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          background: '#E0F2FE',
                          padding: 8,
                          borderRadius: 'var(--radius-md)',
                          color: '#0284C7'
                        }}>
                          <PrinterIcon size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: '#0F172A' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: '#64748B' }}>
                            {p.systemPrinterName}
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(p.status, false)}
                    </div>

                    {/* Capability pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                      <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#FFF', fontSize: '0.72rem' }}>
                        {getConnectionIcon(p.connectionType)} {p.connectionType}
                      </span>
                      <span className="badge" style={{
                        background: p.isColorCapable ? '#FAF5FF' : '#F1F5F9',
                        color: p.isColorCapable ? '#7E22CE' : '#475569',
                        fontSize: '0.72rem'
                      }}>
                        {p.isColorCapable ? '🎨 Color' : '⬛ B&W'}
                      </span>
                      {p.supportsDuplex && (
                        <span className="badge" style={{ background: '#FFF', fontSize: '0.72rem' }}>
                          📄 2-Sided
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Connect Button */}
                  <div style={{ marginTop: 12, borderTop: '1px solid #BAE6FD', paddingTop: 10 }}>
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => handleConnectPrinter(p.printerId, p.name)}
                      disabled={isConnecting}
                      style={{
                        justifyContent: 'center',
                        fontWeight: 700,
                        background: '#0284C7',
                        borderColor: '#0284C7',
                        gap: 6
                      }}
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 size={16} className="spin" /> Connecting...
                        </>
                      ) : (
                        <>
                          <Zap size={15} /> CONNECT / REGISTER
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 3: CONNECTED PRINTERS (Active for Printing) (Section 12, 14, 43) ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <PrinterIcon size={18} color="var(--color-primary)" />
            Connected Printers ({connectedPrinters.length})
          </h3>
        </div>

        {connectedPrinters.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', background: 'var(--color-surface-2)' }}>
            <PrinterIcon size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 'var(--font-size-base)', marginBottom: 6 }}>No Connected Printers</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', maxWidth: 480, margin: '0 auto 14px' }}>
              {availablePrinters.length > 0 ? (
                'You have discovered printers above! Click [ CONNECT ] on any printer to make it ready for SecurePrint customer prints.'
              ) : (
                'Check that your physical printer is powered on, USB cable or Wi-Fi connected to your shop computer, and drivers are installed in Windows.'
              )}
            </p>

            <div style={{
              background: '#FFF',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              maxWidth: 420,
              margin: '0 auto 16px',
              textAlign: 'left',
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1.6
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>Diagnostic Checklist:</div>
              <div>✓ Printer is connected via USB cable or Shop Wi-Fi</div>
              <div>✓ Printer is turned ON and shows green power light</div>
              <div>✓ Windows Print Spooler service is running</div>
              <div>✓ SecurePrint Agent is running on your shop computer</div>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={handleTriggerDiscovery} disabled={scanning} style={{ margin: '0 auto', gap: 6 }}>
              <RefreshCw size={14} className={scanning ? 'spin' : ''} /> Scan Again
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {connectedPrinters.map(p => {
              const isDefault = p.isDefault
              const isTestPrinting = testPrintingId === p.printerId
              const isDisconnecting = disconnectingId === p.printerId

              return (
                <div key={p.printerId} className="card" style={{
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: isDefault ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  boxShadow: isDefault ? '0 4px 12px rgba(37, 99, 235, 0.08)' : 'none'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          background: 'var(--color-surface-2)',
                          padding: 8,
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--color-primary)'
                        }}>
                          <PrinterIcon size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            {p.systemPrinterName}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {getStatusBadge(p.status, true)}
                        {isDefault && (
                          <span className="badge" style={{ background: '#EFF6FF', color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.68rem' }}>
                            ★ DEFAULT
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Printer Capability Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                      <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface-2)', fontSize: '0.72rem' }}>
                        {getConnectionIcon(p.connectionType)} {p.connectionType}
                      </span>
                      <span className="badge" style={{
                        background: p.isColorCapable ? '#FAF5FF' : '#F1F5F9',
                        color: p.isColorCapable ? '#7E22CE' : '#475569',
                        fontSize: '0.72rem'
                      }}>
                        {p.isColorCapable ? '🎨 Color + B&W' : '⬛ Black & White'}
                      </span>
                      {p.supportsDuplex && (
                        <span className="badge" style={{ background: 'var(--color-surface-2)', fontSize: '0.72rem' }}>
                          📄 2-Sided
                        </span>
                      )}
                      {p.paperSizes && p.paperSizes.length > 0 && (
                        <span className="badge" style={{ background: 'var(--color-surface-2)', fontSize: '0.72rem' }}>
                          📐 {p.paperSizes.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions (Section 12 & 43) */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 14,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 12
                  }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, fontSize: '0.75rem', gap: 4, justifyContent: 'center' }}
                      onClick={() => handleTestPrint(p.printerId, p.name)}
                      disabled={isTestPrinting}
                    >
                      <Play size={13} /> {isTestPrinting ? 'Submitting...' : 'Test Print'}
                    </button>

                    {!isDefault && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                        onClick={() => handleSetDefault(p.printerId)}
                      >
                        Set Default
                      </button>
                    )}

                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.75rem', color: '#DC2626', gap: 4 }}
                      onClick={() => handleDisconnectPrinter(p.printerId, p.name)}
                      disabled={isDisconnecting}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── PAIRING MODAL (Section 2 & 35) ── */}
      {pairingModalOpen && pairingData && (
        <div className="modal-backdrop" onClick={() => setPairingModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center', padding: 'var(--space-6)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#EFF6FF',
              color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Laptop size={28} />
            </div>

            <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 8, fontWeight: 800 }}>Connect Shop Computer</h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              Launch <b>SecurePrint Print Agent</b> on your Windows PC and enter this 6-digit code.
            </p>

            {/* 6-digit code box */}
            <div style={{
              background: '#F8FAFC',
              border: '2px dashed var(--color-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              marginBottom: 16
            }}>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '2.5rem',
                fontWeight: 900,
                letterSpacing: '8px',
                color: 'var(--color-primary)',
                lineHeight: 1
              }}>
                {pairingData.pairingCode}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, fontSize: 'var(--font-size-xs)', color: timeLeft < 60 ? '#EF4444' : 'var(--color-text-muted)' }}>
                <Clock size={13} /> Code expires in: <strong>{formatSeconds(timeLeft)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button className="btn btn-secondary w-full" onClick={handleCopyCode} style={{ justifyContent: 'center', gap: 6 }}>
                <Copy size={16} /> Copy Code
              </button>
            </div>

            {/* Quick instructions */}
            <div style={{
              textAlign: 'left',
              background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-md)',
              padding: 14,
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)'
            }}>
              <div style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>Connection Steps:</div>
              <ol style={{ paddingLeft: 16, margin: 0 }}>
                <li>Open <b>SecurePrint Agent</b> on your shop counter PC.</li>
                <li>Enter the code <b>{pairingData.pairingCode}</b> and click Connect.</li>
                <li>Agent automatically discovers USB, Wi-Fi & LAN printers!</li>
              </ol>
            </div>

            <button className="btn btn-ghost w-full" onClick={() => setPairingModalOpen(false)} style={{ marginTop: 16 }}>
              Done / Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
