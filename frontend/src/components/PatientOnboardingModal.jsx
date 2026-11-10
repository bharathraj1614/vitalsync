import React, { useContext, useEffect, useId, useRef, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { AppContext } from '../context/AppContext'
import {
  BLOOD_GROUPS,
  COMMON_ALLERGY_OPTIONS,
  COMMON_CHRONIC_CONDITIONS,
  calculateProfileCompleteness,
  isDobValid,
  isGenderValid,
  isPhoneValid
} from '../utils/profileCompleteness'
import {
  ShieldCheck,
  UserCheck,
  HeartPulse,
  AlertTriangle,
  Pill,
  Activity,
  Phone,
  Calendar,
  MapPin,
  Plus,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Ruler,
  Scale,
  UserPlus
} from 'lucide-react'

const PatientOnboardingModal = ({ isOpen, onClose }) => {
  const { token, backendUrl, userData, setUserData, loadUserProfileData } = useContext(AppContext)
  const dialogRef = useRef(null)
  const titleId = useId()
  const baseId = useId()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // Form state synced from userData
  const [form, setForm] = useState({
    name: '',
    dob: '',
    gender: '',
    phone: '',
    bloodGroup: '',
    allergies: [],
    noKnownAllergies: false,
    currentMedications: [],
    noCurrentMedications: false,
    chronicConditions: [],
    noChronicConditions: false,
    heightCm: '',
    weightKg: '',
    address: { line1: '', line2: '' },
    emergencyContact: { name: '', relation: '', phone: '' }
  })

  // Draft inputs for custom additions
  const [customAllergy, setCustomAllergy] = useState('')
  const [customMed, setCustomMed] = useState({ name: '', dosage: '' })
  const [customCondition, setCustomCondition] = useState('')

  // Populate form when userData loads or modal opens
  useEffect(() => {
    if (!userData || !isOpen) return
    setForm({
      name: userData.name || '',
      dob: isDobValid(userData.dob) ? userData.dob : '',
      gender: isGenderValid(userData.gender) ? userData.gender : '',
      phone: isPhoneValid(userData.phone) ? userData.phone : '',
      bloodGroup: userData.bloodGroup || '',
      allergies: Array.isArray(userData.allergies) ? userData.allergies : [],
      noKnownAllergies: Boolean(userData.noKnownAllergies),
      currentMedications: Array.isArray(userData.currentMedications) ? userData.currentMedications : [],
      noCurrentMedications: Boolean(userData.noCurrentMedications),
      chronicConditions: Array.isArray(userData.chronicConditions) ? userData.chronicConditions : [],
      noChronicConditions: Boolean(userData.noChronicConditions),
      heightCm: userData.heightCm || '',
      weightKg: userData.weightKg || '',
      address: {
        line1: userData.address?.line1 || '',
        line2: userData.address?.line2 || ''
      },
      emergencyContact: {
        name: userData.emergencyContact?.name || '',
        relation: userData.emergencyContact?.relation || '',
        phone: userData.emergencyContact?.phone || ''
      }
    })
  }, [userData, isOpen])

  // Native <dialog> open/close control
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleNativeClose = () => {
      if (isOpen && onClose) onClose()
    }
    dialog.addEventListener('close', handleNativeClose)
    return () => dialog.removeEventListener('close', handleNativeClose)
  }, [isOpen, onClose])

  // Live completeness calculation based on draft form state
  const liveCompleteness = calculateProfileCompleteness(form)

  const calculateAge = (dobStr) => {
    if (!isDobValid(dobStr)) return null
    const birthDate = new Date(dobStr)
    const diffMs = Date.now() - birthDate.getTime()
    const ageDate = new Date(diffMs)
    const age = Math.abs(ageDate.getUTCFullYear() - 1970)
    return !isNaN(age) && age >= 0 && age < 130 ? age : null
  }

  const calculateBmi = (hCm, wKg) => {
    const h = Number(hCm)
    const w = Number(wKg)
    if (!h || !w || h < 40 || w < 2) return null
    const heightM = h / 100
    const bmi = w / (heightM * heightM)
    if (!isFinite(bmi) || bmi <= 0) return null
    let category = 'Normal'
    if (bmi < 18.5) category = 'Underweight'
    else if (bmi >= 25 && bmi < 30) category = 'Overweight'
    else if (bmi >= 30) category = 'Obese'
    return { value: bmi.toFixed(1), category }
  }

  // Contextual field validation on blur
  const validateFieldOnBlur = (fieldName, value = form[fieldName]) => {
    setErrors((prev) => {
      const next = { ...prev }
      if (fieldName === 'name') {
        if (!value || value.trim().length < 2) next.name = 'Enter your full legal name.'
        else delete next.name
      }
      if (fieldName === 'dob') {
        if (!isDobValid(value)) next.dob = 'Select your date of birth.'
        else delete next.dob
      }
      if (fieldName === 'gender') {
        if (!isGenderValid(value)) next.gender = 'Select your biological sex / gender.'
        else delete next.gender
      }
      if (fieldName === 'phone') {
        if (!isPhoneValid(value)) next.phone = 'Enter a valid mobile number (at least 7 digits).'
        else delete next.phone
      }
      return next
    })
  }

  const clearFieldError = (fieldName) => {
    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[fieldName]
        return next
      })
    }
  }

  const validateStep1 = () => {
    const nextErrors = {}
    if (!form.name || form.name.trim().length < 2) nextErrors.name = 'Enter your full legal name.'
    if (!isDobValid(form.dob)) nextErrors.dob = 'Select your date of birth.'
    if (!isGenderValid(form.gender)) nextErrors.gender = 'Select your biological sex / gender.'
    if (!isPhoneValid(form.phone)) nextErrors.phone = 'Enter a valid mobile number.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  // Allergy handlers
  const handleSelectNoAllergies = () => {
    setForm((prev) => ({
      ...prev,
      noKnownAllergies: !prev.noKnownAllergies,
      allergies: !prev.noKnownAllergies ? [] : prev.allergies
    }))
    clearFieldError('allergies')
  }

  const toggleAllergyOption = (allergyLabel) => {
    const clean = allergyLabel.trim()
    setForm((prev) => {
      const exists = prev.allergies.some((a) => a.toLowerCase() === clean.toLowerCase())
      const nextAllergies = exists
        ? prev.allergies.filter((a) => a.toLowerCase() !== clean.toLowerCase())
        : [...prev.allergies, clean]
      return {
        ...prev,
        allergies: nextAllergies,
        noKnownAllergies: false
      }
    })
    clearFieldError('allergies')
  }

  const handleAddCustomAllergy = () => {
    const clean = customAllergy.trim()
    if (!clean) return
    if (!form.allergies.some((a) => a.toLowerCase() === clean.toLowerCase())) {
      setForm((prev) => ({
        ...prev,
        allergies: [...prev.allergies, clean],
        noKnownAllergies: false
      }))
    }
    setCustomAllergy('')
    clearFieldError('allergies')
  }

  // Medication handlers
  const handleSelectNoMedications = () => {
    setForm((prev) => ({
      ...prev,
      noCurrentMedications: !prev.noCurrentMedications,
      currentMedications: !prev.noCurrentMedications ? [] : prev.currentMedications
    }))
  }

  const handleAddMedication = () => {
    const medName = customMed.name.trim()
    if (!medName) return
    setForm((prev) => ({
      ...prev,
      currentMedications: [
        ...prev.currentMedications,
        { name: medName, dosage: customMed.dosage.trim() }
      ],
      noCurrentMedications: false
    }))
    setCustomMed({ name: '', dosage: '' })
  }

  // Condition handlers
  const handleSelectNoConditions = () => {
    setForm((prev) => ({
      ...prev,
      noChronicConditions: !prev.noChronicConditions,
      chronicConditions: !prev.noChronicConditions ? [] : prev.chronicConditions
    }))
  }

  const toggleConditionOption = (condLabel) => {
    const clean = condLabel.trim()
    setForm((prev) => {
      const exists = prev.chronicConditions.some((c) => c.toLowerCase() === clean.toLowerCase())
      const nextConditions = exists
        ? prev.chronicConditions.filter((c) => c.toLowerCase() !== clean.toLowerCase())
        : [...prev.chronicConditions, clean]
      return {
        ...prev,
        chronicConditions: nextConditions,
        noChronicConditions: false
      }
    })
  }

  const handleAddCustomCondition = () => {
    const clean = customCondition.trim()
    if (!clean) return
    if (!form.chronicConditions.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      setForm((prev) => ({
        ...prev,
        chronicConditions: [...prev.chronicConditions, clean],
        noChronicConditions: false
      }))
    }
    setCustomCondition('')
  }

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateStep1()) {
        toast.warning('Please fill in the mandatory identity fields to continue.')
        return
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const handleSubmitProfile = async (e) => {
    e.preventDefault()
    if (!validateStep1()) {
      setStep(1)
      toast.warning('Please complete mandatory details in Step 1.')
      return
    }

    setSaving(true)
    try {
      // Auto-include any pending text in custom inputs
      const finalAllergies = [...form.allergies]
      let finalNoAllergies = form.noKnownAllergies
      if (customAllergy.trim()) {
        finalAllergies.push(customAllergy.trim())
        finalNoAllergies = false
        setCustomAllergy('')
      }

      const finalMeds = [...form.currentMedications]
      let finalNoMeds = form.noCurrentMedications
      if (customMed.name.trim()) {
        finalMeds.push({ name: customMed.name.trim(), dosage: customMed.dosage.trim() })
        finalNoMeds = false
        setCustomMed({ name: '', dosage: '' })
      }

      const finalConditions = [...form.chronicConditions]
      let finalNoConditions = form.noChronicConditions
      if (customCondition.trim()) {
        finalConditions.push(customCondition.trim())
        finalNoConditions = false
        setCustomCondition('')
      }

      const payload = new FormData()
      if (userData?._id) payload.append('userId', userData._id)
      payload.append('name', form.name.trim())
      payload.append('dob', form.dob)
      payload.append('gender', form.gender)
      payload.append('phone', form.phone.trim())
      payload.append('bloodGroup', form.bloodGroup || '')
      payload.append('allergies', JSON.stringify(finalNoAllergies ? [] : finalAllergies))
      payload.append('noKnownAllergies', String(finalNoAllergies))
      payload.append('currentMedications', JSON.stringify(finalNoMeds ? [] : finalMeds))
      payload.append('noCurrentMedications', String(finalNoMeds))
      payload.append('chronicConditions', JSON.stringify(finalNoConditions ? [] : finalConditions))
      payload.append('noChronicConditions', String(finalNoConditions))
      payload.append('heightCm', form.heightCm || '')
      payload.append('weightKg', form.weightKg || '')
      payload.append('address', JSON.stringify(form.address || { line1: '', line2: '' }))
      payload.append('emergencyContact', JSON.stringify(form.emergencyContact || { name: '', relation: '', phone: '' }))
      payload.append('onboardingCompleted', 'true')

      const { data } = await axios.post(`${backendUrl}/api/user/update-profile`, payload, {
        headers: { token }
      })

      if (data.success) {
        if (data.userData) {
          setUserData(data.userData)
        }
        await loadUserProfileData()
        window.dispatchEvent(new CustomEvent('vitalsync:profile-updated'))
        toast.success('Clinical health profile saved!')
        if (onClose) onClose()
      } else {
        toast.error(data.message || 'Could not save health profile.')
      }
    } catch (error) {
      console.error('Onboarding save error:', error)
      toast.error(error.response?.data?.message || 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  const patientAge = calculateAge(form.dob)
  const bmiInfo = calculateBmi(form.heightCm, form.weightKg)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className='w-[calc(100vw-1.5rem)] max-w-2xl max-h-[88dvh] rounded-3xl bg-white p-0 text-slate-900 shadow-2xl border border-slate-200 backdrop:bg-slate-950/65 backdrop:backdrop-blur-xs m-auto overflow-hidden'
    >
      <div className='flex flex-col max-h-[88dvh] w-full overflow-hidden'>
      {/* Top Clinical Header with Real-time Profile Completeness Bar */}
      <div className='shrink-0 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white p-4 sm:p-5 space-y-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='space-y-1'>
            <div className='inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-200 border border-sky-400/30'>
              <HeartPulse className='w-3.5 h-3.5 text-sky-300' />
              <span>Patient Clinical Intake • Step {step} of 3</span>
            </div>
            <h2 id={titleId} className='text-lg sm:text-xl font-extrabold tracking-tight text-white'>
              Complete your medical dossier
            </h2>
            <p className='text-xs text-slate-300 leading-relaxed'>
              Helps our doctors and AI safety engine screen prescriptions against your age, allergies, and active medications.
            </p>
          </div>

          <button
            type='button'
            onClick={onClose}
            aria-label='Finish setup later'
            title='Finish setup later'
            className='p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer shrink-0'
          >
            <X className='w-4 h-4' />
          </button>
        </div>

        {/* Live Profile Completeness Progress Bar */}
        <div className='bg-white/10 border border-white/15 rounded-2xl p-3.5 space-y-2'>
          <div className='flex items-center justify-between text-xs'>
            <span className='font-semibold text-slate-200 flex items-center gap-1.5'>
              <ShieldCheck className='w-4 h-4 text-emerald-400' />
              <span>Profile completeness</span>
            </span>
            <span className='font-extrabold tabular-nums text-white text-sm'>
              {liveCompleteness.percentage}%
            </span>
          </div>

          <div
            className='w-full h-2.5 bg-slate-950/60 rounded-full overflow-hidden p-0.5'
            role='progressbar'
            aria-valuenow={liveCompleteness.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label='Profile completeness percentage'
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                liveCompleteness.percentage === 100
                  ? 'bg-emerald-400'
                  : liveCompleteness.percentage >= 75
                  ? 'bg-sky-400'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${liveCompleteness.percentage}%` }}
            />
          </div>

          <div className='flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300'>
            {!liveCompleteness.allergiesAnswered ? (
              <span className='text-amber-300 font-medium flex items-center gap-1'>
                <AlertTriangle className='w-3.5 h-3.5 shrink-0' />
                <span>Allergies unconfirmed (limits progress by 15% — add allergies or select &ldquo;None&rdquo; in Step 2)</span>
              </span>
            ) : (
              <span className='text-emerald-300 font-medium flex items-center gap-1'>
                <CheckCircle2 className='w-3.5 h-3.5 shrink-0' />
                <span>
                  {form.noKnownAllergies
                    ? 'Allergy status confirmed: No known allergies (+15%)'
                    : `Allergies recorded: ${form.allergies.length} item(s) (+15%)`}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Step Navigation Indicator */}
        <nav aria-label='Onboarding progress' className='grid grid-cols-3 gap-2 pt-1'>
          {[
            { num: 1, label: '1. Mandatory Info' },
            { num: 2, label: '2. Allergies & Meds' },
            { num: 3, label: '3. Vitals & Emergency' }
          ].map((item) => (
            <button
              key={item.num}
              type='button'
              onClick={() => {
                if (item.num === 1 || validateStep1()) setStep(item.num)
              }}
              aria-current={step === item.num ? 'step' : undefined}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold text-left transition-all cursor-pointer border ${
                step === item.num
                  ? 'bg-white text-slate-900 border-white shadow-xs'
                  : step > item.num
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              <span className='truncate block'>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmitProfile} noValidate className='flex flex-col flex-1 min-h-0 overflow-hidden'>
        <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5'>
        {/* STEP 1: MANDATORY DEMOGRAPHICS & CONTACT */}
        {step === 1 && (
          <fieldset className='space-y-4'>
            <legend className='text-sm font-extrabold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100 w-full'>
              <UserCheck className='w-4 h-4 text-sky-600' />
              <span>Mandatory identity & clinical triage details</span>
            </legend>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {/* Full Name */}
              <div>
                <label htmlFor={`${baseId}-name`} className='block text-xs font-bold text-slate-700 mb-1.5'>
                  Full legal name <span className='text-rose-600'>*</span>
                </label>
                <input
                  id={`${baseId}-name`}
                  name='name'
                  type='text'
                  required
                  autoComplete='name'
                  value={form.name}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                    clearFieldError('name')
                  }}
                  onBlur={(e) => validateFieldOnBlur('name', e.target.value)}
                  aria-describedby={errors.name ? `${baseId}-name-err` : undefined}
                  placeholder='e.g. Bharath Raj'
                  className='w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-600 bg-slate-50/50 focus:bg-white'
                />
                {errors.name && (
                  <p id={`${baseId}-name-err`} aria-live='polite' className='text-xs text-rose-600 font-semibold mt-1'>
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Mobile Phone Number */}
              <div>
                <label htmlFor={`${baseId}-phone`} className='block text-xs font-bold text-slate-700 mb-1.5'>
                  Mobile phone number <span className='text-rose-600'>*</span>
                </label>
                <input
                  id={`${baseId}-phone`}
                  name='phone'
                  type='tel'
                  inputMode='tel'
                  autoComplete='tel'
                  required
                  value={form.phone}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                    clearFieldError('phone')
                  }}
                  onBlur={(e) => validateFieldOnBlur('phone', e.target.value)}
                  aria-describedby={errors.phone ? `${baseId}-phone-err` : `${baseId}-phone-hint`}
                  placeholder='+91 98765 43210'
                  className='w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-600 bg-slate-50/50 focus:bg-white tabular-nums'
                />
                {errors.phone ? (
                  <p id={`${baseId}-phone-err`} aria-live='polite' className='text-xs text-rose-600 font-semibold mt-1'>
                    {errors.phone}
                  </p>
                ) : (
                  <p id={`${baseId}-phone-hint`} className='text-[11px] text-slate-400 mt-1'>
                    Used for doctor consultation alerts and emergency callback.
                  </p>
                )}
              </div>

              {/* Date of Birth */}
              <div>
                <label htmlFor={`${baseId}-dob`} className='block text-xs font-bold text-slate-700 mb-1.5'>
                  Date of birth <span className='text-rose-600'>*</span>
                  {patientAge !== null && (
                    <span className='ml-2 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold'>
                      {patientAge} yrs old
                    </span>
                  )}
                </label>
                <input
                  id={`${baseId}-dob`}
                  name='dob'
                  type='date'
                  required
                  autoComplete='bday'
                  max={new Date().toISOString().split('T')[0]}
                  value={form.dob}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, dob: e.target.value }))
                    clearFieldError('dob')
                  }}
                  onBlur={(e) => validateFieldOnBlur('dob', e.target.value)}
                  aria-describedby={errors.dob ? `${baseId}-dob-err` : undefined}
                  className='w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-600 bg-slate-50/50 focus:bg-white'
                />
                {errors.dob && (
                  <p id={`${baseId}-dob-err`} aria-live='polite' className='text-xs text-rose-600 font-semibold mt-1'>
                    {errors.dob}
                  </p>
                )}
              </div>

              {/* Biological Sex / Gender (Visible Radio Pills per <6 Options Rule) */}
              <div>
                <span className='block text-xs font-bold text-slate-700 mb-1.5'>
                  Biological sex / gender <span className='text-rose-600'>*</span>
                </span>
                <div className='grid grid-cols-3 gap-2' role='radiogroup' aria-label='Biological sex or gender'>
                  {['Male', 'Female', 'Other'].map((gOption) => {
                    const selected = form.gender === gOption
                    return (
                      <label
                        key={gOption}
                        className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          selected
                            ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <input
                          type='radio'
                          name='gender'
                          value={gOption}
                          checked={selected}
                          onChange={() => {
                            setForm((prev) => ({ ...prev, gender: gOption }))
                            clearFieldError('gender')
                          }}
                          className='sr-only'
                        />
                        <span>{gOption}</span>
                      </label>
                    )
                  })}
                </div>
                {errors.gender && (
                  <p aria-live='polite' className='text-xs text-rose-600 font-semibold mt-1'>
                    {errors.gender}
                  </p>
                )}
              </div>
            </div>

            {/* Blood Group Selector */}
            <div className='pt-1'>
              <span className='block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5'>
                <Droplets className='w-3.5 h-3.5 text-rose-500' />
                <span>Blood group (+10% completeness)</span>
              </span>
              <div className='flex flex-wrap gap-2' role='radiogroup' aria-label='Blood group'>
                {BLOOD_GROUPS.map((bg) => {
                  const selected = form.bloodGroup === bg
                  return (
                    <label
                      key={bg}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        selected
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                      }`}
                    >
                      <input
                        type='radio'
                        name='bloodGroup'
                        value={bg}
                        checked={selected}
                        onChange={() => setForm((prev) => ({ ...prev, bloodGroup: bg }))}
                        className='sr-only'
                      />
                      <span>{bg}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </fieldset>
        )}

        {/* STEP 2: ALLERGIES, REGULAR MEDICATIONS & CHRONIC CONDITIONS */}
        {step === 2 && (
          <div className='space-y-6'>
            {/* 1. Allergies Section with Explicit "None" Option */}
            <fieldset className='bg-rose-50/40 border border-rose-200/80 rounded-2xl p-4 space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <legend className='text-xs font-extrabold uppercase tracking-wider text-rose-900 flex items-center gap-1.5'>
                  <AlertTriangle className='w-4 h-4 text-rose-600' />
                  <span>1. Known Drug or Food Allergies (+15% completeness)</span>
                </legend>
                {liveCompleteness.allergiesAnswered ? (
                  <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800'>
                    ✓ Completed
                  </span>
                ) : (
                  <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900'>
                    Action required for 100%
                  </span>
                )}
              </div>

              <p className='text-xs text-slate-600'>
                Select any allergies below, or choose <strong>&ldquo;None (No known allergies)&rdquo;</strong> if you do not have any allergies.
              </p>

              {/* Prominent "None (No known allergies)" Option */}
              <button
                type='button'
                onClick={handleSelectNoAllergies}
                aria-pressed={form.noKnownAllergies}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  form.noKnownAllergies
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <div className='flex items-center gap-2.5'>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                      form.noKnownAllergies ? 'bg-white text-emerald-600 border-white' : 'border-slate-300 bg-slate-50'
                    }`}
                  >
                    {form.noKnownAllergies && <Check className='w-3.5 h-3.5 stroke-[3]' />}
                  </div>
                  <div>
                    <p className='text-xs font-extrabold'>None — I have no known drug or food allergies (NKDA)</p>
                    <p className={`text-[11px] ${form.noKnownAllergies ? 'text-emerald-100' : 'text-slate-500'}`}>
                      Confirms you have no allergies and unlocks full allergy completeness credit
                    </p>
                  </div>
                </div>
              </button>

              {/* Quick-select common allergy chips */}
              <div className='space-y-2 pt-1'>
                <span className='text-[11px] font-bold text-slate-600 block'>
                  Or tap known allergens:
                </span>
                <div className='flex flex-wrap gap-1.5'>
                  {COMMON_ALLERGY_OPTIONS.map((item) => {
                    const active = form.allergies.some((a) => a.toLowerCase() === item.toLowerCase())
                    return (
                      <button
                        key={item}
                        type='button'
                        onClick={() => toggleAllergyOption(item)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        {active ? `✓ ${item}` : `+ ${item}`}
                      </button>
                    )
                  })}
                </div>

                {/* Custom Allergy Input */}
                <div className='flex gap-2 pt-1'>
                  <input
                    type='text'
                    value={customAllergy}
                    onChange={(e) => setCustomAllergy(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        handleAddCustomAllergy()
                      }
                    }}
                    placeholder='Other allergy (e.g. Ciprofloxacin, Dust, Egg)...'
                    className='flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-rose-500'
                  />
                  <button
                    type='button'
                    onClick={handleAddCustomAllergy}
                    className='px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0'
                  >
                    <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                  </button>
                </div>

                {/* Selected Allergies List */}
                {form.allergies.length > 0 && (
                  <div className='flex flex-wrap gap-1.5 pt-2'>
                    {form.allergies.map((alg, idx) => (
                      <span
                        key={idx}
                        className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 text-xs font-bold'
                      >
                        <span>{alg}</span>
                        <button
                          type='button'
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              allergies: prev.allergies.filter((_, i) => i !== idx)
                            }))
                          }
                          aria-label={`Remove ${alg}`}
                          className='hover:text-rose-600 cursor-pointer'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </fieldset>

            {/* 2. Current Regular Medications Section with "None" Option */}
            <fieldset className='bg-sky-50/40 border border-sky-200/80 rounded-2xl p-4 space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <legend className='text-xs font-extrabold uppercase tracking-wider text-sky-900 flex items-center gap-1.5'>
                  <Pill className='w-4 h-4 text-sky-600' />
                  <span>2. Current Regular Medications (+10% completeness)</span>
                </legend>
                {liveCompleteness.medicationsAnswered && (
                  <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800'>
                    ✓ Completed
                  </span>
                )}
              </div>

              <button
                type='button'
                onClick={handleSelectNoMedications}
                aria-pressed={form.noCurrentMedications}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                  form.noCurrentMedications
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center border ${
                    form.noCurrentMedications ? 'bg-white text-emerald-600 border-white' : 'border-slate-300'
                  }`}
                >
                  {form.noCurrentMedications && <Check className='w-3 h-3 stroke-[3]' />}
                </div>
                <span className='text-xs font-bold'>None — I am not taking any regular medications</span>
              </button>

              <div className='flex flex-wrap gap-2'>
                <input
                  type='text'
                  value={customMed.name}
                  onChange={(e) => setCustomMed((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder='Medicine name (e.g. Metformin, Thyronorm)...'
                  className='flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-sky-500'
                />
                <input
                  type='text'
                  value={customMed.dosage}
                  onChange={(e) => setCustomMed((prev) => ({ ...prev, dosage: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      handleAddMedication()
                    }
                  }}
                  placeholder='Dosage (e.g. 500mg daily)'
                  className='w-36 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-sky-500'
                />
                <button
                  type='button'
                  onClick={handleAddMedication}
                  className='px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer'
                >
                  <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                </button>
              </div>

              {form.currentMedications.length > 0 && (
                <div className='space-y-1.5 pt-1'>
                  {form.currentMedications.map((med, idx) => (
                    <div
                      key={idx}
                      className='flex items-center justify-between bg-white border border-sky-200 px-3 py-2 rounded-xl text-xs'
                    >
                      <div>
                        <span className='font-bold text-slate-900'>{med.name}</span>
                        {med.dosage && <span className='text-slate-500 ml-1.5'>({med.dosage})</span>}
                      </div>
                      <button
                        type='button'
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            currentMedications: prev.currentMedications.filter((_, i) => i !== idx)
                          }))
                        }
                        className='text-slate-400 hover:text-rose-600 cursor-pointer'
                      >
                        <X className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>

            {/* 3. Chronic Conditions Section with "None" Option */}
            <fieldset className='bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <legend className='text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5'>
                  <Activity className='w-4 h-4 text-indigo-600' />
                  <span>3. Pre-existing / Chronic Conditions (+5% completeness)</span>
                </legend>
                {liveCompleteness.conditionsAnswered && (
                  <span className='px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800'>
                    ✓ Completed
                  </span>
                )}
              </div>

              <button
                type='button'
                onClick={handleSelectNoConditions}
                aria-pressed={form.noChronicConditions}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                  form.noChronicConditions
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center border ${
                    form.noChronicConditions ? 'bg-white text-emerald-600 border-white' : 'border-slate-300'
                  }`}
                >
                  {form.noChronicConditions && <Check className='w-3 h-3 stroke-[3]' />}
                </div>
                <span className='text-xs font-bold'>None — No chronic medical conditions</span>
              </button>

              <div className='flex flex-wrap gap-1.5'>
                {COMMON_CHRONIC_CONDITIONS.map((cond) => {
                  const active = form.chronicConditions.some((c) => c.toLowerCase() === cond.toLowerCase())
                  return (
                    <button
                      key={cond}
                      type='button'
                      onClick={() => toggleConditionOption(cond)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {active ? `✓ ${cond}` : `+ ${cond}`}
                    </button>
                  )
                })}
              </div>

              <div className='flex gap-2'>
                <input
                  type='text'
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      handleAddCustomCondition()
                    }
                  }}
                  placeholder='Other condition...'
                  className='flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-indigo-500'
                />
                <button
                  type='button'
                  onClick={handleAddCustomCondition}
                  className='px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer'
                >
                  <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 3: BODY VITALS, ADDRESS & EMERGENCY CONTACT */}
        {step === 3 && (
          <fieldset className='space-y-5'>
            <legend className='text-sm font-extrabold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100 w-full'>
              <Activity className='w-4 h-4 text-sky-600' />
              <span>Baseline vitals, address & emergency contact (Final 10%)</span>
            </legend>

            {/* Height & Weight with Live BMI */}
            <div className='bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-slate-800'>Body metrics (for dosage & BMI baseline)</span>
                {bmiInfo && (
                  <span className='px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 tabular-nums'>
                    BMI: {bmiInfo.value} ({bmiInfo.category})
                  </span>
                )}
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label htmlFor={`${baseId}-height`} className='block text-xs font-medium text-slate-600 mb-1'>
                    <Ruler className='w-3.5 h-3.5 inline mr-1 text-slate-400' />
                    Height (cm)
                  </label>
                  <input
                    id={`${baseId}-height`}
                    type='number'
                    min='40'
                    max='250'
                    placeholder='e.g. 172'
                    value={form.heightCm}
                    onChange={(e) => setForm((prev) => ({ ...prev, heightCm: e.target.value }))}
                    className='w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-sky-600 tabular-nums'
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-weight`} className='block text-xs font-medium text-slate-600 mb-1'>
                    <Scale className='w-3.5 h-3.5 inline mr-1 text-slate-400' />
                    Weight (kg)
                  </label>
                  <input
                    id={`${baseId}-weight`}
                    type='number'
                    min='2'
                    max='300'
                    placeholder='e.g. 68'
                    value={form.weightKg}
                    onChange={(e) => setForm((prev) => ({ ...prev, weightKg: e.target.value }))}
                    className='w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-sky-600 tabular-nums'
                  />
                </div>
              </div>
            </div>

            {/* Residential Address */}
            <div className='space-y-2.5'>
              <label htmlFor={`${baseId}-addr1`} className='block text-xs font-bold text-slate-800'>
                <MapPin className='w-3.5 h-3.5 inline mr-1 text-sky-600' />
                Residential address (+5% completeness)
              </label>
              <input
                id={`${baseId}-addr1`}
                type='text'
                autoComplete='address-line1'
                placeholder='Street address, apartment, or locality'
                value={form.address.line1}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: { ...prev.address, line1: e.target.value } }))
                }
                className='w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-600'
              />
              <input
                type='text'
                autoComplete='address-line2'
                placeholder='City, State, PIN / Postal code'
                value={form.address.line2}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, address: { ...prev.address, line2: e.target.value } }))
                }
                className='w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-600'
              />
            </div>

            {/* Emergency Contact */}
            <div className='bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3'>
              <span className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                <UserPlus className='w-3.5 h-3.5 text-rose-600' />
                <span>Emergency contact person (Next of kin)</span>
              </span>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5'>
                <input
                  type='text'
                  placeholder='Contact name'
                  value={form.emergencyContact.name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      emergencyContact: { ...prev.emergencyContact, name: e.target.value }
                    }))
                  }
                  className='border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-sky-600'
                />
                <input
                  type='text'
                  placeholder='Relation (e.g. Spouse, Parent)'
                  value={form.emergencyContact.relation}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      emergencyContact: { ...prev.emergencyContact, relation: e.target.value }
                    }))
                  }
                  className='border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-sky-600'
                />
                <input
                  type='tel'
                  inputMode='tel'
                  placeholder='Emergency phone'
                  value={form.emergencyContact.phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      emergencyContact: { ...prev.emergencyContact, phone: e.target.value }
                    }))
                  }
                  className='border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-sky-600 tabular-nums'
                />
              </div>
            </div>
          </fieldset>
        )}
        </div>

        {/* Sticky Footer Actions */}
        <div className='shrink-0 px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3'>
          <div>
            {step > 1 ? (
              <button
                type='button'
                onClick={() => setStep((s) => s - 1)}
                className='inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer'
              >
                <ArrowLeft className='w-3.5 h-3.5' />
                <span>Previous</span>
              </button>
            ) : (
              <button
                type='button'
                onClick={onClose}
                className='text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer px-2 py-1'
              >
                I&apos;ll finish later
              </button>
            )}
          </div>

          <div className='flex items-center gap-2.5'>
            {step < 3 ? (
              <button
                type='button'
                onClick={handleNextStep}
                className='inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer'
              >
                <span>Continue</span>
                <ArrowRight className='w-3.5 h-3.5' />
              </button>
            ) : (
              <button
                type='submit'
                disabled={saving}
                className='inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50'
              >
                <CheckCircle2 className='w-4 h-4' />
                <span>{saving ? 'Saving profile...' : `Save health profile (${liveCompleteness.percentage}%)`}</span>
              </button>
            )}
          </div>
        </div>
      </form>
      </div>
    </dialog>
  )
}

export default PatientOnboardingModal
