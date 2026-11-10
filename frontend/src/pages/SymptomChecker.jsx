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
  HeartHandshake,
  Send,
  RotateCcw,
  UserCheck,
  Pill,
  Activity,
  ChevronRight,
  ClipboardList,
  ShieldCheck
} from 'lucide-react'

const formatSpeciality = (spec = '') => {
  const s = spec.trim()
  if (s.toLowerCase() === 'general physician') return 'General Physician'
  if (s.toLowerCase() === 'pediatricians') return 'Pediatrician'
  return s
}

const getUrgencyConfig = (level) => {
  switch (level) {
    case 'high':
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-700',
        label: 'Immediate Care Needed',
        icon: AlertTriangle
      }
    case 'medium':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        label: 'Consult Soon',
        icon: Clock
      }
    case 'low':
    default:
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        label: 'Routine Checkup',
        icon: CheckCircle2
      }
  }
}

/**
 * "Did I get that right?" Confirmation & 1-Click Protocol Correction Bar
 */
export const UnderstoodConfirmationBar = ({ understood, onOverride, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false)
  if (!understood || !understood.label) return null

  return (
    <div className='bg-emerald-50/70 border border-emerald-200/80 rounded-2xl px-3.5 py-2 text-xs space-y-2'>
      <div className='flex items-center justify-between gap-2 flex-wrap'>
        <div className='flex items-center gap-1.5 flex-wrap min-w-0'>
          <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600 shrink-0' />
          <span className='font-bold text-slate-700'>Understood:</span>
          <span className='font-extrabold text-emerald-900 bg-white px-2 py-0.5 rounded-lg border border-emerald-200'>
            {understood.label}
          </span>
          {understood.prefilledDetails?.map((d, i) => (
            <span
              key={i}
              className='text-[11px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-lg'
            >
              • {d.label}
            </span>
          ))}
        </div>
        {!disabled && understood.alternatives?.length > 0 && (
          <button
            type='button'
            onClick={() => setIsEditing((v) => !v)}
            className='text-[11px] font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer shrink-0'
          >
            {isEditing ? 'Cancel' : 'Not right? Change ✏️'}
          </button>
        )}
      </div>

      {isEditing && understood.alternatives?.length > 0 && (
        <div className='pt-1 border-t border-emerald-200/60 space-y-1.5'>
          <p className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>
            Select the closer concern:
          </p>
          <div className='flex flex-wrap gap-1.5'>
            {understood.alternatives.map((alt) => (
              <button
                key={alt.id}
                type='button'
                onClick={() => {
                  setIsEditing(false)
                  onOverride(alt.id, alt.label)
                }}
                className='px-2.5 py-1 rounded-xl bg-white hover:bg-sky-600 text-slate-800 hover:text-white border border-slate-200 hover:border-sky-600 text-[11px] font-bold transition-colors cursor-pointer'
              >
                {alt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Rich Dual-Specialist Verdict Card rendered inside the assistant conversation
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

  return (
    <div className='bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4 mt-2'>
      {/* Emergency ER Bypass Hard-Stop Banner */}
      {verdict.isEmergencyBypass && (
        <div className='bg-rose-950 border-2 border-rose-600 text-white rounded-2xl p-4 space-y-1.5'>
          <div className='flex items-center gap-2 text-rose-300 font-extrabold text-xs uppercase tracking-wider'>
            <AlertTriangle className='w-4 h-4 text-rose-400 animate-pulse shrink-0' />
            <span>MoHFW Emergency Bypass Protocol (Call 108 / 112)</span>
          </div>
          <p className='text-xs text-rose-100 leading-relaxed'>
            {verdict.emergencyBanner}
          </p>
        </div>
      )}

      {/* Top Result Header */}
      <div className='flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100'>
        <div>
          <span className='text-[10px] font-bold uppercase tracking-wider text-sky-600 block'>
            Symptom Check Result
          </span>
          <h3 className='text-sm sm:text-base font-extrabold text-slate-900'>
            Our Clinical Recommendation for You
          </h3>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${urgency.bg} ${urgency.border} ${urgency.text}`}
        >
          <UrgencyIcon className='w-3.5 h-3.5' />
          <span>{urgency.label}</span>
        </div>
      </div>

      {/* Primary + Secondary Specialist Cards */}
      <div className={`grid grid-cols-1 ${hasSecondary && !compact ? 'md:grid-cols-2' : ''} gap-3`}>
        {/* Primary Specialist Card */}
        <div
          onClick={() => setSelectedTab('primary')}
          className={`rounded-2xl p-3.5 border transition-all cursor-pointer space-y-2 ${
            selectedTab === 'primary'
              ? 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-500/15'
              : 'bg-slate-50/60 border-slate-200 hover:border-sky-200'
          }`}
        >
          <div className='flex items-center justify-between gap-2'>
            <span className='inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-sky-800'>
              <Stethoscope className='w-3.5 h-3.5 text-sky-600' />
              <span>Primary Recommendation</span>
            </span>
            <span className='px-2 py-0.5 rounded-full bg-white border border-sky-200 text-sky-700 text-[10px] font-bold'>
              First-Line Care
            </span>
          </div>

          <h4 className='text-base font-extrabold text-slate-900'>
            {formatSpeciality(verdict.primarySpeciality)}
          </h4>

          <p className='text-xs text-slate-700 leading-relaxed'>
            {verdict.primaryReasoning}
          </p>
        </div>

        {/* Secondary / Co-Recommended Specialist Card (e.g. Gastroenterologist) */}
        {hasSecondary && (
          <div
            onClick={() => setSelectedTab('secondary')}
            className={`rounded-2xl p-3.5 border transition-all cursor-pointer space-y-2 ${
              selectedTab === 'secondary'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/15'
                : 'bg-slate-50/60 border-slate-200 hover:border-indigo-200'
            }`}
          >
            <div className='flex items-center justify-between gap-2'>
              <span className='inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-900'>
                <Activity className='w-3.5 h-3.5 text-indigo-600' />
                <span>Co-Recommended Specialist</span>
              </span>
              <span className='px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-indigo-700 text-[10px] font-bold'>
                Organ Specialist
              </span>
            </div>

            <h4 className='text-base font-extrabold text-slate-900'>
              {formatSpeciality(verdict.secondarySpeciality)}
            </h4>

            <p className='text-xs text-slate-700 leading-relaxed'>
              {verdict.secondaryReasoning}
            </p>
          </div>
        )}
      </div>

      {/* What This Might Relate To & Self-Care Advice */}
      <div className={`grid grid-cols-1 ${!compact ? 'sm:grid-cols-2' : ''} gap-2.5`}>
        {verdict.possibleConcernArea && (
          <div className='bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-1'>
            <p className='text-[10px] font-extrabold uppercase tracking-wider text-slate-500'>
              What this might relate to
            </p>
            <p className='text-xs font-bold text-slate-900'>
              {verdict.possibleConcernArea}
            </p>
          </div>
        )}

        {verdict.immediateAdvice && (
          <div className='bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3 space-y-1'>
            <p className='text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1'>
              <HeartHandshake className='w-3.5 h-3.5 text-emerald-600' />
              <span>Helpful self-care tips</span>
            </p>
            <p className='text-xs text-slate-700 leading-relaxed'>
              {verdict.immediateAdvice}
            </p>
          </div>
        )}
      </div>

      {/* Tabbed Doctors List for Primary & Secondary Specialists */}
      <div className='space-y-2.5 pt-2 border-t border-slate-100'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-xs font-extrabold text-slate-800'>
            Available Doctors — Tap to book with your triage summary
          </p>

          {hasSecondary && (
            <div className='inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/70'>
              <button
                type='button'
                onClick={() => setSelectedTab('primary')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedTab === 'primary'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {formatSpeciality(verdict.primarySpeciality)} ({verdict.primaryDoctors?.length || 0})
              </button>
              <button
                type='button'
                onClick={() => setSelectedTab('secondary')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedTab === 'secondary'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {formatSpeciality(verdict.secondarySpeciality)} ({verdict.secondaryDoctors?.length || 0})
              </button>
            </div>
          )}
        </div>

        {activeDoctors.length > 0 ? (
          <div className='grid grid-cols-1 gap-2'>
            {activeDoctors.map((doc) => (
              <div
                key={doc._id}
                onClick={() => onBookDoctor(doc, verdict.clinicalSummaryForDoctor)}
                className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 hover:border-sky-400 bg-white hover:bg-sky-50/20 transition-all cursor-pointer group'
              >
                <div className='flex items-center gap-3 min-w-0'>
                  <img
                    src={doc.image}
                    alt={doc.name}
                    className='w-11 h-11 rounded-2xl object-cover bg-slate-100 border border-slate-200 shrink-0'
                  />
                  <div className='min-w-0'>
                    <h5 className='font-bold text-slate-900 text-xs sm:text-sm group-hover:text-sky-600 transition-colors truncate'>
                      {doc.name}
                    </h5>
                    <p className='text-[11px] font-semibold text-sky-700'>
                      {formatSpeciality(doc.speciality)} • {doc.degree} • {doc.experience}
                    </p>
                  </div>
                </div>

                <div className='flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0'>
                  <span className='text-sm font-extrabold text-slate-900 tabular-nums'>
                    {currencySymbol}{doc.fees}
                  </span>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      onBookDoctor(doc, verdict.clinicalSummaryForDoctor)
                    }}
                    className='px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5'
                  >
                    <span>Book appointment</span>
                    <ArrowRight className='w-3.5 h-3.5' />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-xs text-slate-500 italic py-2'>
            No {activeSpecialityName} doctors are currently marked online.
          </p>
        )}
      </div>

      {/* Disclaimer */}
      <div className='pt-2 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-400'>
        <ShieldAlert className='w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400' />
        <span>{verdict.disclaimer}</span>
      </div>
    </div>
  )
}

/**
 * Full-Viewport Unified Clinical & Symptom Assistant Studio
 * Fits 100% inside the browser window on tab landing so the entire chat setup
 * (header, conversation stream, quick chips, bottom input bar, and live robot companion)
 * is immediately visible without page scrolling.
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

  const handleBookDoctor = (doc, clinicalSummary) => {
    navigate(`/appointment/${doc._id}`, {
      state: {
        prefilledSymptoms:
          clinicalSummary ||
          assistantTriageState.chiefComplaint ||
          'Guided AI Symptom Assistant referral'
      }
    })
    window.scrollTo(0, 0)
  }

  // Determine current step for the top clinical progress bar
  const currentStep = latestVerdict
    ? 3
    : assistantTriageState.active
    ? 2
    : 1

  // Compute live mood of the Medical Robot Companion
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
    thinking: 'Scanning clinical guidelines & checking red flags...',
    listening: "I'm listening! Press Enter or Send when you're ready.",
    question: `Clarifying detail ${assistantTriageState.questionCount} of 2 to match your specialist...`,
    verdict: latestVerdict?.secondarySpeciality
      ? `Matched both ${formatSpeciality(latestVerdict.primarySpeciality)} & ${formatSpeciality(latestVerdict.secondarySpeciality)}!`
      : 'Your clinical specialist recommendation is ready!',
    alert: 'Please review the urgent medical guidance carefully.',
    welcome: 'Hi! Tell me how you feel or tap a quick symptom chip.'
  }[liveRobotMood]

  // Helper to pick avatar mood per historical message bubble
  const getBubbleMood = (msg, isLastBotMsg) => {
    if (isLastBotMsg) return liveRobotMood
    if (msg.verdict?.urgencyLevel === 'high' || msg.verdict?.isEmergencyBypass) return 'alert'
    if (msg.intent === 'triage_verdict') return 'verdict'
    if (msg.intent === 'triage_question') return 'question'
    return 'welcome'
  }

  return (
    <div className='h-[calc(100dvh-86px)] min-h-[520px] max-w-7xl mx-auto pb-2 flex flex-col overflow-hidden'>
      {/* Main 12-Column Full-Viewport Studio */}
      <div className='flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden'>
        {/* Left 8 Columns: Full Chat Setup View (Header + Scrollable Messages + Pinned Input Bar) */}
        <section className='lg:col-span-8 flex flex-col h-full min-h-0 bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden'>
          {/* Integrated Studio Chat Header */}
          <div className='shrink-0 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3 min-w-0'>
              <div className='bg-white/10 border border-white/15 rounded-2xl p-1 shrink-0'>
                <MedBotAvatar mood={liveRobotMood} size='sm' />
              </div>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <h1 className='text-sm sm:text-base font-extrabold tracking-tight text-white truncate'>
                    Dr. Pulse • AI Clinical Triage Assistant
                  </h1>
                  <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0'>
                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                    Live
                  </span>
                </div>
                <p className='text-[11px] text-sky-200/90 truncate'>
                  {robotSpeechCaption}
                </p>
              </div>
            </div>

            {/* Compact Step Pills + Reset */}
            <div className='flex items-center gap-2 shrink-0'>
              <div className='hidden sm:flex items-center gap-1 bg-white/10 border border-white/10 p-1 rounded-xl text-[11px] font-bold'>
                {[
                  { s: 1, label: '1. Symptoms' },
                  { s: 2, label: '2. Clarify' },
                  { s: 3, label: '3. Match' }
                ].map((st) => (
                  <span
                    key={st.s}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      currentStep === st.s
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : currentStep > st.s
                        ? 'text-emerald-300'
                        : 'text-slate-300/80'
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
                className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold transition-colors cursor-pointer'
              >
                <RotateCcw className='w-3.5 h-3.5' />
                <span className='hidden sm:inline'>New Check</span>
              </button>
            </div>
          </div>

          {/* Scrollable Conversation Stream */}
          <div
            ref={chatScrollRef}
            className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 scroll-smooth bg-gradient-to-b from-slate-50/40 to-white'
          >
            {assistantMessages.map((msg, index) => {
              const isLastBotMsg =
                msg.role === 'bot' && index === assistantMessages.length - 1

              return (
                <div key={msg.id || index} className='space-y-2.5'>
                  <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'bot' && (
                      <div className='shrink-0 mt-0.5'>
                        <MedBotAvatar mood={getBubbleMood(msg, isLastBotMsg)} size='sm' />
                      </div>
                    )}

                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-sky-600 text-white rounded-br-xs font-medium shadow-2xs'
                          : 'bg-slate-100/90 text-slate-800 border border-slate-200/80 rounded-bl-xs'
                      }`}
                    >
                      <p>{msg.text}</p>
                    </div>
                  </div>

                  {/* "Did I get that right?" Confirmation & 1-Click Correction Bar */}
                  {msg.role === 'bot' && msg.understood && (
                    <div className='sm:pl-11'>
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
                    <div className='pl-11'>
                      <div className='bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs'>
                        <div className='flex items-center justify-between'>
                          <span className='font-extrabold text-slate-900 flex items-center gap-1.5'>
                            <Pill className='w-4 h-4 text-sky-600' />
                            <span>AI Pharmacology & Allergy Screen</span>
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-extrabold text-[11px] ${
                              msg.safetyReport.overallRisk === 'SAFE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {msg.safetyReport.overallRisk}
                          </span>
                        </div>
                        {msg.safetyReport.summary && (
                          <p className='text-slate-700 leading-relaxed'>{msg.safetyReport.summary}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Full Clinical Verdict Card (Primary + Secondary Specialists) */}
                  {msg.role === 'bot' && msg.verdict && (
                    <div className='sm:pl-11'>
                      <ClinicalVerdictCard
                        verdict={msg.verdict}
                        currencySymbol={currencySymbol}
                        onBookDoctor={handleBookDoctor}
                      />
                    </div>
                  )}

                  {/* Direct Doctor Lookup Cards (when not a full triage verdict) */}
                  {msg.role === 'bot' && !msg.verdict && msg.doctors && msg.doctors.length > 0 && (
                    <div className='pl-11 grid grid-cols-1 sm:grid-cols-2 gap-2'>
                      {msg.doctors.map((doc) => (
                        <div
                          key={doc._id}
                          onClick={() => handleBookDoctor(doc, '')}
                          className='p-3 rounded-2xl border border-slate-200 hover:border-sky-400 bg-white flex items-center justify-between gap-2.5 cursor-pointer group transition-all'
                        >
                          <div className='flex items-center gap-2.5 min-w-0'>
                            <img
                              src={doc.image}
                              alt={doc.name}
                              className='w-10 h-10 rounded-xl object-cover bg-slate-100 shrink-0'
                            />
                            <div className='min-w-0'>
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

                  {/* Interactive Quick-Reply Chips on the latest bot turn */}
                  {isLastBotMsg && !assistantLoading && msg.quickOptions && msg.quickOptions.length > 0 && (
                    <div className='sm:pl-11 space-y-2 pt-0.5'>
                      <p className='text-[10px] font-extrabold uppercase tracking-wider text-slate-400'>
                        {msg.intent === 'triage_question'
                          ? 'Tap an answer below or type your own:'
                          : 'Quick clinical starters:'}
                      </p>
                      <div className='flex flex-wrap gap-1.5'>
                        {msg.quickOptions.map((opt, i) => (
                          <button
                            key={i}
                            type='button'
                            onClick={() => sendAssistantMessage(opt)}
                            className='px-3 py-1.5 rounded-xl bg-sky-50/90 hover:bg-sky-600 text-sky-900 hover:text-white border border-sky-200/90 hover:border-sky-600 text-xs font-semibold transition-all cursor-pointer text-left shadow-2xs'
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {msg.canSkipToVerdict && (
                        <div className='pt-0.5'>
                          <button
                            type='button'
                            onClick={() => sendAssistantMessage('', { forceVerdict: true })}
                            className='inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-sky-600 underline cursor-pointer'
                          >
                            <span>Skip questions & show doctor recommendation now</span>
                            <ArrowRight className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Animated Medical Robot Thinking Bubble */}
            {assistantLoading && (
              <div className='flex items-center gap-3'>
                <MedBotAvatar mood='thinking' size='sm' />
                <div className='bg-sky-50/80 border border-sky-200/80 px-4 py-2.5 rounded-2xl rounded-bl-xs inline-flex items-center gap-2.5 text-xs font-bold text-sky-900 shadow-2xs'>
                  <Sparkles className='w-4 h-4 text-sky-600 animate-spin shrink-0' />
                  <span>Dr. Pulse is analyzing your symptoms & screening specialists...</span>
                </div>
              </div>
            )}
          </div>

          {/* Pinned Bottom Message Input Bar (Always visible on screen!) */}
          <form
            onSubmit={handleSend}
            className='shrink-0 p-3 sm:p-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2.5'
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
                  ? 'Type your answer or tap one of the quick options above...'
                  : "Describe your symptoms (e.g. 'pooping right after drinking water happens daily')..."
              }
              disabled={assistantLoading}
              className='flex-1 bg-white border border-slate-200 focus:border-sky-600 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 outline-none shadow-2xs disabled:opacity-60'
            />
            <button
              type='submit'
              disabled={!input.trim() || assistantLoading}
              className='px-5 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-xs'
            >
              <span>Send</span>
              <Send className='w-4 h-4' />
            </button>
          </form>
        </section>

        {/* Right 4 Columns: Interactive Medical Robot Companion Stage + Live Intake Notes + Dossier */}
        <aside className='lg:col-span-4 hidden lg:flex flex-col gap-3.5 h-full min-h-0 overflow-y-auto pr-0.5'>
          {/* 1. Interactive Medical Robot Companion Card */}
          <div className='bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 border border-slate-700/70 rounded-3xl p-4 text-white shadow-md flex items-center gap-4 shrink-0'>
            <MedBotAvatar mood={liveRobotMood} size='lg' showStatusBadge={true} />
            <div className='space-y-1.5 min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-[10px] font-extrabold uppercase tracking-wider text-sky-300'>
                  AI Medical Companion
                </span>
                <span className='text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-200'>
                  Step {currentStep} of 3
                </span>
              </div>
              <p className='text-xs font-semibold text-white leading-snug'>
                &ldquo;{robotSpeechCaption}&rdquo;
              </p>
              {userData && completeness.percentage < 100 && (
                <button
                  type='button'
                  onClick={() => window.dispatchEvent(new CustomEvent('vitalsync:open-onboarding'))}
                  className='mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-bold transition-colors cursor-pointer'
                >
                  <span>Complete Profile ({completeness.percentage}%)</span>
                  <ArrowRight className='w-3 h-3' />
                </button>
              )}
            </div>
          </div>

          {/* 2. Active Clinical Intake Tracker */}
          <div className='bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3 shrink-0'>
            <div className='flex items-center justify-between pb-2.5 border-b border-slate-100'>
              <h2 className='text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5'>
                <ClipboardList className='w-4 h-4 text-sky-600' />
                <span>Live Clinical Intake Notes</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  assistantTriageState.active
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : latestVerdict
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {assistantTriageState.active
                  ? `Question ${assistantTriageState.questionCount} of 2`
                  : latestVerdict
                  ? 'Verdict Ready'
                  : 'Standby'}
              </span>
            </div>

            {assistantTriageState.chiefComplaint || latestVerdict ? (
              <div className='space-y-2.5 text-xs'>
                <div className='p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-[10px] font-bold uppercase tracking-wider text-slate-400 block'>
                      Chief Complaint
                    </span>
                    {(assistantTriageState.protocolLabel || latestVerdict?.protocolLabel) && (
                      <span className='px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]'>
                        Protocol: {assistantTriageState.protocolLabel || latestVerdict?.protocolLabel}
                      </span>
                    )}
                  </div>
                  <p className='font-bold text-slate-900'>
                    &ldquo;{assistantTriageState.chiefComplaint}&rdquo;
                  </p>
                </div>

                {assistantTriageState.collectedFacts?.length > 0 && (
                  <div className='space-y-1.5'>
                    <span className='text-[10px] font-bold uppercase tracking-wider text-slate-400 block'>
                      Clarified Clinical Facts
                    </span>
                    {assistantTriageState.collectedFacts.map((fact, idx) => (
                      <div
                        key={idx}
                        className='p-2 rounded-xl bg-sky-50/60 border border-sky-200/70 flex items-start gap-2'
                      >
                        <CheckCircle2 className='w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5' />
                        <div>
                          <span className='font-bold text-slate-800'>{fact.slot}: </span>
                          <span className='text-slate-700'>{fact.answer}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {latestVerdict && (
                  <div className='p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1'>
                    <span className='text-[10px] font-bold uppercase tracking-wider text-emerald-800 block'>
                      Matched Specialists
                    </span>
                    <p className='font-extrabold text-slate-900'>
                      1. {formatSpeciality(latestVerdict.primarySpeciality)} (Primary)
                    </p>
                    {latestVerdict.secondarySpeciality && (
                      <p className='font-bold text-indigo-800'>
                        2. {formatSpeciality(latestVerdict.secondarySpeciality)} (Specialist)
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className='text-xs text-slate-500 leading-relaxed'>
                As you describe your symptoms and answer 1–2 quick questions, your structured clinical summary builds here and prefills when you book a doctor.
              </p>
            )}
          </div>

          {/* 3. Patient Medical Dossier Context Card */}
          <div className='bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3 shrink-0'>
            <div className='flex items-center justify-between pb-2 border-b border-slate-100'>
              <h3 className='text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5'>
                <UserCheck className='w-4 h-4 text-sky-600' />
                <span>Patient Dossier ({completeness.percentage}%)</span>
              </h3>
              {userData && (
                <button
                  type='button'
                  onClick={() => navigate('/my-profile')}
                  className='text-[11px] font-bold text-sky-600 hover:underline cursor-pointer'
                >
                  Edit Profile
                </button>
              )}
            </div>

            {userData ? (
              <div className='space-y-1.5 text-xs'>
                <div className='flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70'>
                  <span className='text-slate-500'>Sex & DOB:</span>
                  <span className='font-bold text-slate-800'>
                    {userData.gender !== 'Not Selected' ? userData.gender : 'Unset'} •{' '}
                    {userData.dob !== 'Not Selected' ? userData.dob : 'Unset'}
                  </span>
                </div>
                <div className='flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70'>
                  <span className='text-slate-500'>Drug Allergies:</span>
                  <span className='font-bold text-slate-800 truncate max-w-[160px]'>
                    {userData.allergies?.length > 0
                      ? userData.allergies.join(', ')
                      : userData.noKnownAllergies
                      ? 'None (NKDA)'
                      : 'Unconfirmed'}
                  </span>
                </div>
                <div className='flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70'>
                  <span className='text-slate-500'>Regular Meds:</span>
                  <span className='font-bold text-slate-800'>
                    {userData.currentMedications?.length > 0
                      ? `${userData.currentMedications.length} active`
                      : userData.noCurrentMedications
                      ? 'None'
                      : 'Unconfirmed'}
                  </span>
                </div>
              </div>
            ) : (
              <div className='space-y-2 text-xs text-slate-600'>
                <p>Sign in so Dr. Pulse can factor in your age, allergies, and medications.</p>
                <button
                  type='button'
                  onClick={() => navigate('/login')}
                  className='w-full py-2 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer'
                >
                  Sign In to Sync Dossier
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
