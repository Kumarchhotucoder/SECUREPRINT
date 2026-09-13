import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, Download, Home } from 'lucide-react'
import api from '../../lib/api'

const ReceiptPage = () => {
  const { jobId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionToken = searchParams.get('token')

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/jobs/${jobId}`, {
      headers: sessionToken ? { 'X-Session-Token': sessionToken } : {}
    }).then(res => setJob(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobId, sessionToken])

  if (loading) {
    return <div className="loading-screen"><div className="spinner spinner-primary" style={{ width: 40, height: 40 }} /></div>
  }

  const completedAt = job?.completedAt ? new Date(job.completedAt) : new Date()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: 'var(--space-6) var(--space-4)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{
            width: 72, height: 72,
            background: 'var(--color-verified-light)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-4)',
            color: 'var(--color-verified)'
          }}>
            <CheckCircle size={36} />
          </div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--space-1)' }}>Receipt</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Your printing is complete
          </p>
        </div>

        {/* Receipt card */}
        <div className="card" style={{
          border: '2px solid var(--color-verified)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Watermark */}
          <div style={{
            position: 'absolute',
            top: 16,
            right: 16,
            opacity: 0.08,
            fontSize: 80,
            fontWeight: 900,
            color: 'var(--color-verified)',
            letterSpacing: -4
          }}>
            ✓
          </div>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--color-primary)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white'
            }}>
              <Shield size={18} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-xl)', letterSpacing: '-0.03em' }}>SecurePrint</span>
            <span style={{ marginLeft: 'auto' }}>
              <span className="badge badge-verified">
                <CheckCircle size={10} /> Completed
              </span>
            </span>
          </div>

          {/* Receipt rows */}
          {[
            ['Job ID', `SP-${job?.jobNumber || jobId.slice(-6).toUpperCase()}`],
            ['Shop', job?.shopId?.name || '—'],
            ['Files', job?.totalFiles],
            ['Pages', job?.totalPages],
            ['Copies', job?.copies],
            ['Mode', job?.colorMode === 'BW' ? 'Black & White' : 'Colour'],
            ['Paper', job?.paperSize],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 'var(--space-3) 0',
              borderBottom: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-sm)'
            }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}

          {/* Amount */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: 'var(--space-4) 0',
            fontSize: 'var(--font-size-lg)',
            fontWeight: 800
          }}>
            <span>Total Amount</span>
            <span style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-2xl)' }}>
              ₹{job?.finalPrice || job?.estimatedPrice || 0}
            </span>
          </div>

          {/* Footer */}
          <div style={{
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Completed</span>
              <span>{completedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Status</span>
              <span style={{ color: 'var(--color-verified)', fontWeight: 700 }}>Files Deleted After Print</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Download size={18} /> Save Receipt
          </button>
          <button id="home-btn" className="btn btn-primary" onClick={() => navigate('/')}>
            <Home size={18} /> Print More Documents
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReceiptPage
