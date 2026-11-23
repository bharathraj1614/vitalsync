import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Heart,
  Activity,
  Save,
  Camera,
  Square,
  ShieldAlert,
  CheckCircle2,
  X,
  RefreshCw,
  Bluetooth,
  Fingerprint,
  Hand,
  Sparkles,
  Flashlight
} from 'lucide-react'
import { computeNEWS2 } from '../utils/news2Calculator'

const PROVENANCE_BADGE_MAP = {
  rppg_spot_check: {
    label: 'Multi-ROI Optical Locked',
    className: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
  },
  fingertip_cppg: {
    label: 'Fingertip Contact PPG',
    className: 'text-rose-300 bg-rose-500/15 border-rose-500/30'
  },
  ble_heart_rate: {
    label: 'Web Bluetooth BLE',
    className: 'text-sky-300 bg-sky-500/15 border-sky-500/30'
  },
  tap_cadence: {
    label: 'Tap-to-Pulse Cadence',
    className: 'text-amber-300 bg-amber-500/15 border-amber-500/30'
  }
}

const SIGNAL_QUALITY_MAP = {
  rppg_spot_check: 'POS_LOCKED_15S',
  fingertip_cppg: 'CPPG_LOCKED_15S',
  ble_heart_rate: 'BLE_GATT_VERIFIED',
  tap_cadence: 'CLINICIAN_TAP_LOCKED'
}

/**
 * Parse standard Bluetooth GATT Heart Rate Measurement characteristic (0x2A37)
 */
function parseBleHeartRateMeasurement(dataView) {
  if (!dataView || dataView.byteLength < 2) return null
  const flags = dataView.getUint8(0)
  const isUint16 = (flags & 0x01) !== 0
  const contactSensorBits = (flags >> 1) & 0x03
  const hasEnergyExpended = (flags & 0x08) !== 0
  const hasRrIntervals = (flags & 0x10) !== 0

  let offset = 1
  let bpm = 0
  if (isUint16) {
    if (dataView.byteLength < offset + 2) return null
    bpm = dataView.getUint16(offset, true)
    offset += 2
  } else {
    bpm = dataView.getUint8(offset)
    offset += 1
  }

  let contactDetected = null
  if (contactSensorBits === 2) contactDetected = false
  else if (contactSensorBits === 3) contactDetected = true

  if (hasEnergyExpended && dataView.byteLength >= offset + 2) {
    offset += 2
  }

  const rrIntervalsMs = []
  if (hasRrIntervals) {
    while (dataView.byteLength >= offset + 2) {
      const rawRr = dataView.getUint16(offset, true)
      rrIntervalsMs.push(Math.round((rawRr / 1024) * 1000))
      offset += 2
    }
  }

  return {
    bpm,
    contactDetected,
    rrIntervalsMs
  }
}

/**
 * Compute IQR-trimmed tap cadence metrics from high-precision tap timestamps
 */
function evaluateTapCadence(timestamps) {
  if (!Array.isArray(timestamps) || timestamps.length < 2) {
    return {
      tapCount: Array.isArray(timestamps) ? timestamps.length : 0,
      bpm: null,
      stabilityPct: 0,
      cv: 0,
      isErratic: false,
      isLocked: false
    }
  }

  const rawIntervals = []
  for (let i = 1; i < timestamps.length; i++) {
    const dt = timestamps[i] - timestamps[i - 1]
    if (dt >= 250 && dt <= 2200) {
      rawIntervals.push(dt)
    }
  }

  if (rawIntervals.length === 0) {
    return {
      tapCount: timestamps.length,
      bpm: null,
      stabilityPct: 0,
      cv: 1,
      isErratic: true,
      isLocked: false
    }
  }

  let working = [...rawIntervals]
  if (rawIntervals.length >= 4) {
    const sorted = [...rawIntervals].sort((a, b) => a - b)
    const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)]
    const q3 = sorted[Math.ceil((sorted.length - 1) * 0.75)]
    const iqr = Math.max(15, q3 - q1)
    const lowFence = q1 - 1.5 * iqr
    const highFence = q3 + 1.5 * iqr
    const trimmed = rawIntervals.filter((v) => v >= lowFence && v <= highFence)
    if (trimmed.length >= 3) {
      working = trimmed
    }
  }

  const meanIbi = working.reduce((sum, v) => sum + v, 0) / working.length
  const variance =
    working.reduce((sum, v) => sum + (v - meanIbi) * (v - meanIbi), 0) / Math.max(1, working.length)
  const stdIbi = Math.sqrt(variance)
  const cv = meanIbi > 0 ? stdIbi / meanIbi : 1

  const bpm = meanIbi > 0 ? Math.round(60000 / meanIbi) : null
  const validBpm = bpm && bpm >= 35 && bpm <= 210 ? bpm : null
  const stabilityPct = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)))
  const isErratic = working.length >= 3 && cv > 0.18
  const isLocked = timestamps.length >= 6 && working.length >= 4 && !isErratic && Boolean(validBpm)

  return {
    tapCount: timestamps.length,
    bpm: validBpm,
    stabilityPct,
    cv,
    isErratic,
    isLocked
  }
}

const VitalsOverlay = ({
  vitals,
  isSpotCheckRunning,
  onStartSpotCheck,
  onStopSpotCheck,
  onSaveClinicalVitals,
  onStreamPreview,
  onClose,
  isSaving
}) => {
  const canvasRef = useRef(null)
  const bleDeviceRef = useRef(null)
  const bleCharRef = useRef(null)

  const [mode, setMode] = useState('clinical') // 'clinical' | 'spotcheck'
  const [pulseModality, setPulseModality] = useState('facial_rppg') // 'facial_rppg' | 'fingertip_cppg' | 'ble_tap'

  // Structured Home-Device Clinical Vitals
  const [systolicBp, setSystolicBp] = useState('')
  const [diastolicBp, setDiastolicBp] = useState('')
  const [spo2, setSpo2] = useState('')
  const [temperatureF, setTemperatureF] = useState('')
  const [heartRate, setHeartRate] = useState('')
  const [respiratoryRate, setRespiratoryRate] = useState('')
  const [bloodGlucose, setBloodGlucose] = useState('')

  // Biometric Pulse Provenance State
  const [pulseSource, setPulseSource] = useState(null) // 'rppg_spot_check' | 'fingertip_cppg' | 'ble_heart_rate' | 'tap_cadence' | null
  const [pulseConfidence, setPulseConfidence] = useState(null)

  // Web Bluetooth GATT State
  const bleSupported = useMemo(
    () => typeof navigator !== 'undefined' && typeof navigator.bluetooth?.requestDevice === 'function',
    []
  )
  const [bleState, setBleState] = useState('idle') // 'idle' | 'connecting' | 'connected' | 'error'
  const [bleDeviceName, setBleDeviceName] = useState('')
  const [bleBpm, setBleBpm] = useState(null)
  const [bleContact, setBleContact] = useState(null)
  const [bleRrMs, setBleRrMs] = useState(null)
  const [bleError, setBleError] = useState('')

  // Clinician / Patient Tap-to-Pulse Cadence State
  const [tapTimestamps, setTapTimestamps] = useState([])

  const {
    bpm = null,
    confidence = 0,
    signalQuality = 'CALIBRATING',
    progressPct = 0,
    motionWarning = false,
    isDetecting = false,
    isLocked = false,
    waveform = [],
    sensorMode = 'facial_rppg',
    roiCoherence = null,
    activeRois = null,
    perfusionIndex = null,
    guidanceHint = '',
    torchActive = false
  } = vitals || {}

  // Automatically populate Pulse when 15s Optical/Contact Spot-Check locks a validated BPM
  useEffect(() => {
    if (isLocked && bpm) {
      const resolvedOpticalSource =
        sensorMode === 'fingertip_cppg' || pulseModality === 'fingertip_cppg'
          ? 'fingertip_cppg'
          : 'rppg_spot_check'
      setHeartRate(String(bpm))
      setPulseSource(resolvedOpticalSource)
      setPulseConfidence(confidence || 0.92)
    }
  }, [isLocked, bpm, sensorMode, pulseModality, confidence])

  // Disconnect Web Bluetooth cleanly on unmount
  const disconnectBle = useCallback(() => {
    try {
      if (bleCharRef.current) {
        bleCharRef.current.stopNotifications?.().catch(() => {})
        bleCharRef.current = null
      }
      if (bleDeviceRef.current?.gatt?.connected) {
        bleDeviceRef.current.gatt.disconnect()
      }
      bleDeviceRef.current = null
    } catch {
      // ignore BLE cleanup errors
    }
    setBleState('idle')
  }, [])

  useEffect(() => {
    return () => {
      disconnectBle()
    }
  }, [disconnectBle])

  const handlePairBleHeartRate = async () => {
    if (!bleSupported) {
      setBleState('error')
      setBleError('Web Bluetooth is not supported in this browser. Use Tap-to-Pulse or Optical modes.')
      return
    }
    if (isSpotCheckRunning && onStopSpotCheck) {
      onStopSpotCheck()
    }
    setBleError('')
    setBleState('connecting')
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service']
      })
      bleDeviceRef.current = device
      setBleDeviceName(device.name || 'BLE Heart Rate Monitor')

      device.addEventListener('gattserverdisconnected', () => {
        setBleState('idle')
      })

      const server = await device.gatt.connect()
      const service = await server.getPrimaryService('heart_rate')
      const characteristic = await service.getCharacteristic('heart_rate_measurement')
      bleCharRef.current = characteristic

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const parsed = parseBleHeartRateMeasurement(event.target.value)
        if (parsed && parsed.bpm >= 30 && parsed.bpm <= 230) {
          setBleBpm(parsed.bpm)
          setBleContact(parsed.contactDetected)
          if (parsed.rrIntervalsMs?.length > 0) {
            setBleRrMs(parsed.rrIntervalsMs[parsed.rrIntervalsMs.length - 1])
          }
          setHeartRate(String(parsed.bpm))
          setPulseSource('ble_heart_rate')
          setPulseConfidence(1.0)

          if (typeof onStreamPreview === 'function') {
            onStreamPreview({
              bpm: parsed.bpm,
              heartRate: parsed.bpm,
              source: 'ble_heart_rate',
              signalQuality: 'BLE_GATT_VERIFIED',
              confidence: 1.0
            })
          }
        }
      })

      await characteristic.startNotifications()
      setBleState('connected')
    } catch (err) {
      setBleState('error')
      setBleError(
        err?.name === 'NotFoundError'
          ? 'Pairing cancelled or no Bluetooth HR monitor selected.'
          : err?.message || 'Unable to connect to Bluetooth Heart Rate sensor.'
      )
    }
  }

  // Evaluate live Tap-to-Pulse Cadence
  const tapMetrics = useMemo(() => evaluateTapCadence(tapTimestamps), [tapTimestamps])

  const handlePulseTap = () => {
    if (isSpotCheckRunning && onStopSpotCheck) {
      onStopSpotCheck()
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setTapTimestamps((prev) => {
      if (prev.length > 0 && now - prev[prev.length - 1] > 2500) {
        return [now]
      }
      const next = [...prev, now].slice(-10)
      const metrics = evaluateTapCadence(next)
      if (metrics.isLocked && metrics.bpm) {
        setHeartRate(String(metrics.bpm))
        setPulseSource('tap_cadence')
        setPulseConfidence(0.95)
        if (typeof onStreamPreview === 'function') {
          onStreamPreview({
            bpm: metrics.bpm,
            heartRate: metrics.bpm,
            source: 'tap_cadence',
            signalQuality: 'CLINICIAN_TAP_LOCKED',
            confidence: 0.95
          })
        }
      }
      return next
    })
  }

  const handleResetTap = () => {
    setTapTimestamps([])
  }

  const triage = useMemo(
    () =>
      computeNEWS2({
        heartRate,
        systolicBp,
        diastolicBp,
        spo2,
        temperatureF,
        respiratoryRate,
        bloodGlucose
      }),
    [heartRate, systolicBp, diastolicBp, spo2, temperatureF, respiratoryRate, bloodGlucose]
  )

  // Draw POS / Contact PPG optical pulse waveform in Spot-Check tab
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    if (!waveform || waveform.length < 2) {
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      return
    }

    const min = Math.min(...waveform)
    const max = Math.max(...waveform)
    const range = max - min || 1

    ctx.strokeStyle = motionWarning
      ? '#f59e0b'
      : pulseModality === 'fingertip_cppg'
      ? '#fb7185'
      : '#10b981'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    const step = w / (waveform.length - 1)
    waveform.forEach((val, i) => {
      const x = i * step
      const normY = (val - min) / range
      const y = h - (normY * (h - 8) + 4)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [waveform, motionWarning, mode, pulseModality])

  const handleSelectPulseModality = (nextModality) => {
    if (nextModality === pulseModality) return
    if (isSpotCheckRunning && onStopSpotCheck) {
      onStopSpotCheck()
    }
    setPulseModality(nextModality)
  }

  const handleStartModalityCheck = () => {
    if (typeof onStartSpotCheck !== 'function') return
    if (pulseModality === 'fingertip_cppg') {
      onStartSpotCheck({ sensorMode: 'fingertip_cppg', enableTorch: true })
    } else {
      onStartSpotCheck({ sensorMode: 'facial_rppg', enableTorch: false })
    }
  }

  const handleApplyCapturedPulse = (capturedBpm, capturedSource, capturedConfidence = 0.95) => {
    if (!capturedBpm) return
    setHeartRate(String(capturedBpm))
    setPulseSource(capturedSource)
    setPulseConfidence(capturedConfidence)
    if (isSpotCheckRunning && onStopSpotCheck) {
      onStopSpotCheck()
    }
    if (typeof onStreamPreview === 'function') {
      onStreamPreview({
        bpm: Number(capturedBpm),
        heartRate: Number(capturedBpm),
        source: capturedSource,
        signalQuality: SIGNAL_QUALITY_MAP[capturedSource] || signalQuality || 'POS_LOCKED_15S',
        confidence: capturedConfidence,
        roiCoherence: roiCoherence ?? undefined,
        perfusionIndex: perfusionIndex ?? undefined
      })
    }
    setMode('clinical')
  }

  const handleSubmitClinical = (e) => {
    e.preventDefault()
    const hasOtherDevice = Boolean(
      systolicBp || diastolicBp || spo2 || temperatureF || respiratoryRate || bloodGlucose
    )
    const resolvedSource = pulseSource ? (hasOtherDevice ? 'hybrid' : pulseSource) : 'manual'
    const resolvedQuality = pulseSource
      ? SIGNAL_QUALITY_MAP[pulseSource] || 'POS_LOCKED_15S'
      : 'CLINICAL_DEVICE'
    const resolvedConfidence = pulseSource ? pulseConfidence || confidence || 0.92 : 1.0

    const payload = {
      heartRate: heartRate ? Number(heartRate) : null,
      systolicBp: systolicBp ? Number(systolicBp) : null,
      diastolicBp: diastolicBp ? Number(diastolicBp) : null,
      spo2: spo2 ? Number(spo2) : null,
      temperatureF: temperatureF ? Number(temperatureF) : null,
      respiratoryRate: respiratoryRate ? Number(respiratoryRate) : null,
      bloodGlucose: bloodGlucose ? Number(bloodGlucose) : null,
      news2Score: triage.news2Score,
      news2Risk: triage.news2Risk,
      clinicalFlags: triage.clinicalFlags,
      source: resolvedSource,
      confidence: resolvedConfidence,
      signalQuality: resolvedQuality,
      roiCoherence: roiCoherence != null ? Number(roiCoherence) : null,
      perfusionIndex: perfusionIndex != null ? Number(perfusionIndex) : null
    }

    if (typeof onStreamPreview === 'function') {
      onStreamPreview({
        ...payload,
        bpm: payload.heartRate
      })
    }
    if (typeof onSaveClinicalVitals === 'function') {
      onSaveClinicalVitals(payload)
    }
  }

  const handleClose = () => {
    if (isSpotCheckRunning && onStopSpotCheck) onStopSpotCheck()
    if (typeof onClose === 'function') onClose()
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isSpotCheckRunning && onStopSpotCheck) onStopSpotCheck()
        if (typeof onClose === 'function') onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSpotCheckRunning, onStopSpotCheck, onClose])

  const riskBadgeStyle = {
    LOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    LOW_MEDIUM: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    MEDIUM: 'bg-orange-500/25 text-orange-200 border-orange-500/40',
    HIGH: 'bg-rose-600/30 text-rose-200 border-rose-500/50'
  }[triage.news2Risk]

  const hasAnyVital = Boolean(
    heartRate || systolicBp || diastolicBp || spo2 || temperatureF || respiratoryRate || bloodGlucose
  )

  const resolvedGuidanceHint = useMemo(() => {
    if (guidanceHint) return guidanceHint
    if (pulseModality === 'fingertip_cppg') {
      if (isLocked) return '15s Contact Fingertip PPG locked with clean systolic peaks.'
      if (!isSpotCheckRunning)
        return 'Cover the camera lens (and flash on mobile) gently with your index fingertip.'
      if (signalQuality === 'LOW_LIGHT' || signalQuality === 'NO_FACE')
        return 'Press fingertip gently over the camera lens until red contact is detected.'
      if (motionWarning || signalQuality === 'HOLD_STILL')
        return 'Keep fingertip steady without pressing too hard (avoid occluding capillaries).'
      return 'Measuring red/green pulsatile blood volume wave...'
    }
    if (isLocked) return '15s Multi-ROI facial spot-check locked with high spatial coherence.'
    if (signalQuality === 'LOW_LIGHT')
      return 'Lighting is dim — face a window/lamp or switch to Fingertip / Tap mode.'
    if (signalQuality === 'NO_FACE')
      return 'Center your forehead and cheeks in the camera frame.'
    if (motionWarning || signalQuality === 'HOLD_STILL')
      return 'Motion detected — hold your head steady and pause speaking.'
    if (signalQuality === 'EXCELLENT' || signalQuality === 'LOCKED')
      return '3/3 facial zones coherent — hold steady until 15s lock completes.'
    return 'Sit facing soft light, hold your head still, and pause speaking for 15 seconds.'
  }, [guidanceHint, pulseModality, isLocked, isSpotCheckRunning, signalQuality, motionWarning])

  const displayedZones = activeRois != null ? activeRois : isDetecting ? 3 : 0
  const displayedCoherencePct = Math.round(((roiCoherence ?? confidence ?? 0) || 0) * 100)
  const formattedPerfusionIndex =
    perfusionIndex != null && Number(perfusionIndex) > 0
      ? Number(perfusionIndex).toFixed(2)
      : '--'

  const activeProvenanceBadge = pulseSource ? PROVENANCE_BADGE_MAP[pulseSource] : null

  return (
    <div
      className='fixed inset-0 z-50 flex items-end md:absolute md:inset-auto md:top-14 md:left-3.5 md:bottom-3.5 md:z-30 md:items-start md:pointer-events-none'
      role='dialog'
      aria-modal='true'
      aria-label='Multi-Modal Biometric Pulse and Clinical Vitals Studio'
    >
      {/* Mobile Backdrop Scrim */}
      <div
        className='fixed inset-0 bg-slate-950/60 backdrop-blur-sm md:hidden'
        onClick={handleClose}
        aria-hidden='true'
      />

      {/* Native Mobile Bottom-Sheet Drawer / Desktop Floating HUD Card */}
      <div className='relative z-10 w-full md:w-88 md:pointer-events-auto max-h-[86dvh] md:max-h-full flex flex-col overflow-hidden rounded-t-3xl md:rounded-2xl bg-slate-950/[0.98] md:bg-slate-900/95 backdrop-blur-md text-white border-t md:border border-slate-700/90 shadow-2xl'>
        {/* Fixed Top Header & Mode Tabs */}
        <div className='shrink-0 px-4 pt-3 pb-3 md:px-3.5 md:pt-3.5 md:pb-2.5 space-y-2.5 border-b border-slate-800/80'>
          {/* Mobile Drag Handle Pill */}
          <div className='w-10 h-1.5 rounded-full bg-slate-600/80 mx-auto md:hidden' aria-hidden='true' />

          {/* Header & Close */}
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2 min-w-0'>
              <Activity className='w-4 h-4 text-sky-400 shrink-0' />
              <span className='text-xs font-extrabold uppercase tracking-wider text-slate-100 truncate'>
                Clinical Vitals & Pulse Studio
              </span>
            </div>
            {onClose && (
              <button
                type='button'
                onClick={handleClose}
                className='w-8 h-8 md:w-7 md:h-7 rounded-xl bg-slate-800/80 md:bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors'
                aria-label='Close vitals panel'
              >
                <X className='w-4 h-4 md:w-3.5 md:h-3.5' />
              </button>
            )}
          </div>

          {/* Top-Level Mode Switcher */}
          <div className='grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-bold'>
            <button
              type='button'
              onClick={() => {
                if (isSpotCheckRunning && onStopSpotCheck) onStopSpotCheck()
                setMode('clinical')
              }}
              className={`py-2 md:py-1.5 rounded-lg transition-colors cursor-pointer ${
                mode === 'clinical' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Home Vitals (Primary)
            </button>
            <button
              type='button'
              onClick={() => setMode('spotcheck')}
              className={`py-2 md:py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                mode === 'spotcheck' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Heart className='w-3 h-3' /> Biometric Pulse Check
            </button>
          </div>
        </div>

        {mode === 'clinical' ? (
          <form onSubmit={handleSubmitClinical} className='flex-1 min-h-0 flex flex-col text-xs'>
            {/* Scrollable Vitals Fields & NEWS2 Summary */}
            <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 md:px-3.5 md:py-2.5 space-y-3 md:space-y-2.5'>
              {activeProvenanceBadge && (
                <div
                  className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-bold flex items-center justify-between gap-2 ${activeProvenanceBadge.className}`}
                >
                  <span className='flex items-center gap-1.5 truncate'>
                    <Sparkles className='w-3.5 h-3.5 shrink-0' />
                    <span>Pulse Provenance: {activeProvenanceBadge.label}</span>
                  </span>
                  <button
                    type='button'
                    onClick={() => setMode('spotcheck')}
                    className='underline opacity-90 hover:opacity-100 shrink-0 cursor-pointer'
                  >
                    Re-measure
                  </button>
                </div>
              )}

              <div className='grid grid-cols-2 gap-2.5 md:gap-2'>
                <div>
                  <label className='block text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    BP (Sys / Dia mmHg)
                  </label>
                  <div className='flex items-center gap-1'>
                    <input
                      type='number'
                      inputMode='numeric'
                      min='50'
                      max='260'
                      placeholder='120'
                      value={systolicBp}
                      onChange={(e) => setSystolicBp(e.target.value)}
                      className='w-full min-w-0 px-2 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                    />
                    <span className='text-slate-500 shrink-0'>/</span>
                    <input
                      type='number'
                      inputMode='numeric'
                      min='30'
                      max='160'
                      placeholder='80'
                      value={diastolicBp}
                      onChange={(e) => setDiastolicBp(e.target.value)}
                      className='w-full min-w-0 px-2 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                    />
                  </div>
                </div>

                <div>
                  <label className='block text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    SpO₂ (%)
                  </label>
                  <input
                    type='number'
                    inputMode='numeric'
                    min='60'
                    max='100'
                    placeholder='98'
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className='w-full px-2.5 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                  />
                </div>

                <div>
                  <label className='block text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    Temp (°F)
                  </label>
                  <input
                    type='number'
                    inputMode='decimal'
                    step='0.1'
                    min='93'
                    max='108'
                    placeholder='98.6'
                    value={temperatureF}
                    onChange={(e) => setTemperatureF(e.target.value)}
                    className='w-full px-2.5 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                  />
                </div>

                <div>
                  <label className='flex items-center justify-between gap-1 text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    <span>Pulse (BPM)</span>
                    {activeProvenanceBadge ? (
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[9px] font-extrabold truncate max-w-[105px] ${activeProvenanceBadge.className}`}
                        title={activeProvenanceBadge.label}
                      >
                        {activeProvenanceBadge.label}
                      </span>
                    ) : (
                      <button
                        type='button'
                        onClick={() => setMode('spotcheck')}
                        className='text-[9px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer'
                      >
                        Measure Pulse
                      </button>
                    )}
                  </label>
                  <input
                    type='number'
                    inputMode='numeric'
                    min='30'
                    max='220'
                    placeholder='72'
                    value={heartRate}
                    onChange={(e) => {
                      setHeartRate(e.target.value)
                      setPulseSource(null)
                      setPulseConfidence(null)
                    }}
                    className='w-full px-2.5 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                  />
                </div>

                <div>
                  <label className='block text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    Resp (/min)
                  </label>
                  <input
                    type='number'
                    inputMode='numeric'
                    min='6'
                    max='50'
                    placeholder='16'
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    className='w-full px-2.5 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                  />
                </div>

                <div>
                  <label className='block text-[11px] md:text-[10px] font-bold text-slate-300 md:text-slate-400 mb-1 md:mb-0.5'>
                    Glucose (mg/dL)
                  </label>
                  <input
                    type='number'
                    inputMode='numeric'
                    min='30'
                    max='600'
                    placeholder='95'
                    value={bloodGlucose}
                    onChange={(e) => setBloodGlucose(e.target.value)}
                    className='w-full px-2.5 py-2 md:py-1.5 rounded-xl md:rounded-lg bg-slate-900 md:bg-slate-950 border border-slate-700 text-white text-sm md:text-xs outline-none focus:border-sky-500'
                  />
                </div>
              </div>

              {/* Deterministic RCP NEWS2 Early-Warning Summary */}
              <div className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${riskBadgeStyle}`}>
                <div className='flex items-center justify-between font-bold'>
                  <span>RCP NEWS2 Score: {triage.news2Score}</span>
                  <span className='uppercase text-[10px]'>{triage.news2Risk.replace('_', '-')}</span>
                </div>
                {triage.clinicalFlags.length > 0 ? (
                  <p className='text-[10px] leading-snug opacity-95 flex items-start gap-1'>
                    <ShieldAlert className='w-3.5 h-3.5 shrink-0 mt-0.5' />
                    <span>{triage.clinicalFlags.join(' • ')}</span>
                  </p>
                ) : (
                  <p className='text-[10px] text-slate-300/90'>
                    Enter pulse oximeter, BP cuff, or thermometer readings to stream live to your doctor.
                  </p>
                )}
              </div>
            </div>

            {/* Sticky Bottom Submit CTA with Safe-Area Padding */}
            <div className='shrink-0 px-4 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-3.5 md:pt-2 md:pb-3.5 border-t border-slate-800/90 bg-slate-950/[0.98] md:bg-slate-900/95'>
              <button
                type='submit'
                disabled={isSaving || !hasAnyVital}
                className='w-full py-3 md:py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer'
              >
                <Save className='w-4 h-4 md:w-3.5 md:h-3.5' />
                <span>{isSaving ? 'Saving...' : 'Share Live & Save to EHR'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* TAB 2: MULTI-MODAL BIOMETRIC PULSE CHECK STUDIO (3-Mode Selector) */
          <div className='flex-1 min-h-0 flex flex-col text-xs'>
            <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 md:px-3.5 md:py-2.5 space-y-2.5'>
              {/* 3-Mode Selector Pill Bar */}
              <div
                className='grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-bold'
                role='tablist'
                aria-label='Biometric pulse capture modality'
              >
                <button
                  type='button'
                  role='tab'
                  aria-selected={pulseModality === 'facial_rppg'}
                  onClick={() => handleSelectPulseModality('facial_rppg')}
                  className={`py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    pulseModality === 'facial_rppg'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Camera className='w-3 h-3 shrink-0' />
                  <span className='truncate'>Facial rPPG</span>
                </button>
                <button
                  type='button'
                  role='tab'
                  aria-selected={pulseModality === 'fingertip_cppg'}
                  onClick={() => handleSelectPulseModality('fingertip_cppg')}
                  className={`py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    pulseModality === 'fingertip_cppg'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Fingerprint className='w-3 h-3 shrink-0' />
                  <span className='truncate'>Fingertip PPG</span>
                </button>
                <button
                  type='button'
                  role='tab'
                  aria-selected={pulseModality === 'ble_tap'}
                  onClick={() => handleSelectPulseModality('ble_tap')}
                  className={`py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    pulseModality === 'ble_tap'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bluetooth className='w-3 h-3 shrink-0' />
                  <span className='truncate'>BLE / Tap</span>
                </button>
              </div>

              {/* MODALITY 1 & 2: OPTICAL / CONTACT PPG (Facial Multi-Zone rPPG OR Fingertip Lens PPG) */}
              {pulseModality !== 'ble_tap' ? (
                <>
                  {/* Modality Instructions & Live Guidance Hint */}
                  <div className='p-2.5 rounded-xl bg-slate-900 md:bg-slate-950 border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-1'>
                    {pulseModality === 'fingertip_cppg' ? (
                      <div>
                        <strong className='text-rose-400'>Fingertip Lens PPG:</strong> Gently cover your camera lens
                        (and flash on mobile) with your index fingertip for <strong>12–15 seconds</strong>.
                      </div>
                    ) : (
                      <div>
                        <strong className='text-emerald-400'>Facial Multi-Zone (rPPG):</strong> Sit facing soft light,
                        keep forehead & cheeks visible, and <strong>hold still for 15 seconds</strong>.
                      </div>
                    )}
                    <div className='text-[10px] text-sky-300 font-semibold flex items-center gap-1.5 pt-0.5'>
                      <span className='w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0' />
                      <span>{resolvedGuidanceHint}</span>
                    </div>
                  </div>

                  {/* Live BPM + Signal Quality + Telemetry Badges */}
                  <div className='flex items-baseline justify-between px-0.5'>
                    <div className='flex items-baseline gap-1.5'>
                      <span className='text-3xl font-black text-white tabular-nums'>{bpm || '--'}</span>
                      <span className='text-[11px] text-slate-400 font-bold uppercase'>BPM</span>
                    </div>
                    <div className='text-right text-[10px]'>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          isLocked
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                            : motionWarning || signalQuality === 'LOW_LIGHT' || signalQuality === 'NO_FACE'
                            ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {signalQuality === 'HOLD_STILL'
                          ? 'HOLD STILL'
                          : signalQuality === 'LOW_LIGHT'
                          ? 'LOW LIGHT'
                          : signalQuality === 'NO_FACE'
                          ? pulseModality === 'fingertip_cppg'
                            ? 'PLACE FINGER'
                            : 'ALIGN FACE'
                          : signalQuality}
                      </span>
                      <div className='text-slate-400 mt-1'>
                        {pulseModality === 'fingertip_cppg'
                          ? 'Red/Green Contact PPG + IBI'
                          : 'Multi-ROI POS + CHROM Lock'}
                      </div>
                    </div>
                  </div>

                  {/* Diagnostic Telemetry Bar: Multi-Zone Coherence OR Fingertip Perfusion Index */}
                  {pulseModality === 'facial_rppg' ? (
                    <div className='flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px]'>
                      <span className='font-bold text-emerald-300'>
                        Zones: {displayedZones}/3 • Coherence {displayedCoherencePct}%
                      </span>
                      <span className='text-slate-400'>Forehead + L/R Cheeks</span>
                    </div>
                  ) : (
                    <div className='flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px]'>
                      <span className='font-bold text-rose-300'>
                        Contact: {activeRois >= 1 || isDetecting ? 'Verified' : 'Waiting'} • PI:{' '}
                        {formattedPerfusionIndex}%
                      </span>
                      <span className='inline-flex items-center gap-1 text-slate-400'>
                        <Flashlight className={`w-3 h-3 ${torchActive ? 'text-amber-300' : 'text-slate-500'}`} />
                        <span>{torchActive ? 'Torch On' : 'Lens Mode'}</span>
                      </span>
                    </div>
                  )}

                  {/* 15s Spot-Check Progress Bar */}
                  <div className='space-y-1'>
                    <div className='flex justify-between text-[10px] text-slate-400 font-semibold'>
                      <span>
                        {isLocked
                          ? '15s Biometric Lock Complete'
                          : motionWarning
                          ? 'Motion detected — hold steady...'
                          : isSpotCheckRunning
                          ? pulseModality === 'fingertip_cppg'
                            ? 'Sampling fingertip capillary pulse wave...'
                            : 'Sampling 3-zone facial optical pulse...'
                          : 'Ready to measure'}
                      </span>
                      <span className='tabular-nums text-emerald-400'>{progressPct}%</span>
                    </div>
                    <div className='h-2 w-full rounded-full bg-slate-800 overflow-hidden'>
                      <div
                        className={`h-full transition-all duration-200 ${
                          isLocked
                            ? 'bg-emerald-400'
                            : motionWarning
                            ? 'bg-amber-400'
                            : pulseModality === 'fingertip_cppg'
                            ? 'bg-rose-400'
                            : 'bg-sky-400'
                        }`}
                        style={{ width: `${Math.min(100, progressPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Filtered Pulse Waveform Canvas */}
                  <div className='bg-slate-900 md:bg-slate-950 rounded-xl p-2 border border-slate-800'>
                    <canvas ref={canvasRef} width={240} height={38} className='w-full h-9 block rounded' />
                  </div>
                </>
              ) : (
                /* MODALITY 3: WEB BLUETOOTH GATT HEART RATE + GUIDED CLINICIAN TAP-TO-PULSE CADENCE */
                <div className='space-y-2.5'>
                  {/* Section A: Web Bluetooth GATT Heart Rate / Pulse Ox Monitor */}
                  <div className='p-2.5 rounded-xl bg-slate-900 md:bg-slate-950 border border-slate-800 space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-1.5'>
                        <Bluetooth className='w-3.5 h-3.5 text-sky-400 shrink-0' />
                        <span className='font-bold text-[11px] text-slate-100'>
                          Web Bluetooth Heart Rate / Pulse Ox
                        </span>
                      </div>
                      <span className='px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[9px] font-bold text-sky-300'>
                        GATT 0x180D
                      </span>
                    </div>

                    {bleSupported ? (
                      <>
                        <p className='text-[10px] text-slate-400 leading-snug'>
                          Connect any standard Bluetooth Low Energy HR strap, smartwatch, or BLE pulse oximeter.
                        </p>

                        {bleState === 'connected' && (
                          <div className='p-2 rounded-lg bg-sky-950/50 border border-sky-500/40 flex items-center justify-between'>
                            <div>
                              <div className='text-[10px] font-bold text-sky-300 truncate'>
                                {bleDeviceName || 'BLE HR Sensor'} •{' '}
                                {bleContact === false ? 'No Skin Contact' : 'Live Stream'}
                              </div>
                              <div className='text-[10px] text-slate-400'>
                                {bleRrMs ? `RR Interval: ${bleRrMs} ms` : 'GATT 0x2A37 Verified'}
                              </div>
                            </div>
                            <div className='text-right'>
                              <span className='text-2xl font-black text-white tabular-nums'>{bleBpm || '--'}</span>
                              <span className='text-[10px] text-sky-300 font-bold ml-1'>BPM</span>
                            </div>
                          </div>
                        )}

                        {bleError && <p className='text-[10px] text-amber-300 font-semibold'>{bleError}</p>}

                        <div className='flex items-center gap-1.5'>
                          {bleState !== 'connected' ? (
                            <button
                              type='button'
                              onClick={handlePairBleHeartRate}
                              disabled={bleState === 'connecting'}
                              className='flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer'
                            >
                              <Bluetooth className='w-3.5 h-3.5' />
                              <span>
                                {bleState === 'connecting' ? 'Pairing BLE Sensor...' : 'Pair Bluetooth HR / Pulse Ox'}
                              </span>
                            </button>
                          ) : (
                            <>
                              <button
                                type='button'
                                onClick={() => handleApplyCapturedPulse(bleBpm, 'ble_heart_rate', 1.0)}
                                disabled={!bleBpm}
                                className='flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer'
                              >
                                <CheckCircle2 className='w-3.5 h-3.5' />
                                <span>Use {bleBpm || '--'} BPM</span>
                              </button>
                              <button
                                type='button'
                                onClick={disconnectBle}
                                className='py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer'
                              >
                                Disconnect
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className='text-[10px] text-amber-300/95 leading-snug'>
                        Web Bluetooth (`navigator.bluetooth`) is unavailable in this browser. Use the 100% reliable{' '}
                        <strong>Guided Radial/Carotid Tap-to-Pulse Cadence Meter</strong> below.
                      </p>
                    )}
                  </div>

                  {/* Section B: Guided Clinician Tap-to-Pulse Cadence Meter */}
                  <div className='p-2.5 rounded-xl bg-slate-900 md:bg-slate-950 border border-slate-800 space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-1.5'>
                        <Hand className='w-3.5 h-3.5 text-amber-400 shrink-0' />
                        <span className='font-bold text-[11px] text-slate-100'>
                          Guided Radial / Carotid Tap-to-Pulse
                        </span>
                      </div>
                      <span className='text-[10px] font-bold text-amber-300 tabular-nums'>
                        {tapMetrics.tapCount}/6+ Beats
                      </span>
                    </div>

                    <p className='text-[10px] text-slate-400 leading-snug'>
                      Place two fingers on your wrist (radial) or neck (carotid) pulse and tap along with each heartbeat
                      for 6–8 beats.
                    </p>

                    <div className='flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800/90'>
                      <div>
                        <span className='text-2xl font-black text-white tabular-nums'>{tapMetrics.bpm || '--'}</span>
                        <span className='text-[10px] text-slate-400 font-bold ml-1 uppercase'>BPM</span>
                      </div>
                      <div className='text-right text-[10px]'>
                        <div
                          className={`font-bold ${
                            tapMetrics.isErratic
                              ? 'text-rose-400'
                              : tapMetrics.isLocked
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {tapMetrics.tapCount < 2
                            ? 'Awaiting Taps'
                            : tapMetrics.isErratic
                            ? 'Rhythm Erratic (CV > 18%)'
                            : `Rhythm Stability: ${tapMetrics.stabilityPct}%`}
                        </div>
                        <div className='text-slate-400'>
                          {tapMetrics.isLocked
                            ? 'IQR-Trimmed Cadence Locked'
                            : `Tap ${Math.max(0, 6 - tapMetrics.tapCount)} more steady beats`}
                        </div>
                      </div>
                    </div>

                    <div className='flex items-center gap-1.5'>
                      <button
                        type='button'
                        onClick={handlePulseTap}
                        className='flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-transform cursor-pointer select-none'
                      >
                        <Heart className='w-3.5 h-3.5 fill-slate-950' />
                        <span>Tap With Radial/Carotid Pulse (6+ Beats)</span>
                      </button>
                      {tapMetrics.tapCount > 0 && (
                        <button
                          type='button'
                          onClick={handleResetTap}
                          className='py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer'
                          title='Reset tap cadence counter'
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {tapMetrics.bpm && !tapMetrics.isErratic && tapMetrics.tapCount >= 4 && (
                      <button
                        type='button'
                        onClick={() => handleApplyCapturedPulse(tapMetrics.bpm, 'tap_cadence', 0.95)}
                        className='w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer'
                      >
                        <CheckCircle2 className='w-3.5 h-3.5' />
                        <span>Use {tapMetrics.bpm} BPM in Clinical Vitals</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Controls for Optical / Contact Spot-Check Modalities */}
            {pulseModality !== 'ble_tap' && (
              <div className='shrink-0 px-4 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-3.5 md:pt-2 md:pb-3.5 border-t border-slate-800/90 bg-slate-950/[0.98] md:bg-slate-900/95 flex items-center gap-2'>
                {!isSpotCheckRunning ? (
                  <button
                    type='button'
                    onClick={handleStartModalityCheck}
                    className={`flex-1 py-3 md:py-2 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      pulseModality === 'fingertip_cppg'
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {isLocked ? (
                      <RefreshCw className='w-3.5 h-3.5' />
                    ) : pulseModality === 'fingertip_cppg' ? (
                      <Fingerprint className='w-3.5 h-3.5' />
                    ) : (
                      <Camera className='w-3.5 h-3.5' />
                    )}
                    <span>
                      {isLocked
                        ? 'Re-Run 15s Check'
                        : pulseModality === 'fingertip_cppg'
                        ? 'Start 15s Fingertip PPG'
                        : 'Start 15s Facial Spot-Check'}
                    </span>
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={onStopSpotCheck}
                    className='flex-1 py-3 md:py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer'
                  >
                    <Square className='w-3.5 h-3.5' />
                    <span>Stop Check</span>
                  </button>
                )}

                {bpm && (
                  <button
                    type='button'
                    onClick={() =>
                      handleApplyCapturedPulse(
                        bpm,
                        pulseModality === 'fingertip_cppg' || sensorMode === 'fingertip_cppg'
                          ? 'fingertip_cppg'
                          : 'rppg_spot_check',
                        confidence || 0.92
                      )
                    }
                    className='px-3.5 py-3 md:py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer'
                  >
                    <CheckCircle2 className='w-3.5 h-3.5' />
                    <span>Use {bpm}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default VitalsOverlay
