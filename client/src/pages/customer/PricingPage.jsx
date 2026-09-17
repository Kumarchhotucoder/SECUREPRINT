import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Check, ArrowRight, Sparkles, Printer, Zap, Lock, HelpCircle, CheckCircle2 } from 'lucide-react'

const PricingPage = () => {
  const navigate = useNavigate()
  const [billingCycle, setBillingCycle] = useState('monthly') // 'monthly' | 'annual'

  const plans = [
    {
      id: 'TRIAL',
      name: 'Free Trial',
      badge: 'Zero Commitment',
      price: 0,
      annualPrice: 0,
      period: 'for 7 days',
      description: 'Test the complete automated printing flow on your shop counter with zero setup fee.',
      cta: 'Start Free Trial',
      popular: false,
      features: [
        '7 Days Full Operational Access',
        '1 Permanent Counter Standee QR',
        'Up to 50 Automated Print Jobs',
        'Windows Print Agent Desktop App',
        'Automatic 10-Second File Purge',
        'Standard B&W and Color Support'
      ]
    },
    {
      id: 'STARTER',
      name: 'Starter Partner',
      badge: 'Most Popular for Cafes',
      price: 499,
      annualPrice: 399,
      period: '/month',
      description: 'Ideal for cyber cafes, photocopy shops, and neighborhood stationery centers.',
      cta: 'Get Starter Partner',
      popular: true,
      features: [
        'Full 30-Day Operational License',
        'Permanent Shop Counter QR',
        'Up to 500 Print Jobs / Month',
        'Up to 2 Connected Desktop Agents',
        'Multiple USB & Wi-Fi Printers',
        'Custom Per-Page Rates (B&W & Color)',
        'Automatic 10s Server-Side File Deletion',
        'Customer UPI & Cash Payment Flow',
        'Daily IST Revenue Analytics'
      ]
    },
    {
      id: 'PRO',
      name: 'Pro Printing Center',
      badge: 'High Volume & Multi-Machine',
      price: 999,
      annualPrice: 799,
      period: '/month',
      description: 'Engineered for busy college campus printing centers, court xerox hubs, and enterprises.',
      cta: 'Upgrade to Pro Center',
      popular: false,
      features: [
        'Unlimited Print Jobs / Month',
        'Unlimited Windows Print Agents',
        'Unlimited USB / Wi-Fi / LAN Printers',
        'Instant Duplicate Print Protection',
        'Advanced Analytics & Exportable Reports',
        'Zero-Trust Tenant Data Isolation',
        'Custom Branded Counter Standee PDF',
        'Priority Phone & WhatsApp Support',
        'Early Access to New Features'
      ]
    }
  ]

  const faqs = [
    {
      q: 'Does the customer need to install an app or join WhatsApp?',
      a: 'No! Customers simply scan your shop counter QR with their default phone camera or any scanner. It opens instantly in their browser without downloading any app or saving mobile numbers.'
    },
    {
      q: 'How does automatic 10-second file deletion work?',
      a: 'As soon as customer payment is verified, a persistent 10-second backend countdown begins. Once 10 seconds elapse, the server physically deletes the encrypted files from private storage and permanently revokes access.'
    },
    {
      q: 'Can I connect multiple printers (e.g. B&W LaserJet and Color Tank)?',
      a: 'Yes! SecurePrint Print Agent discovers all USB, Wi-Fi, and LAN printers installed on your computer and reports their color and duplex capabilities so you can pick the right machine per job.'
    },
    {
      q: 'How does the shop get paid by customers?',
      a: 'Once printing finishes, the customer sees a [ PAY NOW ] option on their phone with direct UPI QR or Cash confirmation. You receive the payment directly.'
    }
  ]

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
            <Link to="/agent" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontWeight: 600 }}>
              <Printer size={16} /> Print Agent
            </Link>
            <Link to="/admin/login" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', fontWeight: 600 }}>
              Sign In
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', fontWeight: 700 }}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '64px 20px 40px', textAlign: 'center', maxWidth: 860, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.2)',
          padding: '6px 16px', borderRadius: 999,
          fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)',
          marginBottom: 20
        }}>
          <Sparkles size={16} />
          Transparent SaaS Pricing for Every Print Counter
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 16 }}>
          Transform Your Printing Shop Into a Modern Digital Counter
        </h1>

        <p style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', maxWidth: 640, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Zero WhatsApp document sharing. Pure privacy, instant customer QR uploads, Windows Print Agent hardware integration, and automated 10-second deletion.
        </p>

        {/* Toggle */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--color-surface-2)',
          padding: 4,
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          alignItems: 'center'
        }}>
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            style={{
              padding: '8px 20px',
              borderRadius: 999,
              border: 'none',
              background: billingCycle === 'monthly' ? 'var(--color-primary)' : 'transparent',
              color: billingCycle === 'monthly' ? 'white' : 'var(--color-text)',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            style={{
              padding: '8px 20px',
              borderRadius: 999,
              border: 'none',
              background: billingCycle === 'annual' ? 'var(--color-primary)' : 'transparent',
              color: billingCycle === 'annual' ? 'white' : 'var(--color-text)',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Annual Billing <span style={{ fontSize: '0.75rem', color: billingCycle === 'annual' ? '#93C5FD' : '#16A34A', marginLeft: 4 }}>Save 20%</span>
          </button>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 64px', width: '100%' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 28,
          alignItems: 'stretch'
        }}>
          {plans.map((p) => {
            const currentPrice = billingCycle === 'annual' ? p.annualPrice : p.price
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  position: 'relative',
                  padding: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 20,
                  border: p.popular ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  boxShadow: p.popular ? '0 16px 36px rgba(37,99,235,0.15)' : 'var(--shadow-md)',
                  background: 'var(--color-surface)',
                  transform: p.popular ? 'translateY(-4px)' : 'none',
                  transition: 'transform 0.2s'
                }}
              >
                {p.badge && (
                  <div style={{
                    position: 'absolute',
                    top: -14,
                    left: 28,
                    background: p.popular ? 'var(--color-primary)' : 'var(--color-surface-2)',
                    color: p.popular ? 'white' : 'var(--color-text-secondary)',
                    padding: '4px 14px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    boxShadow: 'var(--shadow-sm)',
                    border: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    {p.badge}
                  </div>
                )}

                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8, marginTop: 4 }}>
                  {p.name}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, minHeight: 45, marginBottom: 20 }}>
                  {p.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '2.75rem', fontWeight: 900, color: 'var(--color-text)' }}>
                    ₹{currentPrice}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {p.period}
                  </span>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  {p.features.map((feat, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                      <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0 }} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => navigate(`/signup?plan=${p.id}`)}
                  className={`btn ${p.popular ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    fontWeight: 800,
                    borderRadius: 12,
                    boxShadow: p.popular ? '0 6px 18px rgba(37,99,235,0.35)' : 'none'
                  }}
                >
                  {p.cta} <ArrowRight size={18} />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Feature Guarantee Bar */}
      <section style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '36px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, textAlign: 'center' }}>
          <div>
            <Zap size={28} color="var(--color-primary)" style={{ margin: '0 auto 10px' }} />
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>Zero Network Ports Open</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>Outbound WSS only. No static IP or router port forwarding needed.</p>
          </div>
          <div>
            <Lock size={28} color="#16A34A" style={{ margin: '0 auto 10px' }} />
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>10-Second Physical Deletion</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>Unlinked from disk upon verified payment, even if browser closes.</p>
          </div>
          <div>
            <Printer size={28} color="#D97706" style={{ margin: '0 auto 10px' }} />
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>USB, Wi-Fi & LAN Printers</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>Autodetects Windows printers, color capabilities, and paper sizes.</p>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '64px 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 800, marginBottom: 40 }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {faqs.map((f, idx) => (
            <div key={idx} className="card" style={{ padding: 24, borderRadius: 14 }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <HelpCircle size={20} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                {f.q}
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, margin: 0, paddingLeft: 30 }}>
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', padding: '24px 20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        © 2026 SecurePrint Technologies · Built for Cyber Cafes & Photocopy Centers.
      </footer>
    </div>
  )
}

export default PricingPage
