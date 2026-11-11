import React, { useState, useRef, useEffect, useContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { ClinicalVerdictCard, UnderstoodConfirmationBar } from '../pages/SymptomChecker'
import MedBotAvatar from './MedBotAvatar'
import {
  X,
  Send,
  RotateCcw,
  ChevronRight,
  Maximize2,
  ArrowRight,
  Pill
} from 'lucide-react'

const ChatWidget = () => {
  const {
    currencySymbol,
    assistantMessages,
    assistantTriageState,
    assistantLoading,
    sendAssistantMessage,
    resetAssistantChat
  } = useContext(AppContext)

  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [assistantMessages, assistantLoading, isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Hide floating widget when already on the full-screen /symptom-checker page
  if (location.pathname === '/symptom-checker') {
    return null
  }

  const handleSend = () => {
    const clean = input.trim()
    if (!clean || assistantLoading) return
    setInput('')
    sendAssistantMessage(clean)
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
      'AI Clinical Assistant referral'
    setIsOpen(false)
    navigate(`/appointment/${doc._id}`, {
      state: {
        prefilledSymptoms: safeReason
      }
    })
  }

  const handleQuickOptionClick = (opt) => {
    const clean = String(opt || '').trim()
    const lower = clean.toLowerCase()
    if (lower.includes('open medicine safety') || lower === 'medicine safety checker page') {
      setIsOpen(false)
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

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='fixed bottom-6 right-6 z-50 pl-2 pr-4 h-12 rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/25 border border-slate-700 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 cursor-pointer'
        aria-label='Ask Health Assistant'
      >
        {isOpen ? (
          <>
            <X className='w-5 h-5 text-white ml-1.5' />
            <span className='text-xs font-semibold'>Close</span>
          </>
        ) : (
          <>
            <MedBotAvatar mood={assistantLoading ? 'thinking' : 'welcome'} size='xs' />
            <span className='text-xs font-semibold'>Ask MedBot</span>
          </>
        )}
      </button>

      {/* Synchronized Chat Window */}
      <div
        className={`fixed bottom-20 right-4 sm:right-6 z-50 transition-all duration-200 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className='w-[calc(100vw-2rem)] sm:w-[400px] max-h-[min(620px,82dvh)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-clip'>
          {/* Clean Single-Row Header */}
          <div className='px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0'>
            <div className='flex items-center gap-2.5 min-w-0'>
              <MedBotAvatar
                mood={
                  assistantLoading
                    ? 'thinking'
                    : input.trim()
                    ? 'listening'
                    : assistantTriageState.active
                    ? 'question'
                    : 'welcome'
                }
                size='sm'
              />
              <div className='min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <h3 className='font-bold text-sm tracking-tight text-white truncate'>
                    VitalSync MedBot
                  </h3>
                  <span className='w-2 h-2 rounded-full bg-emerald-400 shrink-0' />
                </div>
                <p className='text-[11px] text-slate-300 truncate'>
                  {assistantTriageState.active
                    ? `Step ${assistantTriageState.questionCount} of 2 • Matching specialist`
                    : 'Symptoms, doctors & medicine safety'}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-1 shrink-0'>
              <button
                type='button'
                onClick={() => {
                  setIsOpen(false)
                  navigate('/symptom-checker')
                }}
                className='px-2 py-1 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1'
                title='Open Full View'
              >
                <span>Full view</span>
                <Maximize2 className='w-3 h-3' />
              </button>
              <button
                type='button'
                onClick={resetAssistantChat}
                className='p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer'
                title='Reset conversation'
              >
                <RotateCcw className='w-4 h-4' />
              </button>
              <button
                type='button'
                onClick={() => setIsOpen(false)}
                className='p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer'
                title='Close'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div
            ref={messagesContainerRef}
            className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 space-y-3 text-sm'
            style={{ maxHeight: '440px', minHeight: '260px' }}
          >
            {assistantMessages.map((msg, i) => {
              const isLastBotMsg = msg.role === 'bot' && i === assistantMessages.length - 1

              return (
                <div key={msg.id || i} className='space-y-2'>
                  {/* Hide redundant text bubble when a ClinicalVerdictCard is rendered */}
                  {(!msg.verdict || msg.role === 'user') && (
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-primary text-white rounded-br-xs font-medium'
                            : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  )}

                  {msg.role === 'bot' && msg.understood && (
                    <UnderstoodConfirmationBar
                      understood={msg.understood}
                      disabled={!isLastBotMsg || assistantLoading}
                      onOverride={(protocolId, label) =>
                        sendAssistantMessage('', { overrideProtocolId: protocolId, overrideLabel: label })
                      }
                    />
                  )}

                  {/* Medicine Safety Report inside widget */}
                  {msg.role === 'bot' && msg.safetyReport && (
                    <div className='bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5'>
                      <div className='flex items-center justify-between'>
                        <span className='font-bold text-slate-800 flex items-center gap-1.5'>
                          <Pill className='w-3.5 h-3.5 text-sky-600' />
                          <span>Medication Safety Check</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            msg.safetyReport.overallRisk === 'SAFE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {msg.safetyReport.overallRisk}
                        </span>
                      </div>
                      {msg.safetyReport.summary && (
                        <p className='text-[11px] text-slate-600 leading-relaxed'>
                          {msg.safetyReport.summary}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Compact Clinical Verdict Card */}
                  {msg.role === 'bot' && msg.verdict && (
                    <ClinicalVerdictCard
                      verdict={msg.verdict}
                      currencySymbol={currencySymbol}
                      onBookDoctor={handleBookDoctor}
                      compact={true}
                    />
                  )}

                  {/* Direct Doctor Lookup Cards */}
                  {msg.role === 'bot' && !msg.verdict && msg.doctors && msg.doctors.length > 0 && (
                    <div className='space-y-1.5'>
                      {msg.doctors.map((doc) => (
                        <div
                          key={doc._id}
                          onClick={() => handleBookDoctor(doc, '')}
                          className='flex items-center justify-between gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl hover:border-primary transition-all cursor-pointer group'
                        >
                          <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                            <img
                              src={doc.image}
                              alt={doc.name}
                              className='w-10 h-10 rounded-xl object-cover bg-slate-50 shrink-0'
                            />
                            <div className='min-w-0 flex-1'>
                              <p className='font-bold text-slate-900 truncate text-xs group-hover:text-primary'>
                                {doc.name}
                              </p>
                              <p className='text-[11px] text-slate-500 truncate'>
                                {doc.speciality} • {doc.experience}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-1 shrink-0'>
                            <span className='font-bold text-slate-800 text-xs'>
                              {currencySymbol}{doc.fees}
                            </span>
                            <ChevronRight className='w-4 h-4 text-slate-400 group-hover:text-primary' />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dedicated Page Navigation CTA Button */}
                  {msg.role === 'bot' && msg.actionButton && msg.actionButton.path && (
                    <div className='pt-0.5'>
                      <button
                        type='button'
                        onClick={() => {
                          setIsOpen(false)
                          navigate(msg.actionButton.path)
                        }}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-sky-600 text-white text-xs font-semibold transition-colors cursor-pointer'
                      >
                        <span>{msg.actionButton.label}</span>
                        <ArrowRight className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  )}

                  {/* Quick-Reply Chips */}
                  {isLastBotMsg && !assistantLoading && msg.quickOptions && msg.quickOptions.length > 0 && (
                    <div className='space-y-1.5 pt-1'>
                      <div className='flex flex-wrap gap-1.5'>
                        {msg.quickOptions.map((opt, idx) => (
                          <button
                            key={idx}
                            type='button'
                            onClick={() => handleQuickOptionClick(opt)}
                            className='text-xs bg-sky-50/90 hover:bg-sky-600 text-sky-900 hover:text-white border border-sky-200/80 px-2.5 py-1.5 rounded-xl font-medium transition-colors cursor-pointer text-left'
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {msg.canSkipToVerdict && (
                        <button
                          type='button'
                          onClick={() => sendAssistantMessage('', { forceVerdict: true })}
                          className='inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-sky-600 cursor-pointer pt-0.5'
                        >
                          <span>Skip & see doctor match</span>
                          <ArrowRight className='w-3 h-3' />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {assistantLoading && (
              <div className='flex items-center gap-2 justify-start'>
                <MedBotAvatar mood='thinking' size='xs' />
                <div className='bg-slate-100 px-3.5 py-2 rounded-2xl rounded-bl-xs text-xs text-slate-600 font-medium'>
                  Analyzing your symptoms...
                </div>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className='p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0'>
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
                  ? 'Type your answer or select an option...'
                  : 'Describe symptoms or ask a question...'
              }
              disabled={assistantLoading}
              className='flex-1 bg-slate-50 border border-slate-200 focus:border-primary focus:bg-white rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none transition-all'
            />
            <button
              type='button'
              onClick={handleSend}
              disabled={assistantLoading || !input.trim()}
              aria-label='Send message'
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                assistantLoading || !input.trim()
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-sky-600 cursor-pointer'
              }`}
            >
              <Send className='w-4 h-4' />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default ChatWidget
