import React from 'react'

/**
 * Interactive Medical Companion Robot SVG ("Dr. Pulse / MedBot")
 * Supports dynamic expressions:
 * - 'welcome' | 'idle': Gentle float, blinking cyan eyes, warm smile, glowing medical cross
 * - 'listening': Head tilted attentively when the user is typing in the input box
 * - 'thinking': Scanning diagnostic eyes, pulsing medical cross & animated ECG wave
 * - 'question': Curious raised brow while asking a clarifying triage question
 * - 'happy' | 'verdict': Caring happy arc eyes ("^ ^") & emerald medical cross
 * - 'alert': Urgent crimson/amber emergency beacon for high-urgency red flags
 */
const MedBotAvatar = ({
  mood = 'idle',
  size = 'md',
  className = '',
  showStatusBadge = false
}) => {
  const dimensions = {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24'
  }[size] || 'w-12 h-12'

  const isThinking = mood === 'thinking'
  const isListening = mood === 'listening'
  const isQuestion = mood === 'question'
  const isHappy = mood === 'happy' || mood === 'verdict'
  const isAlert = mood === 'alert'

  // Dynamic accent palette based on clinical mood
  const primaryGlow = isAlert
    ? '#F43F5E'
    : isHappy
    ? '#10B981'
    : isThinking
    ? '#38BDF8'
    : isQuestion
    ? '#6366F1'
    : '#0284C7'

  const crossColor = isAlert
    ? '#E11D48'
    : isHappy
    ? '#059669'
    : '#0284C7'

  const statusLabel = {
    idle: 'Ready to help',
    welcome: 'Online & ready',
    listening: 'Listening to you...',
    thinking: 'Thinking & screening...',
    question: 'Clarifying symptoms',
    verdict: 'Care plan ready!',
    happy: 'All clear!',
    alert: 'Urgent clinical alert'
  }[mood] || 'Online'

  return (
    <div className={`relative inline-flex flex-col items-center select-none ${className}`}>
      <div className={`relative ${dimensions} flex items-center justify-center`}>
        {/* Ambient pulse ring when thinking or alert */}
        {(isThinking || isAlert || isListening) && (
          <span
            className={`absolute inset-0 rounded-full opacity-35 ${
              isThinking ? 'animate-ping' : 'animate-pulse'
            }`}
            style={{ backgroundColor: primaryGlow }}
          />
        )}

        <svg
          viewBox='0 0 120 120'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          className={`w-full h-full drop-shadow-sm transition-transform duration-300 ${
            isListening
              ? '-rotate-6 scale-105'
              : isQuestion
              ? 'rotate-3 scale-105'
              : isThinking
              ? 'scale-105'
              : 'hover:scale-105'
          }`}
          style={{
            animation: isThinking
              ? 'medbot-bob 1.1s ease-in-out infinite'
              : 'medbot-bob 3.2s ease-in-out infinite'
          }}
        >
          <style>{`
            @keyframes medbot-bob {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-3.5px); }
            }
            @keyframes medbot-blink {
              0%, 92%, 100% { transform: scaleY(1); }
              96% { transform: scaleY(0.1); }
            }
            @keyframes medbot-scan {
              0%, 100% { transform: translateX(-5px); }
              50% { transform: translateX(5px); }
            }
            @keyframes medbot-ecg {
              0% { stroke-dashoffset: 40; }
              100% { stroke-dashoffset: 0; }
            }
          `}</style>

          {/* Antenna Stem & Signal Bulb */}
          <line
            x1='60'
            y1='8'
            x2='60'
            y2='20'
            stroke='#475569'
            strokeWidth='4'
            strokeLinecap='round'
          />
          <circle
            cx='60'
            cy='7'
            r='5.5'
            fill={primaryGlow}
            className={isThinking || isAlert ? 'animate-ping' : ''}
          />
          <circle cx='60' cy='7' r='4.5' fill={primaryGlow} />
          <circle cx='58.5' cy='5.5' r='1.5' fill='#FFFFFF' />

          {/* Left & Right Stethoscope / Audio Ear Pods */}
          <rect x='12' y='44' width='9' height='22' rx='4.5' fill={primaryGlow} />
          <rect x='99' y='44' width='9' height='22' rx='4.5' fill={primaryGlow} />

          {/* Robot Head Shell */}
          <rect
            x='20'
            y='20'
            width='80'
            height='66'
            rx='24'
            fill='#FFFFFF'
            stroke='#CBD5E1'
            strokeWidth='3.5'
          />

          {/* Forehead Medical Cross Badge (Doctor Cap Emblem) */}
          <rect
            x='45'
            y='14'
            width='30'
            height='16'
            rx='8'
            fill='#F8FAFC'
            stroke='#CBD5E1'
            strokeWidth='2.5'
          />
          {/* Medical Cross (+) Symbol */}
          <path
            d='M58 17.5H62V20.5H65V23.5H62V26.5H58V23.5H55V20.5H58V17.5Z'
            fill={crossColor}
          />

          {/* Digital Face Visor Screen */}
          <rect
            x='28'
            y='33'
            width='64'
            height='42'
            rx='15'
            fill='#0F172A'
            stroke='#1E293B'
            strokeWidth='2'
          />

          {/* Cheek Rosy / Clinical Glow */}
          <circle cx='36' cy='61' r='3.5' fill={primaryGlow} fillOpacity='0.35' />
          <circle cx='84' cy='61' r='3.5' fill={primaryGlow} fillOpacity='0.35' />

          {/* DYNAMIC EYES BASED ON MOOD */}
          {isHappy ? (
            /* Happy Caring Arc Eyes (^ ^) */
            <g stroke='#34D399' strokeWidth='3.5' strokeLinecap='round' fill='none'>
              <path d='M39 51C41 46 46 46 48 51' />
              <path d='M72 51C74 46 79 46 81 51' />
            </g>
          ) : isThinking ? (
            /* Scanning / Thinking Eyes + Animated Medical Radar */
            <g style={{ animation: 'medbot-scan 0.9s ease-in-out infinite' }}>
              <circle cx='44' cy='49' r='6' fill='#38BDF8' />
              <circle cx='42.5' cy='47.5' r='2' fill='#FFFFFF' />
              <circle cx='76' cy='49' r='6' fill='#38BDF8' />
              <circle cx='74.5' cy='47.5' r='2' fill='#FFFFFF' />
            </g>
          ) : isAlert ? (
            /* Urgent Focused Eyes */
            <g>
              <circle cx='44' cy='50' r='5.5' fill='#FB7185' />
              <circle cx='76' cy='50' r='5.5' fill='#FB7185' />
              <line x1='37' y1='42' x2='49' y2='45' stroke='#FB7185' strokeWidth='2.5' strokeLinecap='round' />
              <line x1='83' y1='42' x2='71' y2='45' stroke='#FB7185' strokeWidth='2.5' strokeLinecap='round' />
            </g>
          ) : (
            /* Default / Listening / Question Blinking LED Eyes */
            <g
              style={{
                transformOrigin: '60px 49px',
                animation: 'medbot-blink 4s infinite'
              }}
            >
              <circle cx='44' cy='49' r={isListening ? '6.5' : '5.5'} fill='#38BDF8' />
              <circle cx='42' cy='47' r='2' fill='#FFFFFF' />
              <circle cx='76' cy='49' r={isListening ? '6.5' : '5.5'} fill='#38BDF8' />
              <circle cx='74' cy='47' r='2' fill='#FFFFFF' />
              {isQuestion && (
                /* Curious Raised Eyebrow */
                <path
                  d='M70 40C73 37.5 78 37.5 82 40'
                  stroke='#38BDF8'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                />
              )}
            </g>
          )}

          {/* DYNAMIC MOUTH / ECG WAVE */}
          {isThinking ? (
            /* Live Animated ECG Heartbeat Line while thinking */
            <path
              d='M42 64H51L54 58L58 69L62 60L65 64H78'
              stroke='#38BDF8'
              strokeWidth='2.5'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeDasharray='40'
              style={{ animation: 'medbot-ecg 1s linear infinite' }}
            />
          ) : isListening ? (
            /* Attentive "O" / Listening Waveform Mouth */
            <rect x='54' y='60' width='12' height='6' rx='3' fill='#38BDF8' />
          ) : isQuestion ? (
            /* Curious Gentle Curve */
            <path
              d='M53 63C56 65.5 64 64.5 67 62'
              stroke='#38BDF8'
              strokeWidth='2.8'
              strokeLinecap='round'
            />
          ) : isAlert ? (
            /* Serious Straight Line */
            <line x1='52' y1='64' x2='68' y2='64' stroke='#FB7185' strokeWidth='2.8' strokeLinecap='round' />
          ) : (
            /* Warm Caring Smile */
            <path
              d='M50 61C53 66 67 66 70 61'
              stroke={isHappy ? '#34D399' : '#38BDF8'}
              strokeWidth='3'
              strokeLinecap='round'
            />
          )}

          {/* Compact Robot Torso with Medical Cross & Stethoscope Loop */}
          <path
            d='M35 88C35 84.6863 37.6863 82 41 82H79C82.3137 82 85 84.6863 85 88V102C85 107.523 80.5228 112 75 112H45C39.4772 112 35 107.523 35 102V88Z'
            fill='#F8FAFC'
            stroke='#CBD5E1'
            strokeWidth='3'
          />
          {/* Chest Medical Badge */}
          <circle cx='60' cy='97' r='9' fill='#EFF6FF' stroke='#BFDBFE' strokeWidth='2' />
          <path
            d='M58.5 92.5H61.5V95.5H64.5V98.5H61.5V101.5H58.5V98.5H55.5V95.5H58.5V92.5Z'
            fill={crossColor}
          />
        </svg>
      </div>

      {showStatusBadge && (
        <span
          className={`mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide border shadow-2xs ${
            isAlert
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : isHappy
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : isThinking
              ? 'bg-sky-50 text-sky-700 border-sky-200 animate-pulse'
              : isListening
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          <span
            className='w-1.5 h-1.5 rounded-full'
            style={{ backgroundColor: primaryGlow }}
          />
          <span>{statusLabel}</span>
        </span>
      )}
    </div>
  )
}

export default MedBotAvatar
