import { useState } from 'react'
import { Shield, Check, DollarSign, Store, ArrowRight, Printer, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

const PAPER_OPTIONS = ['A4', 'A3', 'Letter', 'Legal', 'A5']

const ShopSetupScreen = ({ shop, onSetupComplete }) => {
  const [name, setName] = useState(shop?.name || '')
  const [phone, setPhone] = useState(shop?.phone || '')
  const [street, setStreet] = useState(shop?.address?.street || '')
  const [city, setCity] = useState(shop?.address?.city || '')
  const [state, setState] = useState(shop?.address?.state || '')
  const [pincode, setPincode] = useState(shop?.address?.pincode || '')
  const [bwRate, setBwRate] = useState(shop?.pricing?.bwPerPage ?? 1)
  const [colorRate, setColorRate] = useState(shop?.pricing?.colorPerPage ?? 5)
  const [paperSizes, setPaperSizes] = useState(shop?.supportedPaperSizes || ['A4', 'A3', 'Letter'])
  const [saving, setSaving] = useState(false)

  const togglePaper = (size) => {
    if (paperSizes.includes(size)) {
      if (paperSizes.length === 1) return
      setPaperSizes(paperSizes.filter(s => s !== size))
    } else {
      setPaperSizes([...paperSizes, size])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Shop name is required')
      return
    }
    const bw = Number(bwRate)
    const col = Number(colorRate)
    if (isNaN(bw) || bw < 0) {
      toast.error('B&W rate must be a valid number')
      return
    }
    if (isNaN(col) || col < 0) {
      toast.error('Colour rate must be a valid number')
      return
    }

    setSaving(true)
    try {
      const res = await api.put('/shops/my', {
        name: name.trim(),
        phone: phone.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim()
        },
        pricing: {
          bwPerPage: bw,
          colorPerPage: col,
          currency: 'INR'
        },
        supportedPaperSizes: paperSizes
      })

      toast.success('Counter setup completed! Welcome to your dashboard.', { icon: '🎉' })
      if (onSetupComplete) {
        onSetupComplete(res.data.data)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save setup details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, var(--color-bg) 60%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)'
    }}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        <div className="card animate-fadeIn" style={{
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow-xl)',
          borderTop: '5px solid var(--color-primary)'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--color-primary)',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-3)',
              boxShadow: 'var(--shadow-primary)'
            }}>
              <Printer size={28} />
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#EFF6FF',
              color: 'var(--color-primary)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 800,
              marginBottom: 'var(--space-2)'
            }}>
              <Sparkles size={12} /> FIRST-TIME SETUP REQUIRED
            </div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: '0 0 6px' }}>
              Configure Your Printing Counter
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
              Set your shop name and per-page rates so customers see accurate pricing when they scan your QR code.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Shop Details */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                  Shop / Printing Counter Name *
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ABC Digital Prints & Xerox"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                    City *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Pune"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                    Street / Area
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="e.g. Shop #4, Station Road"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                    State
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Maharashtra"
                  />
                </div>
              </div>
            </div>

            {/* Custom Pricing Section */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              border: '2px solid #E2E8F0',
              marginBottom: 'var(--space-5)'
            }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={16} color="var(--color-primary)" />
                Set Your Per-Page Printing Rates (₹ INR)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
                    Black & White Rate (₹ / page) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--color-text-secondary)' }}>
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="form-input"
                      style={{ paddingLeft: 28, fontWeight: 700, fontSize: 'var(--font-size-lg)' }}
                      value={bwRate}
                      onChange={(e) => setBwRate(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Your custom B&W price
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: '#059669' }}>
                    Colour Rate (₹ / page) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--color-text-secondary)' }}>
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="form-input"
                      style={{ paddingLeft: 28, fontWeight: 700, fontSize: 'var(--font-size-lg)' }}
                      value={colorRate}
                      onChange={(e) => setColorRate(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Your custom colour price
                  </div>
                </div>
              </div>
            </div>

            {/* Paper Sizes */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
                Supported Paper Sizes
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {PAPER_OPTIONS.map(size => {
                  const selected = paperSizes.includes(size)
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => togglePaper(size)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-full)',
                        border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: selected ? '#EFF6FF' : 'var(--color-surface)',
                        color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      {selected && <Check size={12} />} {size}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="submit"
              id="complete-setup-btn"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', height: 50, fontWeight: 800, fontSize: 'var(--font-size-base)', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-primary)' }}
              disabled={saving}
            >
              {saving ? (
                <><div className="spinner" /> Saving Details...</>
              ) : (
                <>Save Rates & Launch Dashboard <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ShopSetupScreen
