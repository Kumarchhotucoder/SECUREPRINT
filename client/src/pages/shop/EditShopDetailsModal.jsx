import { useState } from 'react'
import { Shield, X, Check, DollarSign, Store, MapPin, Phone, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'

const PAPER_OPTIONS = ['A4', 'A3', 'Letter', 'Legal', 'A5']

const EditShopDetailsModal = ({ shop, isOpen, onClose, onUpdated }) => {
  if (!isOpen) return null

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
      if (paperSizes.length === 1) {
        toast.error('At least one paper size must be supported')
        return
      }
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
      toast.error('B&W rate must be a valid non-negative number')
      return
    }
    if (isNaN(col) || col < 0) {
      toast.error('Colour rate must be a valid non-negative number')
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

      toast.success('Counter details & rates updated successfully!')
      if (onUpdated) {
        onUpdated(res.data.data)
      }
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update counter details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 'var(--space-4)'
    }}>
      <div className="card animate-fadeIn" style={{
        maxWidth: 620,
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        background: '#FFFFFF'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '22px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 'var(--radius-lg)',
              background: '#EFF6FF',
              color: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid #BFDBFE'
            }}>
              <Store size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                Edit Counter Details & Rates
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                Set your custom per-page printing prices and shop details
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close"
            style={{ borderRadius: '50%', width: 36, height: 36 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Section 1: Shop Information */}
          <div style={{ marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)' }}>
                Shop / Counter Name *
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', fontSize: '0.95rem', fontWeight: 600 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sharma Photostat & Prints"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)' }}>
                  Contact Phone
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91-98111-22334"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)' }}>
                  City *
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Delhi"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)' }}>
                  Street / Area
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="e.g. 45, Station Road"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)' }}>
                  State
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Delhi"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Custom Rates Card */}
          <div style={{
            background: '#F8FAFC',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            marginBottom: '20px',
            border: '1.5px solid #E2E8F0'
          }}>
            <div style={{
              fontWeight: 800,
              fontSize: '0.9rem',
              color: 'var(--color-text)',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <DollarSign size={18} color="var(--color-primary)" />
              Custom Print Rates (Per Page)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                  Black & White Rate (₹)
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <span style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: 'var(--color-primary)',
                    pointerEvents: 'none'
                  }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="form-input"
                    style={{
                      width: '100%',
                      paddingLeft: '34px',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      color: 'var(--color-text)',
                      background: '#FFFFFF'
                    }}
                    value={bwRate}
                    onChange={(e) => setBwRate(e.target.value)}
                    required
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Charged per B&W page
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', color: '#059669' }}>
                  Colour Rate (₹)
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <span style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: '#059669',
                    pointerEvents: 'none'
                  }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="form-input"
                    style={{
                      width: '100%',
                      paddingLeft: '34px',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      color: 'var(--color-text)',
                      background: '#FFFFFF'
                    }}
                    value={colorRate}
                    onChange={(e) => setColorRate(e.target.value)}
                    required
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Charged per colour page
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Supported Paper Sizes */}
          <div style={{ marginBottom: '26px' }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '8px' }}>
              Supported Paper Sizes
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PAPER_OPTIONS.map(size => {
                const selected = paperSizes.includes(size)
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => togglePaper(size)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 'var(--radius-full)',
                      border: selected ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                      background: selected ? '#EFF6FF' : '#FFFFFF',
                      color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {selected && <Check size={14} />} {size}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '10px 20px', fontWeight: 600 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="save-counter-details-btn"
              className="btn btn-primary"
              style={{
                gap: 8,
                padding: '10px 24px',
                fontWeight: 700,
                justifyContent: 'center',
                boxShadow: 'var(--shadow-primary)'
              }}
              disabled={saving}
            >
              {saving ? (
                <><div className="spinner" /> Saving Rates...</>
              ) : (
                <><Check size={18} /> Save & Apply Rates</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditShopDetailsModal
