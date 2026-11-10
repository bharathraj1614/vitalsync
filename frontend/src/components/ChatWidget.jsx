import React, { useState, useRef, useEffect, useContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { ClinicalVerdictCard, UnderstoodConfirmationBar } from '../pages/SymptomChecker'
import MedBotAvatar from './MedBotAvatar'
import {
  X,
  Send,
  RotateCcw,
  Info,
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

  const handleBookDoctor = (doc, clinicalSummary) => {
    setIsOpen(false)
    navigate(`/appointment/${doc._id}`, {
      state: {
        prefilledSymptoms:
          clinicalSummary ||
          assistantTriageState.chiefComplaint ||
          'AI Clinical Assistant referral'
      }
    })
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='fixed bottom-6 right-6 z-50 pl-2 pr-4 h-12 rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/30 border border-slate-700 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 cursor-pointer'
        aria-label='Ask Health Assistant'
      >
        {isOpen ? (
          <>
            <X className='w-5 h-5 text-white ml-1.5' />
            <span className='text-xs font-bold'>Close</span>
          </>
        ) : (
          <>
            <MedBotAvatar mood={assistantLoading ? 'thinking' : 'welcome'} size='xs' />
            <span className='text-xs font-bold'>Need Help? Ask MedBot</span>
          </>
        )}
      </button>

      {/* Synchronized Chat Window */}
      <div
        className={`fixed bottom-20 right-6 z-50 transition-all duration-200 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className='w-[360px] sm:w-[420px] max-h-[min(600px,82dvh)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-clip'>
          {/* Header */}
          <div className='px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0'>
            <div className='flex items-center gap-2.5'>
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
              <div>
                <div className='flex items-center gap-1.5'>
                  <h3 className='font-bold text-sm tracking-tight text-white'>VitalSync MedBot</h3>
                  <span className='w-2 h-2 rounded-full bg-emerald-400' />
                </div>
                <p className='text-[11px] text-slate-300'>
                  {assistantTriageState.active
                    ? `Symptom Triage • Step ${assistantTriageState.questionCount} of 2`
                    : 'Symptom triage, specialists & drug safety'}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-1'>
              <button
                type='button'
                onClick={() => {
                  setIsOpen(false)
                  navigate('/symptom-checker')
                }}
                className='p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer'
                title='Expand to Full Clinical Workspace'
              >
                <Maximize2 className='w-4 h-4' />
              </button>
              <button
                type='button'
                onClick={resetAssistantChat}
                className='p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer'
                title='Start over'
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

          {/* Safety Note */}
          <div className='bg-sky-50/70 px-3.5 py-2 border-b border-sky-100 flex items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0'>
            <span className='flex items-center gap-1.5'>
              <Info className='w-3.5 h-3.5 text-primary shrink-0' />
              <span>Emergency? Call 108 / 112 immediately.</span>
            </span>
            <button
              type='button'
              onClick={() => {
                setIsOpen(false)
                navigate('/symptom-checker')
              }}
              className='font-bold text-sky-700 hover:underline cursor-pointer shrink-0'
            >
              Full view ↗
            </button>
          </div>

          {/* Messages Body */}
          <div
            ref={messagesContainerRef}
            className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 text-sm'
            style={{ maxHeight: '390px', minHeight: '250px' }}
          >
            {assistantMessages.map((msg, i) => {
              const isLastBotMsg = msg.role === 'bot' && i === assistantMessages.length - 1

              return (
                <div key={msg.id || i} className='space-y-2.5'>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-br-xs font-medium'
                          : 'bg-slate-100 text-slate-800 border border-slate-200/60 rounded-bl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>

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
                        <span className='font-bold text-slate-800 flex items-center gap-1'>
                          <Pill className='w-3.5 h-3.5 text-sky-600' /> Safety Screen
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
                        <p className='text-[11px] text-slate-600'>{msg.safetyReport.summary}</p>
                      )}
                    </div>
                  )}

                  {/* Compact Dual-Specialist Verdict Card */}
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
                          className='flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl hover:border-primary transition-all cursor-pointer group'
                        >
                          <div className='flex items-center gap-2.5 min-w-0'>
                            <img
                              src={doc.image}
                              alt={doc.name}
                              className='w-9 h-9 rounded-full object-cover bg-slate-50'
                            />
                            <div className='min-w-0'>
                              <p className='font-bold text-slate-900 truncate text-xs group-hover:text-primary'>
                                {doc.name}
                              </p>
                              <p className='text-[10px] text-slate-500 truncate'>
                                {doc.speciality} • {doc.experience}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-1 shrink-0 pl-2'>
                            <span className='font-bold text-slate-800 text-xs'>
                              {currencySymbol}{doc.fees}
                            </span>
                            <ChevronRight className='w-4 h-4 text-slate-400 group-hover:text-primary' />
                          </div>
                        </div>
                      ))}
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
                            onClick={() => sendAssistantMessage(opt)}
                            className='text-[11px] bg-sky-50 hover:bg-sky-600 text-sky-900 hover:text-white border border-sky-200 px-2.5 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer text-left'
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {msg.canSkipToVerdict && (
                        <button
                          type='button'
                          onClick={() => sendAssistantMessage('', { forceVerdict: true })}
                          className='inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-sky-600 underline cursor-pointer pt-0.5'
                        >
                          <span>Skip & show doctor recommendation</span>
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
                <div className='bg-slate-100 border border-slate-200/60 px-3.5 py-2 rounded-2xl rounded-bl-xs'>
                  <div className='flex items-center gap-2 text-xs text-slate-600'>
                    <span className='font-medium'>MedBot is analyzing your clinical profile...</span>
                  </div>
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
                  ? 'Type your answer or tap an option...'
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
