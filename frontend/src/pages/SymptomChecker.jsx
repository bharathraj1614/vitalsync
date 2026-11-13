import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { calculateProfileCompleteness } from '../utils/profileCompleteness'
import MedBotAvatar from '../components/MedBotAvatar'
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Stethoscope,
  ArrowRight,
  Send,
  RotateCcw,
  UserCheck,
  Pill,
  ChevronRight,
  ClipboardList
} from 'lucide-react'

const formatSpeciality = (spec = '') => {
  const s = spec.trim()
  if (s.toLowerCase() === 'general physician') return 'General Physician'
  if (s.toLowerCase() === 'pediatricians') return 'Pediatrician'
  return s
}

const formatMedicationList = (meds = []) => {
  if (!Array.isArray(meds)) return ''
  return meds
    .map((med) => {
      if (typeof med === 'string') return med.trim()
      if (!med || typeof med !== 'object') return ''
      const name = String(med.name || med.medication || '').trim()
      if (!name) return ''
      const dosage = String(med.dosage || '').trim()
      return dosage ? `${name} (${dosage})` : name
    })
    .filter(Boolean)
    .join(', ')
}

const getUrgencyConfig = (level) => {
  switch (level) {
    case 'high':
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        dot: 'bg-rose-500',
        label: 'Urgent Care Needed',
        icon: AlertTriangle
      }
    case 'medium':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        dot: 'bg-amber-500',
        label: 'Consult Soon',
        icon: Clock
      }
    case 'low':
    default:
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        dot: 'bg-emerald-500',
        label: 'Routine Visit',
        icon: CheckCircle2
      }
  }
}

/**
 * Compact, unobtrusive topic confirmation pill with optional inline switcher
 */
export const UnderstoodConfirmationBar = ({ understood, onOverride, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false)
  if (!understood || !understood.label) return null

  return (
    <div className='inline-flex flex-col gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs max-w-full'>
      <div className='flex items-center gap-2 flex-wrap'>
        <span className='inline-flex items-center gap-1.5 text-slate-600'>
          <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600 shrink-0' />
          <span>Topic:</span>
          <strong className='font-semibold text-slate-900'>{understood.label}</strong>
        </span>

        {understood.prefilledDetails?.map((d, i) => (
          <span
            key={i}
            className='text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200/80'
          >
            {d.label}
          </span>
        ))}

        {!disabled && understood.alternatives?.length > 0 && (
          <button
            type='button'
            onClick={() => setIsEditing((v) => !v)}
            className='text-[11px] font-semibold text-sky-600 hover:text-sky-800 cursor-pointer ml-1'
          >
            {isEditing ? 'Cancel' : 'Change'}
          </button>
        )}
      </div>

      {isEditing && understood.alternatives?.length > 0 && (
        <div className='pt-1.5 border-t border-slate-200/70 flex flex-wrap items-center gap-1.5'>
          <span className='text-[11px] text-slate-500 mr-1'>Switch topic:</span>
          {understood.alternatives.map((alt) => (
            <button
              key={alt.id}
              type='button'
              onClick={() => {
                setIsEditing(false)
                onOverride(alt.id, alt.label)
              }}
              className='px-2.5 py-1 rounded-lg bg-white hover:bg-sky-600 text-slate-700 hover:text-white border border-slate-200 hover:border-sky-600 text-[11px] font-medium transition-colors cursor-pointer'
            >
              {alt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Clean, high-clarity Clinical Verdict Card that works seamlessly in both
 * the narrow floating ChatWidget (compact=true) and the full SymptomChecker page.
 */
export const ClinicalVerdictCard = ({ verdict, currencySymbol, onBookDoctor, compact = false }) => {
  const [selectedTab, setSelectedTab] = useState('primary')
  if (!verdict) return null

  const urgency = getUrgencyConfig(verdict.urgencyLevel)
  const UrgencyIcon = urgency.icon
  const hasSecondary = Boolean(verdict.secondarySpeciality)

  const activeDoctors =
    selectedTab === 'secondary' && hasSecondary
      ? verdict.secondaryDoctors || []
      : verdict.primaryDoctors || []

  const activeSpecialityName =
    selectedTab === 'secondary' && hasSecondary
      ? formatSpeciality(verdict.secondarySpeciality)
      : formatSpeciality(verdict.primarySpeciality)

  const activeReasoning =
    selectedTab === 'secondary' && hasSecondary
      ? verdict.secondaryReasoning
      : verdict.primaryReasoning

  return (
    <div className='bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4'>
      {/* Emergency ER Bypass Hard-Stop Banner */}
      {verdict.isEmergencyBypass && (
        <div className='bg-rose-950 border border-rose-600 text-white rounded-xl p-3.5 space-y-1'>
          <div className='flex items-center gap-2 text-rose-300 font-bold text-xs'>
            <AlertTriangle className='w-4 h-4 text-rose-400 animate-pulse shrink-0' />
            <span>Emergency Alert — Call 108 / 112 Immediately</span>
          </div>
          <p className='text-xs text-rose-100 leading-relaxed'>
            {verdict.emergencyBanner}
          </p>
        </div>
      )}

      {/* 1. Primary Recommendation Header + Urgency Badge */}
      <div className='space-y-2.5'>
        <div className='flex items-center justify-between gap-2 flex-wrap'>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${urgency.bg} ${urgency.border} ${urgency.text}`}
          >
            <UrgencyIcon className='w-3.5 h-3.5 shrink-0' />
            <span>{urgency.label}</span>
          </div>

          {verdict.possibleConcernArea && (
            <span className='text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full'>
              {verdict.possibleConcernArea}
            </span>
          )}
        </div>

        {/* Specialist Selector Tabs (if 2 specialists matched) or Single Specialist Title */}
        {hasSecondary ? (
          <div className='space-y-2 pt-0.5'>
            <div className='inline-flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200/70 w-full sm:w-auto'>
              <button
                type='button'
                onClick={() => setSelectedTab('primary')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left ${
                  selectedTab === 'primary'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. {formatSpeciality(verdict.primarySpeciality)}
              </button>
              <button
                type='button'
                onClick={() => setSelectedTab('secondary')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left ${
                  selectedTab === 'secondary'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. {formatSpeciality(verdict.secondarySpeciality)}
              </button>
            </div>

            <div>
              <h3 className='text-base font-bold text-slate-900 flex items-center gap-2'>
                <Stethoscope className='w-4 h-4 text-sky-600 shrink-0' />
                <span>Recommended: {activeSpecialityName}</span>
              </h3>
              <p className='text-xs text-slate-600 leading-relaxed mt-1'>
                {activeReasoning}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <h3 className='text-base font-bold text-slate-900 flex items-center gap-2'>
              <Stethoscope className='w-4 h-4 text-sky-600 shrink-0' />
              <span>Recommended: {activeSpecialityName}</span>
            </h3>
            <p className='text-xs text-slate-600 leading-relaxed mt-1'>
              {activeReasoning}
            </p>
          </div>
        )}
      </div>

      {/* 2. Self-Care Tip (Clean Left-Accent Callout, No Box-In-Box Clutter) */}
      {verdict.immediateAdvice && (
        <div className='border-l-2 border-emerald-500 bg-emerald-50/40 pl-3 pr-2.5 py-2 rounded-r-xl'>
          <p className='text-xs text-slate-700 leading-relaxed'>
            <strong className='font-semibold text-emerald-950'>Self-care tip: </strong>
            {verdict.immediateAdvice}
          </p>
        </div>
      )}

      {/* 3. Available Doctors List (Never Crushes Doctor Names) */}
      <div className='space-y-2 pt-3 border-t border-slate-100'>
        <div className='flex items-center justify-between'>
          <span className='text-xs font-semibold text-slate-700'>
            Available {activeSpecialityName}s ({activeDoctors.length})
          </span>
          <span className='text-[11px] text-slate-400'>
            Includes your symptom notes
          </span>
        </div>

        {activeDoctors.length > 0 ? (
          <div className={`grid grid-cols-1 ${!compact && activeDoctors.length > 1 ? 'md:grid-cols-2' : ''} gap-2`}>
            {activeDoctors.map((doc) => (
              <div
                key={doc._id}
                onClick={() => onBookDoctor(doc, verdict.clinicalSummaryForDoctor)}
                className='flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-sky-400 bg-slate-50/40 hover:bg-sky-50/30 transition-all cursor-pointer group'
              >
                <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                  <img
                    src={doc.image}
                    alt={doc.name}
                    className='w-11 h-11 rounded-xl object-cover bg-white border border-slate-200 shrink-0'
                  />
                  <div className='min-w-0 flex-1'>
                    <h4 className='font-bold text-slate-900 text-xs sm:text-sm group-hover:text-sky-600 transition-colors truncate'>
                      {doc.name}
                    </h4>
                    <p className='text-[11px] text-slate-500 truncate'>
                      {formatSpeciality(doc.speciality)} • {doc.experience}
                    </p>
                    <p className='text-xs font-bold text-slate-800 mt-0.5'>
                      {currencySymbol}{doc.fees}
                    </p>
                  </div>
                </div>

                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onBookDoctor(doc, verdict.clinicalSummaryForDoctor)
                  }}
                  className='px-3 py-1.5 rounded-xl bg-sky-600 group-hover:bg-sky-700 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0'
                >
                  <span>Book</span>
                  <ArrowRight className='w-3.5 h-3.5' />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-xs text-slate-500 italic py-1'>
            No {activeSpecialityName} doctors are currently marked online.
          </p>
        )}
      </div>

      {/* Subtle Footer Disclaimer */}
      {!compact && verdict.disclaimer && (
        <div className='pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400'>
          <ShieldAlert className='w-3.5 h-3.5 shrink-0 text-slate-400' />
          <span>{verdict.disclaimer}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Full-Viewport Clinical & Symptom Assistant Studio
 */
const SymptomChecker = () => {
  const {
    userData,
    currencySymbol,
    assistantMessages,
    assistantTriageState,
    assistantLoading,
    latestVerdict,
    sendAssistantMessage,
    resetAssistantChat
  } = useContext(AppContext)

  const [input, setInput] = useState('')
  const chatScrollRef = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const completeness = calculateProfileCompleteness(userData)

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [assistantMessages, assistantLoading])

  const handleSend = (e) => {
    if (e) e.preventDefault()
    if (!input.trim() || assistantLoading) return
    const msg = input.trim()
    setInput('')
    sendAssistantMessage(msg)
  }

  const sanitizeReason = (raw) => {
    const clean = String(raw || '').trim()
    if (!clean) return ''
    const lower = clean.toLowerCase()
    const nonClinicalPhrases = [
      'open medicine safety',
      'medicine safety checker',
      'check medicine safety',
      'show available doctors',
      'show general physician',
      'start a new symptom check',
      'check my symptoms instead',
      'how do video consultations work'
    ]
    if (nonClinicalPhrases.some((p) => lower.includes(p))) return ''
    return clean
  }

  const handleBookDoctor = (doc, clinicalSummary) => {
    const safeReason =
      sanitizeReason(clinicalSummary) ||
      sanitizeReason(assistantTriageState.chiefComplaint) ||
      'Guided AI Symptom Assistant referral'
    navigate(`/appointment/${doc._id}`, {
      state: {
        prefilledSymptoms: safeReason
      }
    })
    window.scrollTo(0, 0)
  }

  const handleQuickOptionClick = (opt) => {
    const clean = String(opt || '').trim()
    const lower = clean.toLowerCase()
    if (lower.includes('open medicine safety') || lower === 'medicine safety checker page') {
      navigate('/drug-checker')
      return
    }
    if (
      lower === 'start a new symptom check' ||
      lower === 'check my symptoms instead' ||
      lower === 'new symptom check'
    ) {
      resetAssistantChat()
      return
    }
    sendAssistantMessage(clean)
  }

  const currentStep = latestVerdict
    ? 3
    : assistantTriageState.active
    ? 2
    : 1

  const lastBotMessage = [...assistantMessages].reverse().find((m) => m.role === 'bot')
  const liveRobotMood = assistantLoading
    ? 'thinking'
    : input.trim().length > 0
    ? 'listening'
    : latestVerdict?.urgencyLevel === 'high' || latestVerdict?.isEmergencyBypass
    ? 'alert'
    : lastBotMessage?.intent === 'triage_verdict'
    ? 'verdict'
    : lastBotMessage?.intent === 'triage_question'
    ? 'question'
    : 'welcome'

  const robotSpeechCaption = {
    thinking: 'Reviewing your symptoms and clinical safety checks...',
    listening: 'Press Enter or Send when you are ready.',
    question: `Asking question ${assistantTriageState.questionCount} of 2 to match your specialist`,
    verdict: latestVerdict?.secondarySpeciality
      ? `Matched ${formatSpeciality(latestVerdict.primarySpeciality)} & ${formatSpeciality(latestVerdict.secondarySpeciality)}`
      : 'Your specialist recommendation is ready',
    alert: 'Please review the urgent care guidance below.',
    welcome: 'Describe your symptoms or choose an option below.'
  }[liveRobotMood]

  const getBubbleMood = (msg, isLastBotMsg) => {
    if (isLastBotMsg) return liveRobotMood
    if (msg.verdict?.urgencyLevel === 'high' || msg.verdict?.isEmergencyBypass) return 'alert'
    if (msg.intent === 'triage_verdict') return 'verdict'
    if (msg.intent === 'triage_question') return 'question'
    return 'welcome'
  }

  return (
    <div className='h-[calc(100dvh-86px)] min-h-[520px] max-w-7xl mx-auto pb-2 flex flex-col overflow-hidden'>
      <div className='flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden'>
        {/* Left 8 Columns: Main Conversation Workspace */}
        <section className='lg:col-span-8 flex flex-col h-full min-h-0 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden'>
          {/* Clean Studio Header */}
          <div className='shrink-0 bg-slate-900 text-white px-4 py-3 sm:px-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3 min-w-0'>
              <MedBotAvatar mood={liveRobotMood} size='sm' />
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <h1 className='text-sm sm:text-base font-bold tracking-tight text-white truncate'>
                    Dr. Pulse Assistant
                  </h1>
                  <span className='w-2 h-2 rounded-full bg-emerald-400 shrink-0' />
                </div>
                <p className='text-xs text-slate-300 truncate'>
                  {robotSpeechCaption}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-2 shrink-0'>
              <div className='hidden sm:flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs font-medium'>
                {[
                  { s: 1, label: '1. Symptoms' },
                  { s: 2, label: '2. Clarify' },
                  { s: 3, label: '3. Match' }
                ].map((st) => (
                  <span
                    key={st.s}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      currentStep === st.s
                        ? 'bg-white text-slate-900 font-semibold'
                        : currentStep > st.s
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {st.label}
                  </span>
                ))}
              </div>

              <button
                type='button'
                onClick={resetAssistantChat}
                title='Start fresh symptom check'
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer'
              >
                <RotateCcw className='w-3.5 h-3.5' />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Conversation Stream */}
          <div
            ref={chatScrollRef}
            className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 scroll-smooth'
          >
            {assistantMessages.map((msg, index) => {
              const isLastBotMsg =
                msg.role === 'bot' && index === assistantMessages.length - 1

              return (
                <div key={msg.id || index} className='space-y-2.5'>
                  {/* Hide redundant text bubble when a rich ClinicalVerdictCard is rendered */}
                  {(!msg.verdict || msg.role === 'user') && (
                    <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'bot' && (
                        <div className='shrink-0 mt-0.5'>
                          <MedBotAvatar mood={getBubbleMood(msg, isLastBotMsg)} size='sm' />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-sky-600 text-white rounded-br-xs font-medium'
                            : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                        }`}
                      >
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  )}

                  {/* Topic Confirmation Bar */}
                  {msg.role === 'bot' && msg.understood && (
                    <div className={msg.verdict ? '' : 'sm:pl-11'}>
                      <UnderstoodConfirmationBar
                        understood={msg.understood}
                        disabled={!isLastBotMsg || assistantLoading}
                        onOverride={(protocolId, label) =>
                          sendAssistantMessage('', { overrideProtocolId: protocolId, overrideLabel: label })
                        }
                      />
                    </div>
                  )}

                  {/* Medicine Safety Report Card */}
                  {msg.role === 'bot' && msg.safetyReport && (
                    <div className='sm:pl-11'>
                      <div className='bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 text-xs'>
                        <div className='flex items-center justify-between'>
                          <span className='font-bold text-slate-900 flex items-center gap-1.5'>
                            <Pill className='w-4 h-4 text-sky-600' />
                            <span>Medication & Allergy Check</span>
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              msg.safetyReport.overallRisk === 'SAFE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {msg.safetyReport.overallRisk}
                          </span>
                        </div>
                        {msg.safetyReport.summary && (
                          <p className='text-slate-600 leading-relaxed'>{msg.safetyReport.summary}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Clinical Verdict Card */}
                  {msg.role === 'bot' && msg.verdict && (
                    <div className='flex items-start gap-2.5'>
                      <div className='shrink-0 mt-1 hidden sm:block'>
                        <MedBotAvatar mood={getBubbleMood(msg, isLastBotMsg)} size='sm' />
                      </div>
                      <div className='flex-1 min-w-0'>
                        <ClinicalVerdictCard
                          verdict={msg.verdict}
                          currencySymbol={currencySymbol}
                          onBookDoctor={handleBookDoctor}
                        />
                      </div>
                    </div>
                  )}

                  {/* Direct Doctor Lookup Cards */}
                  {msg.role === 'bot' && !msg.verdict && msg.doctors && msg.doctors.length > 0 && (
                    <div className='sm:pl-11 grid grid-cols-1 sm:grid-cols-2 gap-2'>
                      {msg.doctors.map((doc) => (
                        <div
                          key={doc._id}
                          onClick={() => handleBookDoctor(doc, '')}
                          className='p-3 rounded-xl border border-slate-200 hover:border-sky-400 bg-white flex items-center justify-between gap-2.5 cursor-pointer group transition-all'
                        >
                          <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                            <img
                              src={doc.image}
                              alt={doc.name}
                              className='w-10 h-10 rounded-xl object-cover bg-slate-100 shrink-0'
                            />
                            <div className='min-w-0 flex-1'>
                              <p className='font-bold text-xs text-slate-900 truncate group-hover:text-sky-600'>
                                {doc.name}
                              </p>
                              <p className='text-[11px] text-slate-500 truncate'>
                                {formatSpeciality(doc.speciality)} • {currencySymbol}{doc.fees}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className='w-4 h-4 text-slate-400 group-hover:text-sky-600 shrink-0' />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Page Navigation Action Button */}
                  {msg.role === 'bot' && msg.actionButton && msg.actionButton.path && (
                    <div className='sm:pl-11 pt-0.5'>
                      <button
                        type='button'
                        onClick={() => navigate(msg.actionButton.path)}
                        className='inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-sky-600 text-white text-xs font-semibold transition-colors cursor-pointer'
                      >
                        <span>{msg.actionButton.label}</span>
                        <ArrowRight className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  )}

                  {/* Quick-Reply Options */}
                  {isLastBotMsg && !assistantLoading && msg.quickOptions && msg.quickOptions.length > 0 && (
                    <div className='sm:pl-11 space-y-2 pt-1'>
                      <div className='flex flex-wrap gap-1.5'>
                        {msg.quickOptions.map((opt, i) => (
                          <button
                            key={i}
                            type='button'
                            onClick={() => handleQuickOptionClick(opt)}
                            className='px-3 py-1.5 rounded-xl bg-sky-50/80 hover:bg-sky-600 text-sky-900 hover:text-white border border-sky-200/80 hover:border-sky-600 text-xs font-medium transition-all cursor-pointer text-left'
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {msg.canSkipToVerdict && (
                        <div>
                          <button
                            type='button'
                            onClick={() => sendAssistantMessage('', { forceVerdict: true })}
                            className='inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-sky-600 cursor-pointer'
                          >
                            <span>Skip questions & see doctor match now</span>
                            <ArrowRight className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {assistantLoading && (
              <div className='flex items-center gap-3'>
                <MedBotAvatar mood='thinking' size='sm' />
                <div className='bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-xs inline-flex items-center gap-2 text-xs font-medium text-slate-700'>
                  <Sparkles className='w-4 h-4 text-sky-600 animate-spin shrink-0' />
                  <span>Analyzing your symptoms...</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Message Input Bar */}
          <form
            onSubmit={handleSend}
            className='shrink-0 p-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2.5'
          >
            <input
              ref={inputRef}
              type='text'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                assistantTriageState.active
                  ? 'Type your answer or select an option above...'
                  : 'Describe your symptoms (e.g., itchy rash on my arm for 3 days)...'
              }
              disabled={assistantLoading}
              className='flex-1 bg-white border border-slate-200 focus:border-sky-600 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 outline-none disabled:opacity-60'
            />
            <button
              type='submit'
              disabled={!input.trim() || assistantLoading}
              className='px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0'
            >
              <span>Send</span>
              <Send className='w-3.5 h-3.5' />
            </button>
          </form>
        </section>

        {/* Right 4 Columns: Clean, Consolidated Visit Summary & Health Profile */}
        <aside className='lg:col-span-4 hidden lg:flex flex-col gap-4 h-full min-h-0 overflow-y-auto'>
          {/* 1. Visit Summary Card (Shared with Doctor on Booking) */}
          <div className='bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3.5 shrink-0'>
            <div className='flex items-center justify-between pb-2.5 border-b border-slate-100'>
              <div className='flex items-center gap-2'>
                <ClipboardList className='w-4 h-4 text-sky-600' />
                <h2 className='text-sm font-bold text-slate-900'>
                  Visit Summary
                </h2>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  assistantTriageState.active
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : latestVerdict
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {assistantTriageState.active
                  ? `Step ${assistantTriageState.questionCount} of 2`
                  : latestVerdict
                  ? 'Ready to book'
                  : 'Waiting for symptoms'}
              </span>
            </div>

            {assistantTriageState.chiefComplaint || latestVerdict ? (
              <div className='space-y-3 text-xs'>
                <div>
                  <span className='text-slate-400 font-medium block mb-0.5'>
                    Main concern
                  </span>
                  <p className='font-semibold text-slate-900 text-sm'>
                    {assistantTriageState.chiefComplaint}
                  </p>
                  {(assistantTriageState.protocolLabel || latestVerdict?.protocolLabel) && (
                    <span className='inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]'>
                      {assistantTriageState.protocolLabel || latestVerdict?.protocolLabel}
                    </span>
                  )}
                </div>

                {assistantTriageState.collectedFacts?.length > 0 && (
                  <div className='space-y-1.5 pt-2 border-t border-slate-100'>
                    <span className='text-slate-400 font-medium block'>
                      Clarified details
                    </span>
                    {assistantTriageState.collectedFacts.map((fact, idx) => (
                      <div key={idx} className='flex items-start gap-2 text-slate-700'>
                        <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5' />
                        <span>
                          <strong className='font-semibold text-slate-800'>{fact.slot}:</strong> {fact.answer}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {latestVerdict && (
                  <div className='pt-2.5 border-t border-slate-100 space-y-1'>
                    <span className='text-slate-400 font-medium block'>
                      Recommended specialist
                    </span>
                    <p className='font-bold text-sky-700 text-sm'>
                      {formatSpeciality(latestVerdict.primarySpeciality)}
                      {latestVerdict.secondarySpeciality
                        ? ` or ${formatSpeciality(latestVerdict.secondarySpeciality)}`
                        : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className='text-xs text-slate-500 leading-relaxed'>
                Share your symptoms in the chat. Your key details will be summarized here and attached automatically when you book an appointment.
              </p>
            )}
          </div>

          {/* 2. Compact Patient Health Profile Card */}
          <div className='bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3 shrink-0'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <UserCheck className='w-4 h-4 text-sky-600' />
                <h3 className='text-sm font-bold text-slate-900'>
                  Health Profile
                </h3>
              </div>
              {userData && (
                <button
                  type='button'
                  onClick={() => navigate('/my-profile')}
                  className='text-xs font-semibold text-sky-600 hover:underline cursor-pointer'
                >
                  Edit
                </button>
              )}
            </div>

            {userData ? (
              <div className='space-y-2 text-xs'>
                <div className='flex flex-wrap gap-1.5'>
                  <span className='px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium'>
                    {userData.gender !== 'Not Selected' ? userData.gender : 'Sex unset'}
                  </span>
                  {userData.dob && userData.dob !== 'Not Selected' && (
                    <span className='px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium'>
                      DOB: {userData.dob}
                    </span>
                  )}
                  {userData.bloodGroup && (
                    <span className='px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium'>
                      Blood: {userData.bloodGroup}
                    </span>
                  )}
                </div>

                <div className='pt-1 space-y-1 text-slate-600'>
                  <p>
                    <strong className='font-semibold text-slate-800'>Allergies: </strong>
                    {userData.allergies?.length > 0
                      ? userData.allergies.join(', ')
                      : userData.noKnownAllergies
                      ? 'None (NKDA)'
                      : 'Not specified'}
                  </p>
                  <p>
                    <strong className='font-semibold text-slate-800'>Medications: </strong>
                    {formatMedicationList(userData.currentMedications) ||
                      (userData.noCurrentMedications ? 'None' : 'Not specified')}
                  </p>
                </div>

                {completeness.percentage < 100 && (
                  <button
                    type='button'
                    onClick={() => window.dispatchEvent(new CustomEvent('vitalsync:open-onboarding'))}
                    className='w-full mt-1 py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold transition-colors cursor-pointer text-center'
                  >
                    Complete your health profile ({completeness.percentage}%)
                  </button>
                )}
              </div>
            ) : (
              <div className='space-y-2 text-xs text-slate-600'>
                <p>Sign in to check drug interactions against your allergies and active medications.</p>
                <button
                  type='button'
                  onClick={() => navigate('/login')}
                  className='w-full py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs cursor-pointer'
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default SymptomChecker
