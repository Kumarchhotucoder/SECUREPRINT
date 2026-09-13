import toast from 'react-hot-toast'

/**
 * Web Audio API based notification chimes.
 * Works across all modern browsers without needing external audio assets.
 */
export const playNotificationSound = (type = 'new-job') => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    const gainNode = ctx.createGain()
    gainNode.connect(ctx.destination)

    if (type === 'payment') {
      // Cheerful rising cash-register chime (D5 -> A5 -> D6)
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      osc1.type = 'sine'
      osc2.type = 'triangle'

      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.setValueAtTime(880.00, now + 0.12) // A5
      osc1.frequency.setValueAtTime(1174.66, now + 0.24) // D6

      osc2.frequency.setValueAtTime(587.33, now)
      osc2.frequency.setValueAtTime(880.00, now + 0.12)
      osc2.frequency.setValueAtTime(1174.66, now + 0.24)

      osc1.connect(gainNode)
      osc2.connect(gainNode)

      gainNode.gain.setValueAtTime(0.25, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.5)
      osc2.stop(now + 0.5)
    } else if (type === 'new-job') {
      // Professional counter bell chime (C5 -> E5 -> G5)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.connect(gainNode)

      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1) // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2) // G5

      gainNode.gain.setValueAtTime(0.3, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.55)

      osc.start(now)
      osc.stop(now + 0.55)
    } else {
      // General status alert chime
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.connect(gainNode)

      osc.frequency.setValueAtTime(659.25, now) // E5
      osc.frequency.setValueAtTime(880.00, now + 0.12) // A5

      gainNode.gain.setValueAtTime(0.2, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.start(now)
      osc.stop(now + 0.35)
    }
  } catch (err) {
    // AudioContext blocked or not supported on device
  }
}

/**
 * Top notification banner with rich visual feedback
 */
export const showTopAlert = ({
  type = 'info',
  title,
  subtitle,
  icon = '🔔',
  duration = 4500,
  playSound = true
}) => {
  if (playSound) {
    playNotificationSound(type === 'payment' ? 'payment' : type === 'new-job' ? 'new-job' : 'alert')
  }

  const borderColors = {
    'new-job': '#1A56DB',
    'payment': '#10B981',
    'deletion': '#7C3AED',
    'status': '#F59E0B',
    'info': '#3B82F6'
  }

  const bgGradients = {
    'new-job': 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
    'payment': 'linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 100%)',
    'deletion': 'linear-gradient(135deg, #F5F3FF 0%, #FFFFFF 100%)',
    'status': 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 100%)',
    'info': '#FFFFFF'
  }

  toast((t) => (
    <div
      onClick={() => toast.dismiss(t.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        width: '100%',
        maxWidth: 380
      }}
    >
      <div style={{
        fontSize: '1.6rem',
        lineHeight: 1,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 42,
        height: 42,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.85)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 800,
          fontSize: '0.92rem',
          color: 'var(--color-text, #0F172A)',
          lineHeight: 1.3,
          letterSpacing: '-0.01em'
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary, #475569)',
            marginTop: 2,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  ), {
    duration,
    position: 'top-center',
    style: {
      background: bgGradients[type] || '#FFFFFF',
      border: `2px solid ${borderColors[type] || '#E2E8F0'}`,
      borderRadius: '16px',
      padding: '10px 14px',
      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.16)',
      maxWidth: '92vw'
    }
  })
}
