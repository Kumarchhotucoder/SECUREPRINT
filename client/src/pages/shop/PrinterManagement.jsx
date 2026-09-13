import { useState, useEffect, useCallback } from 'react'
import {
  PrinterIcon, Laptop, Wifi, Usb, Globe, CheckCircle2,
  AlertCircle, RefreshCw, Plus, Trash2, Play, Check, ShieldCheck,
  Copy, Clock, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

export default function PrinterManagement({ shop, socket, refreshTrigger }) {
  const [agents, setAgents] = useState([])
  const [printers, setPrinters] = useState([])
  const [loading, setLoading] = useState(true)
  const [pairingModalOpen, setPairingModalOpen] = useState(false)
  const [pairingData, setPairingData] = useState(null)
  const [timeLeft, setTimeLeft] = useState(600)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [testPrintingId, setTestPrintingId] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/printers')
      if (res.data?.success) {
        setAgents(res.data.data.agents || [])
        setPrinters(res.data.data.printers || [])
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load printers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return

    const handleAgentStatus = (data) => {
      setAgents(prev => prev.map(ag => ag.agentId === data.agentId ? { ...ag, status: data.status, lastSeenAt: new Date() } : ag))
      if (data.status === 'ONLINE') toast.success(`Computer "${data.agentId}" is now Online!`)
    }

    const handlePrintersUpdated = () => {
      fetchData()
    }

    socket.on('agent-status-changed', handleAgentStatus)
    socket.on('printers-updated', handlePrintersUpdated)

    return () => {
      socket.off('agent-status-changed', handleAgentStatus)
      socket.off('printers-updated', handlePrintersUpdated)
    }
  }, [socket, fetchData])

  // Timer for pairing code
  useEffect(() => {
    if (!pairingData || !pairingModalOpen) return
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(pairingData.expiresAt).getTime() - Date.now()) / 1000))
      setTimeLeft(diff)
      if (diff <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [pairingData, pairingModalOpen])

  const handleGeneratePairingCode = async () => {
    try {
      setGeneratingCode(true)
      const res = await api.post('/printers/pairing-code')
      if (res.data?.success) {
        setPairingData(res.data.data)
        setPairingModalOpen(true)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate code')
    } finally {
      setGeneratingCode(false)
    }
  }

  const handleTestPrint = async (printerId) => {
    try {
      setTestPrintingId(printerId)
      toast.loading('Sending test print command to agent...', { id: 'test-print' })
      const res = await api.post(`/printers/${printerId}/test-print`)
      toast.dismiss('test-print')
      if (res.data?.success) {
        toast.success('Test print dispatched to physical printer!')
      }
    } catch (err) {
      toast.dismiss('test-print')
      toast.error(err.response?.data?.message || 'Test print failed')
    } finally {
      setTestPrintingId(null)
    }
  }

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
      case 'USB': return <Usb size={16} />
      case 'WIFI': return <Wifi size={16} />
      case 'LAN': return <Globe size={16} />
      default: return <PrinterIcon size={16} />
    }
  }

  return (
    <div className="animate-fadeIn" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <PrinterIcon size={24} color="var(--color-primary)" />
            Printers & Desktop Agent
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            Direct bridge between SecurePrint Cloud and your physical USB / Wi-Fi / LAN printers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            id="connect-computer-btn"
            className="btn btn-primary btn-sm"
            onClick={handleGeneratePairingCode}
            disabled={generatingCode}
            style={{ fontWeight: 700, gap: 6 }}
          >
            <Laptop size={16} /> Connect Computer / Laptop
          </button>
        </div>
      </div>

      {/* Agents Section */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <h3 style={{ fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Laptop size={18} color="var(--color-text-secondary)" />
          Connected Computers ({agents.length})
        </h3>

        {agents.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', background: 'var(--color-surface-2)' }}>
            <Laptop size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 'var(--font-size-base)', marginBottom: 6 }}>No Shop Computers Paired Yet</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', maxWidth: 450, margin: '0 auto 16px' }}>
              Install the <b>SecurePrint Desktop Agent</b> on your shop counter laptop to enable physical printing to USB & Wi-Fi printers without opening files.
            </p>
            <button className="btn btn-primary btn-sm" onClick={handleGeneratePairingCode} style={{ margin: '0 auto' }}>
              <Plus size={16} /> Generate 6-Digit Pairing Code
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {agents.map(agent => (
              <div key={agent.agentId} className="card" style={{ padding: 'var(--space-4)', borderLeft: agent.status === 'ONLINE' ? '4px solid #10B981' : '4px solid #EF4444' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                      {agent.computerName || 'Shop Counter PC'}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      ID: {agent.agentId}
                    </div>
                  </div>
                  <span className={`badge ${agent.status === 'ONLINE' ? 'badge-verified' : ''}`} style={{
                    background: agent.status === 'ONLINE' ? '#ECFDF5' : '#FEE2E2',
                    color: agent.status === 'ONLINE' ? '#059669' : '#DC2626',
                    fontWeight: 700,
                    fontSize: '0.72rem'
                  }}>
                    {agent.status === 'ONLINE' ? '🟢 Online' : '🔴 Offline'}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>OS: <strong>{agent.os || 'Windows/macOS'}</strong></div>
                  <div>Last Active: <strong>{agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleTimeString() : 'Never'}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Printers Section */}
      <div>
        <h3 style={{ fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <PrinterIcon size={18} color="var(--color-text-secondary)" />
          Discovered Physical Printers ({printers.length})
        </h3>

        {printers.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', background: 'var(--color-surface-2)' }}>
            <PrinterIcon size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 'var(--font-size-base)', marginBottom: 6 }}>No Printers Discovered</h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', maxWidth: 450, margin: '0 auto' }}>
              Once your shop computer is connected, SecurePrint will automatically detect all USB, Wi-Fi, and network printers attached to it.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {printers.map(printer => {
              const isOnline = printer.status === 'READY'
              return (
                <div key={printer.printerId} className="card" style={{
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: printer.isDefault ? '2px solid var(--color-primary)' : '1px solid var(--color-border)'
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
                            {printer.name}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            {printer.systemPrinterName}
                          </div>
                        </div>
                      </div>
                      {printer.isDefault && (
                        <span className="badge" style={{ background: '#EFF6FF', color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.7rem' }}>
                          ★ DEFAULT
                        </span>
                      )}
                    </div>

                    {/* Printer Capability Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                      <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface-2)', fontSize: '0.72rem' }}>
                        {getConnectionIcon(printer.connectionType)} {printer.connectionType}
                      </span>
                      <span className="badge" style={{
                        background: printer.isColorCapable ? '#FAF5FF' : '#F1F5F9',
                        color: printer.isColorCapable ? '#7E22CE' : '#475569',
                        fontSize: '0.72rem'
                      }}>
                        {printer.isColorCapable ? '🎨 Color + B&W' : '⬛ Black & White'}
                      </span>
                      <span className="badge" style={{
                        background: isOnline ? '#ECFDF5' : '#FEF3C7',
                        color: isOnline ? '#059669' : '#D97706',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        ● {printer.status}
                      </span>
                      {printer.supportsDuplex && (
                        <span className="badge" style={{ background: 'var(--color-surface-2)', fontSize: '0.72rem' }}>
                          📄 2-Sided
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                    {!printer.isDefault && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                        onClick={() => handleSetDefault(printer.printerId)}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, fontSize: '0.75rem', gap: 4 }}
                      onClick={() => handleTestPrint(printer.printerId)}
                      disabled={testPrintingId === printer.printerId}
                    >
                      <Play size={12} /> {testPrintingId === printer.printerId ? 'Sending...' : 'Test Print'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pairing Modal */}
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

            <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 8 }}>Connect Shop Computer</h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              Run the SecurePrint Desktop Agent on your shop PC and enter this single-use code to establish a secure link.
            </p>

            {/* Huge 6-digit code box */}
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
                <Clock size={13} /> Valid for: <strong>{formatSeconds(timeLeft)}</strong>
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
              <div style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>How to pair:</div>
              <ol style={{ paddingLeft: 16, margin: 0 }}>
                <li>Open <b>SecurePrint Agent</b> on your shop computer.</li>
                <li>Enter the 6-digit code <b>{pairingData.pairingCode}</b>.</li>
                <li>Your USB and Wi-Fi printers will automatically show up here!</li>
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
