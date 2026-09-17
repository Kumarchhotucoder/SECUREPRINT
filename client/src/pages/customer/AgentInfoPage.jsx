import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Printer, Terminal, Laptop, CheckCircle, Download, Key, Wifi, Cpu, ArrowRight, Copy, Check } from 'lucide-react'

const AgentInfoPage = () => {
  const [copiedCode, setCopiedCode] = useState(false)

  const samplePairCommand = 'cd agent && node cli.js pair 482913'

  const handleCopy = () => {
    navigator.clipboard.writeText(samplePairCommand)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: 38, height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
            }}>
              <Shield size={22} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
              SecurePrint
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link to="/pricing" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontWeight: 600 }}>
              Pricing
            </Link>
            <Link to="/admin/login" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontWeight: 600 }}>
              Shop Admin
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', fontWeight: 700 }}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '64px 20px 40px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.2)',
          padding: '6px 16px', borderRadius: 999,
          fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)',
          marginBottom: 20
        }}>
          <Laptop size={16} />
          Windows Desktop Application & CLI Daemon
        </div>

        <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 16 }}>
          SecurePrint Desktop Print Agent
        </h1>

        <p style={{ fontSize: '1.15rem', color: 'var(--color-text-secondary)', maxWidth: 680, margin: '0 auto 36px', lineHeight: 1.6 }}>
          Connects your shop's counter computer to SecurePrint Cloud via outbound WebSocket. Directly dispatches print jobs to your local USB, Wi-Fi, and LAN printers with zero port forwarding.
        </p>
      </section>

      {/* 3 Step Setup Guide */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 64px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 800, marginBottom: 40 }}>
          3 Simple Steps to Pair Your Windows Computer
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {/* Step 1 */}
          <div className="card" style={{ padding: 32, borderRadius: 18, position: 'relative' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(37,99,235,0.1)', color: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.2rem', marginBottom: 20
            }}>
              1
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 10 }}>
              Generate Pairing Code
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Open your <strong>Shop Admin Dashboard &rarr; Printers & Agent</strong> and click <strong>[ Connect Computer ]</strong>. You will receive a temporary 6-digit code (e.g. <code>482913</code>).
            </p>
          </div>

          {/* Step 2 */}
          <div className="card" style={{ padding: 32, borderRadius: 18, position: 'relative' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(16,185,129,0.1)', color: '#10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.2rem', marginBottom: 20
            }}>
              2
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 10 }}>
              Pair Your Computer
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Launch SecurePrint Desktop Agent or run the CLI command on your Windows computer:
            </p>
            <div style={{
              background: '#0F172A', color: '#38BDF8', padding: '10px 14px',
              borderRadius: 8, marginTop: 12, fontSize: '0.8rem', fontFamily: 'monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <span>{samplePairCommand}</span>
              <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                {copiedCode ? <Check size={14} color="#4ADE80" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="card" style={{ padding: 32, borderRadius: 18, position: 'relative' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.2rem', marginBottom: 20
            }}>
              3
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 10 }}>
              Auto Hardware Discovery
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              The Agent automatically queries Windows WMI/CimInstance to discover all connected USB, Wi-Fi, and LAN printers, reporting real-time status and color capability to your cloud dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* Technical Architecture Specs */}
      <section style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '56px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 800, marginBottom: 40 }}>
            Enterprise Security & Architecture
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24 }}>
            <div style={{ padding: 20 }}>
              <Wifi size={24} color="var(--color-primary)" style={{ marginBottom: 12 }} />
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>Outbound-Only WebSocket</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                No static IP or firewall opening required. The agent connects outbound via WSS, meaning your shop's network remains 100% shielded from external port scans.
              </p>
            </div>

            <div style={{ padding: 20 }}>
              <Key size={24} color="#16A34A" style={{ marginBottom: 12 }} />
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>Temporary Signed URLs</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Documents are downloaded using short-lived cryptographic tokens valid for only 5 minutes. The agent spools the file directly to OS memory and erases temp files immediately.
              </p>
            </div>

            <div style={{ padding: 20 }}>
              <Cpu size={24} color="#9333EA" style={{ marginBottom: 12 }} />
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>Idempotent Print Queue</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Every print attempt is assigned a unique <code>attemptId</code>. If network blips occur, duplicate print attempts are blocked locally, preventing wasted paper.
              </p>
            </div>

            <div style={{ padding: 20 }}>
              <Terminal size={24} color="#D97706" style={{ marginBottom: 12 }} />
              <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>Windows & Unix Support</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Uses native PowerShell CimInstance on Windows and CUPS <code>lpstat</code> on macOS/Linux. Supports auto-start on Windows boot.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLI Command Cheatsheet */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '64px 20px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 800, marginBottom: 24 }}>
          Command Line Reference
        </h2>
        <div style={{ background: '#0F172A', color: '#F8FAFC', padding: 24, borderRadius: 16, fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.8 }}>
          <div style={{ color: '#94A3B8', marginBottom: 8 }}># 1. Discover local hardware printers</div>
          <div style={{ color: '#38BDF8', marginBottom: 16 }}>node cli.js printers</div>

          <div style={{ color: '#94A3B8', marginBottom: 8 }}># 2. Pair computer with 6-digit shop code</div>
          <div style={{ color: '#38BDF8', marginBottom: 16 }}>node cli.js pair &lt;6-DIGIT-CODE&gt;</div>

          <div style={{ color: '#94A3B8', marginBottom: 8 }}># 3. Start background listener daemon</div>
          <div style={{ color: '#38BDF8', marginBottom: 16 }}>node cli.js start</div>

          <div style={{ color: '#94A3B8', marginBottom: 8 }}># 4. Check pairing & connection status</div>
          <div style={{ color: '#38BDF8' }}>node cli.js status</div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', padding: '24px 20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        © 2026 SecurePrint Technologies · Hardware Print Subsystem.
      </footer>
    </div>
  )
}

export default AgentInfoPage
