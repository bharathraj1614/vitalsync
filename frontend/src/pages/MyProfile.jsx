import React, { useContext, useEffect, useState } from 'react'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import {
  User,
  Mail,
  Phone,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Pill,
  Camera,
  Edit3,
  Save,
  Plus,
  X,
  KeyRound,
  CheckCircle2,
  Lock,
  HeartHandshake,
  Activity,
  Droplets,
  Ruler,
  Scale,
  UserPlus,
  Sparkles,
  Check
} from 'lucide-react'
import GoogleAuthButton, { GoogleLogoIcon } from '../components/GoogleAuthButton'
import {
  BLOOD_GROUPS,
  COMMON_ALLERGY_OPTIONS,
  COMMON_CHRONIC_CONDITIONS,
  calculateProfileCompleteness
} from '../utils/profileCompleteness'

const MyProfile = () => {
  const [isEdit, setIsEdit] = useState(false)
  const [image, setImage] = useState(false)
  const [newAllergy, setNewAllergy] = useState('')
  const [newMed, setNewMed] = useState({ name: '', dosage: '' })
  const [newCondition, setNewCondition] = useState('')
  const [saving, setSaving] = useState(false)

  const { token, backendUrl, userData, setUserData, loadUserProfileData } = useContext(AppContext)

  useEffect(() => {
    const handleWizardSaved = () => {
      setIsEdit(false)
      setImage(false)
    }
    window.addEventListener('vitalsync:profile-updated', handleWizardSaved)
    return () => window.removeEventListener('vitalsync:profile-updated', handleWizardSaved)
  }, [])

  const calculateAge = (dob) => {
    if (!dob || dob === 'Not Selected') return null
    const birthDate = new Date(dob)
    const diffMs = Date.now() - birthDate.getTime()
    const ageDate = new Date(diffMs)
    const age = Math.abs(ageDate.getUTCFullYear() - 1970)
    return !isNaN(age) && age > 0 && age < 130 ? age : null
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

  // Update user profile
  const updateUserProfileData = async () => {
    setSaving(true)
    try {
      const finalAllergies = [...(userData.allergies || [])]
      let finalNoAllergies = Boolean(userData.noKnownAllergies)
      if (newAllergy.trim()) {
        const pendingAllergy = newAllergy.trim()
        if (!finalAllergies.some((a) => a.toLowerCase() === pendingAllergy.toLowerCase())) {
          finalAllergies.push(pendingAllergy)
        }
        finalNoAllergies = false
        setNewAllergy('')
      }

      const finalMeds = [...(userData.currentMedications || [])]
      let finalNoMeds = Boolean(userData.noCurrentMedications)
      if (newMed.name.trim()) {
        finalMeds.push({ name: newMed.name.trim(), dosage: newMed.dosage.trim() })
        finalNoMeds = false
        setNewMed({ name: '', dosage: '' })
      }

      const finalConditions = [...(userData.chronicConditions || [])]
      let finalNoConditions = Boolean(userData.noChronicConditions)
      if (newCondition.trim()) {
        const pendingCond = newCondition.trim()
        if (!finalConditions.some((c) => c.toLowerCase() === pendingCond.toLowerCase())) {
          finalConditions.push(pendingCond)
        }
        finalNoConditions = false
        setNewCondition('')
      }

      const formData = new FormData()
      if (userData?._id) formData.append('userId', userData._id)
      formData.append('name', userData.name)
      formData.append('phone', userData.phone || '')
      formData.append('address', JSON.stringify(userData.address || {}))
      formData.append('gender', userData.gender || '')
      formData.append('dob', userData.dob || '')
      formData.append('bloodGroup', userData.bloodGroup || '')
      formData.append('heightCm', userData.heightCm || '')
      formData.append('weightKg', userData.weightKg || '')
      formData.append('emergencyContact', JSON.stringify(userData.emergencyContact || {}))
      formData.append('allergies', JSON.stringify(finalNoAllergies ? [] : finalAllergies))
      formData.append('noKnownAllergies', String(finalNoAllergies))
      formData.append('currentMedications', JSON.stringify(finalNoMeds ? [] : finalMeds))
      formData.append('noCurrentMedications', String(finalNoMeds))
      formData.append('chronicConditions', JSON.stringify(finalNoConditions ? [] : finalConditions))
      formData.append('noChronicConditions', String(finalNoConditions))
      formData.append('onboardingCompleted', 'true')

      if (image) formData.append('image', image)

      const { data } = await axios.post(
        `${backendUrl}/api/user/update-profile`,
        formData,
        { headers: { token } }
      )

      if (data.success) {
        if (data.userData) setUserData(data.userData)
        toast.success('Patient profile updated successfully')
        await loadUserProfileData()
        setIsEdit(false)
        setImage(false)
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.error('Update profile error:', error)
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  // Quick-save "None" for allergies even when not in full edit mode
  const quickConfirmNoAllergies = async () => {
    try {
      const formData = new FormData()
      if (userData?._id) formData.append('userId', userData._id)
      formData.append('name', userData.name)
      formData.append('phone', userData.phone || '000000000')
      formData.append('address', JSON.stringify(userData.address || {}))
      formData.append('gender', userData.gender || 'Not Selected')
      formData.append('dob', userData.dob || 'Not Selected')
      formData.append('allergies', JSON.stringify([]))
      formData.append('noKnownAllergies', 'true')

      const { data } = await axios.post(`${backendUrl}/api/user/update-profile`, formData, {
        headers: { token }
      })
      if (data.success) {
        toast.success('Confirmed: No known allergies (NKDA)')
        await loadUserProfileData()
      }
    } catch (error) {
      toast.error('Could not update allergy status')
    }
  }

  const addAllergy = (allergyText) => {
    const clean = allergyText.trim()
    if (!clean) return
    const current = userData.allergies || []
    if (current.some((a) => a.toLowerCase() === clean.toLowerCase())) {
      toast.info('Allergy already added')
      return
    }
    setUserData((prev) => ({
      ...prev,
      allergies: [...(prev.allergies || []), clean],
      noKnownAllergies: false
    }))
    setNewAllergy('')
  }

  const addCondition = (condText) => {
    const clean = condText.trim()
    if (!clean) return
    const current = userData.chronicConditions || []
    if (current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.info('Condition already added')
      return
    }
    setUserData((prev) => ({
      ...prev,
      chronicConditions: [...(prev.chronicConditions || []), clean],
      noChronicConditions: false
    }))
    setNewCondition('')
  }

  if (!userData) {
    return (
      <div className='min-h-[80vh] py-8 max-w-4xl mx-auto'>
        <div className='h-96 rounded-3xl bg-slate-200/80 animate-pulse' />
      </div>
    )
  }

  const patientAge = calculateAge(userData.dob)
  const bmiInfo = calculateBmi(userData.heightCm, userData.weightKg)
  const completeness = calculateProfileCompleteness(userData)

  return (
    <div className='min-h-[85vh] py-8 max-w-5xl mx-auto space-y-7'>
      {/* Patient Dossier Header Banner */}
      <section className='bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 border border-slate-700/50 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl'>
        <div className='absolute -right-20 -top-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none' />

        <div className='relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6'>
          <div className='space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-200 border border-sky-400/30'>
                <User className='w-3.5 h-3.5' />
                <span>Patient health dossier</span>
              </span>
              <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-slate-300 bg-white/10 border border-white/15'>
                <ShieldCheck className='w-3.5 h-3.5 text-emerald-400' />
                <span>{completeness.percentage}% Complete</span>
              </span>
              {patientAge && (
                <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-slate-300 bg-white/10 border border-white/15 tabular-nums'>
                  {patientAge} yrs • {userData.gender || 'Patient'}
                </span>
              )}
              {userData.bloodGroup && (
                <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-rose-200 bg-rose-500/20 border border-rose-400/30'>
                  <Droplets className='w-3 h-3 text-rose-300' />
                  <span>{userData.bloodGroup}</span>
                </span>
              )}
            </div>

            <h1 className='text-2xl sm:text-3xl font-extrabold tracking-tight text-white'>
              {userData.name}
            </h1>

            <p className='text-slate-300 text-xs sm:text-sm leading-relaxed max-w-xl'>
              Keep your contact details, reported drug allergies, and current medications updated so your treating doctors can formulate safe prescriptions.
            </p>
          </div>

          <div className='shrink-0 flex flex-wrap items-center gap-2.5'>
            <button
              type='button'
              onClick={() => window.dispatchEvent(new CustomEvent('vitalsync:open-onboarding'))}
              className='inline-flex items-center gap-2 px-4 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 border border-sky-400/30 rounded-xl text-xs font-bold transition-colors cursor-pointer'
            >
              <Sparkles className='w-3.5 h-3.5 text-sky-300' />
              <span>Guided Setup Wizard</span>
            </button>

            {isEdit ? (
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    setIsEdit(false)
                    setImage(false)
                    loadUserProfileData()
                  }}
                  className='px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  disabled={saving}
                  onClick={updateUserProfileData}
                  className='inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50'
                >
                  <Save className='w-4 h-4' />
                  <span>{saving ? 'Saving...' : 'Save changes'}</span>
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => setIsEdit(true)}
                className='inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer'
              >
                <Edit3 className='w-4 h-4 text-sky-600' />
                <span>Edit profile</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Profile Completeness Progress Card */}
      <section className='bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-extrabold text-slate-900'>
                Clinical Profile Completeness
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                  completeness.percentage === 100
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : completeness.percentage >= 75
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {completeness.percentage}%
              </span>
            </div>
            <p className='text-xs text-slate-500 mt-0.5'>
              {completeness.percentage === 100
                ? 'Your medical dossier is 100% complete and synced for AI symptom triage and prescription safety checks.'
                : 'Complete the remaining sections below so doctors and our safety engine have your full clinical context.'}
            </p>
          </div>

          {!completeness.allergiesAnswered && (
            <button
              type='button'
              onClick={quickConfirmNoAllergies}
              className='inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors cursor-pointer shrink-0'
            >
              <Check className='w-3.5 h-3.5 text-amber-700' />
              <span>Select &ldquo;None (No known allergies)&rdquo; (+15%)</span>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div
          className='w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/70'
          role='progressbar'
          aria-valuenow={completeness.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label='Profile completeness percentage'
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              completeness.percentage === 100
                ? 'bg-emerald-500'
                : completeness.percentage >= 75
                ? 'bg-sky-600'
                : 'bg-amber-500'
            }`}
            style={{ width: `${completeness.percentage}%` }}
          />
        </div>

        {/* Itemized Completeness Pills */}
        <div className='flex flex-wrap gap-2 pt-1'>
          {completeness.items.map((item) => (
            <span
              key={item.id}
              title={item.hint}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                item.completed
                  ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {item.completed ? (
                <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600 shrink-0' />
              ) : (
                <AlertTriangle className='w-3.5 h-3.5 text-amber-500 shrink-0' />
              )}
              <span>{item.label}</span>
              <span className='opacity-70 tabular-nums'>({item.weight}%)</span>
            </span>
          ))}
        </div>
      </section>

      {/* Main Grid: Identity Card (Left) + Medical Safety & Contact Cards (Right) */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-7'>
        {/* Left Column: Photo & Demographic (4 Cols) */}
        <div className='lg:col-span-4 space-y-6'>
          <div className='bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5 text-center flex flex-col items-center'>
            <div className='relative'>
              {isEdit ? (
                <label htmlFor='profile-image-upload' className='cursor-pointer group block relative'>
                  <img
                    className='w-32 h-32 rounded-3xl object-cover border-2 border-slate-200 group-hover:opacity-75 transition-opacity bg-slate-100 shadow-sm'
                    src={image ? URL.createObjectURL(image) : userData.image}
                    alt={userData.name}
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'Patient')}&background=0284c7&color=fff&bold=true`
                    }}
                  />
                  <div className='absolute inset-0 bg-slate-950/50 rounded-3xl flex flex-col items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity'>
                    <Camera className='w-5 h-5 mb-1' />
                    <span>Upload photo</span>
                  </div>
                  <input
                    onChange={(e) => setImage(e.target.files[0])}
                    type='file'
                    id='profile-image-upload'
                    hidden
                    accept='image/*'
                  />
                </label>
              ) : (
                <img
                  className='w-32 h-32 rounded-3xl object-cover border-2 border-slate-200 bg-slate-100 shadow-sm'
                  src={userData.image}
                  alt={userData.name}
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'Patient')}&background=0284c7&color=fff&bold=true`
                  }}
                />
              )}
            </div>

            <div className='w-full'>
              {isEdit ? (
                <div className='space-y-1'>
                  <label className='text-[11px] font-bold text-slate-500 uppercase tracking-wider block text-left'>
                    Full name
                  </label>
                  <input
                    type='text'
                    value={userData.name}
                    onChange={(e) => setUserData((prev) => ({ ...prev, name: e.target.value }))}
                    className='w-full border border-slate-200 rounded-xl px-3 py-2 text-center font-bold text-slate-900 text-sm outline-none focus:border-sky-500 bg-slate-50/50 focus:bg-white transition-colors'
                  />
                </div>
              ) : (
                <h2 className='font-bold text-lg text-slate-900'>{userData.name}</h2>
              )}
              <p className='text-xs text-slate-500 mt-1 truncate flex items-center justify-center gap-1.5'>
                <Mail className='w-3.5 h-3.5 text-slate-400' />
                <span>{userData.email}</span>
              </p>
            </div>

            <div className='w-full pt-4 border-t border-slate-100 text-left space-y-3 text-xs'>
              <div className='flex items-center justify-between'>
                <span className='text-slate-500 font-medium'>Gender</span>
                {isEdit ? (
                  <select
                    className='border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-sky-500 bg-white font-medium text-slate-800'
                    onChange={(e) => setUserData((prev) => ({ ...prev, gender: e.target.value }))}
                    value={userData.gender || 'Not Selected'}
                  >
                    <option value='Not Selected'>Not selected</option>
                    <option value='Male'>Male</option>
                    <option value='Female'>Female</option>
                    <option value='Other'>Other</option>
                  </select>
                ) : (
                  <span className='font-bold text-slate-800'>{userData.gender || 'Not specified'}</span>
                )}
              </div>

              <div className='flex items-center justify-between'>
                <span className='text-slate-500 font-medium'>Date of birth</span>
                {isEdit ? (
                  <input
                    type='date'
                    className='border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-sky-500 text-slate-800'
                    onChange={(e) => setUserData((prev) => ({ ...prev, dob: e.target.value }))}
                    value={userData.dob && userData.dob !== 'Not Selected' ? userData.dob : ''}
                  />
                ) : (
                  <span className='font-bold text-slate-800 tabular-nums'>
                    {userData.dob && userData.dob !== 'Not Selected' ? userData.dob : 'Not specified'}
                    {patientAge && <span className='text-slate-400 font-normal ml-1'>({patientAge} yrs)</span>}
                  </span>
                )}
              </div>

              <div className='flex items-center justify-between'>
                <span className='text-slate-500 font-medium'>Blood group</span>
                {isEdit ? (
                  <select
                    className='border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-sky-500 bg-white font-medium text-slate-800'
                    onChange={(e) => setUserData((prev) => ({ ...prev, bloodGroup: e.target.value }))}
                    value={userData.bloodGroup || ''}
                  >
                    <option value=''>Not selected</option>
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className='font-bold text-rose-600'>{userData.bloodGroup || 'Not specified'}</span>
                )}
              </div>

              {/* Height & Weight */}
              <div className='flex items-center justify-between'>
                <span className='text-slate-500 font-medium'>Height & Weight</span>
                {isEdit ? (
                  <div className='flex items-center gap-1.5'>
                    <input
                      type='number'
                      placeholder='cm'
                      value={userData.heightCm || ''}
                      onChange={(e) => setUserData((prev) => ({ ...prev, heightCm: e.target.value }))}
                      className='w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 tabular-nums'
                    />
                    <input
                      type='number'
                      placeholder='kg'
                      value={userData.weightKg || ''}
                      onChange={(e) => setUserData((prev) => ({ ...prev, weightKg: e.target.value }))}
                      className='w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 tabular-nums'
                    />
                  </div>
                ) : (
                  <span className='font-bold text-slate-800 tabular-nums'>
                    {userData.heightCm && userData.weightKg
                      ? `${userData.heightCm} cm • ${userData.weightKg} kg`
                      : 'Not specified'}
                  </span>
                )}
              </div>

              {bmiInfo && (
                <div className='flex items-center justify-between pt-1'>
                  <span className='text-slate-500 font-medium'>Body Mass Index</span>
                  <span className='px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold text-[11px] tabular-nums'>
                    {bmiInfo.value} ({bmiInfo.category})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Health Summary Card */}
          <div className='bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3'>
            <h3 className='text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5'>
              <ShieldCheck className='w-4 h-4 text-sky-600' /> Health status summary
            </h3>
            <div className='space-y-2 text-xs'>
              <div className='p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between'>
                <span className='text-slate-600'>Reported allergies:</span>
                <span className={`font-bold tabular-nums ${userData.allergies?.length > 0 ? 'text-rose-600' : userData.noKnownAllergies ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {userData.allergies?.length > 0
                    ? `${userData.allergies.length} registered`
                    : userData.noKnownAllergies
                    ? 'None (NKDA)'
                    : 'Unconfirmed'}
                </span>
              </div>
              <div className='p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between'>
                <span className='text-slate-600'>Regular medications:</span>
                <span className='font-bold text-slate-700 tabular-nums'>
                  {userData.currentMedications?.length > 0
                    ? `${userData.currentMedications.length} active`
                    : userData.noCurrentMedications
                    ? 'None'
                    : 'Unconfirmed'}
                </span>
              </div>
              <div className='p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between'>
                <span className='text-slate-600'>Chronic conditions:</span>
                <span className='font-bold text-slate-700 tabular-nums'>
                  {userData.chronicConditions?.length > 0
                    ? `${userData.chronicConditions.length} listed`
                    : userData.noChronicConditions
                    ? 'None'
                    : 'Unconfirmed'}
                </span>
              </div>
              <div className='p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between'>
                <span className='text-slate-600'>Account security:</span>
                <span className='font-bold text-emerald-600 flex items-center gap-1'>
                  <Lock className='w-3 h-3' /> Encrypted
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Contact & Medical Safety (8 Cols) */}
        <div className='lg:col-span-8 space-y-6'>
          {/* Contact & Emergency Information Card */}
          <div className='bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4'>
            <h3 className='text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 pb-3 border-b border-slate-100'>
              <Phone className='w-4 h-4 text-sky-600' />
              <span>Contact & emergency details</span>
            </h3>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs'>
              <div>
                <label className='text-slate-500 text-xs font-medium block mb-1.5'>
                  Phone number
                </label>
                {isEdit ? (
                  <input
                    type='tel'
                    inputMode='tel'
                    autoComplete='tel'
                    value={userData.phone && userData.phone !== '000000000' ? userData.phone : ''}
                    onChange={(e) => setUserData((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder='+91 98765 43210'
                    className='w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 bg-slate-50/50 focus:bg-white transition-colors'
                  />
                ) : (
                  <div className='flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm'>
                    <Phone className='w-4 h-4 text-slate-400 shrink-0' />
                    <span className='font-semibold text-slate-800 tabular-nums'>
                      {userData.phone && userData.phone !== '000000000' ? userData.phone : 'No phone number provided'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className='text-slate-500 text-xs font-medium block mb-1.5'>
                  Home address
                </label>
                {isEdit ? (
                  <div className='space-y-2'>
                    <input
                      type='text'
                      placeholder='Street address'
                      value={userData.address?.line1 || ''}
                      onChange={(e) =>
                        setUserData((prev) => ({
                          ...prev,
                          address: { ...prev.address, line1: e.target.value }
                        }))
                      }
                      className='w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 bg-slate-50/50 focus:bg-white transition-colors'
                    />
                    <input
                      type='text'
                      placeholder='City, State, ZIP'
                      value={userData.address?.line2 || ''}
                      onChange={(e) =>
                        setUserData((prev) => ({
                          ...prev,
                          address: { ...prev.address, line2: e.target.value }
                        }))
                      }
                      className='w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 bg-slate-50/50 focus:bg-white transition-colors'
                    />
                  </div>
                ) : (
                  <div className='p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm leading-snug flex items-start gap-2'>
                    <MapPin className='w-4 h-4 text-slate-400 shrink-0 mt-0.5' />
                    <div>
                      <p className='font-semibold text-slate-800'>{userData.address?.line1 || 'No address added'}</p>
                      {userData.address?.line2 && (
                        <p className='text-slate-500 text-xs mt-0.5'>{userData.address.line2}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency Contact Row */}
            <div className='pt-3 border-t border-slate-100'>
              <label className='text-slate-500 text-xs font-medium flex items-center gap-1.5 mb-2'>
                <UserPlus className='w-3.5 h-3.5 text-rose-500' />
                <span>Emergency contact (Next of kin)</span>
              </label>
              {isEdit ? (
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5'>
                  <input
                    type='text'
                    placeholder='Contact name'
                    value={userData.emergencyContact?.name || ''}
                    onChange={(e) =>
                      setUserData((prev) => ({
                        ...prev,
                        emergencyContact: { ...(prev.emergencyContact || {}), name: e.target.value }
                      }))
                    }
                    className='border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500'
                  />
                  <input
                    type='text'
                    placeholder='Relation (e.g. Spouse)'
                    value={userData.emergencyContact?.relation || ''}
                    onChange={(e) =>
                      setUserData((prev) => ({
                        ...prev,
                        emergencyContact: { ...(prev.emergencyContact || {}), relation: e.target.value }
                      }))
                    }
                    className='border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500'
                  />
                  <input
                    type='tel'
                    inputMode='tel'
                    placeholder='Emergency phone'
                    value={userData.emergencyContact?.phone || ''}
                    onChange={(e) =>
                      setUserData((prev) => ({
                        ...prev,
                        emergencyContact: { ...(prev.emergencyContact || {}), phone: e.target.value }
                      }))
                    }
                    className='border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 tabular-nums'
                  />
                </div>
              ) : (
                <div className='p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700'>
                  {userData.emergencyContact?.name || userData.emergencyContact?.phone ? (
                    <span className='font-semibold text-slate-800'>
                      {userData.emergencyContact.name || 'Emergency Contact'}{' '}
                      {userData.emergencyContact.relation && `(${userData.emergencyContact.relation})`} •{' '}
                      <span className='tabular-nums'>{userData.emergencyContact.phone}</span>
                    </span>
                  ) : (
                    <span className='text-slate-400 italic'>No emergency contact added yet.</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Clinical Allergies, Regular Medications & Chronic Conditions Card */}
          <div className='bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5'>
            <div className='flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100'>
              <h3 className='text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2'>
                <ShieldAlert className='w-4 h-4 text-rose-600' />
                <span>Allergies, regular medications & conditions</span>
              </h3>
              <span className='inline-flex items-center gap-1.5 text-[11px] bg-sky-50 text-sky-800 border border-sky-200 px-2.5 py-0.5 rounded-full font-bold'>
                <span className='w-1.5 h-1.5 rounded-full bg-sky-600' />
                Synced to doctor consultations
              </span>
            </div>

            {/* Allergies Section */}
            <div className='space-y-2.5'>
              <div className='flex items-center justify-between'>
                <label className='text-xs font-bold text-slate-800'>
                  Known medicine or food allergies:
                </label>
                {userData.allergies?.length > 0 && (
                  <span className='text-[11px] text-rose-600 font-semibold'>
                    Checked during e-prescriptions
                  </span>
                )}
              </div>

              <div className='flex flex-wrap gap-2 items-center'>
                {userData.allergies && userData.allergies.length > 0 ? (
                  userData.allergies.map((allergy, idx) => (
                    <span
                      key={idx}
                      className='bg-rose-50 text-rose-800 border border-rose-200 text-xs px-3 py-1 rounded-xl flex items-center gap-1.5 font-bold shadow-2xs'
                    >
                      <AlertTriangle className='w-3.5 h-3.5 text-rose-600' />
                      <span>{allergy}</span>
                      {isEdit && (
                        <button
                          type='button'
                          onClick={() =>
                            setUserData((prev) => ({
                              ...prev,
                              allergies: prev.allergies.filter((_, i) => i !== idx)
                            }))
                          }
                          className='text-rose-400 hover:text-rose-800 ml-1 cursor-pointer'
                          title='Remove allergy'
                        >
                          <X className='w-3.5 h-3.5' />
                        </button>
                      )}
                    </span>
                  ))
                ) : userData.noKnownAllergies ? (
                  <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold'>
                    <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
                    <span>None — No known allergies (NKDA)</span>
                  </span>
                ) : (
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='text-xs text-amber-700 font-medium'>
                      Allergies not confirmed yet (limits profile completeness by 15%).
                    </p>
                    {!isEdit && (
                      <button
                        type='button'
                        onClick={quickConfirmNoAllergies}
                        className='px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold cursor-pointer'
                      >
                        Select &ldquo;None&rdquo;
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isEdit && (
                <div className='space-y-2.5 pt-1'>
                  <button
                    type='button'
                    onClick={() =>
                      setUserData((prev) => ({
                        ...prev,
                        noKnownAllergies: !prev.noKnownAllergies,
                        allergies: !prev.noKnownAllergies ? [] : prev.allergies
                      }))
                    }
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                      userData.noKnownAllergies
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Check className='w-3.5 h-3.5' />
                    <span>None (No known drug or food allergies)</span>
                  </button>

                  <div className='flex gap-2'>
                    <input
                      type='text'
                      placeholder='Add an allergy (e.g. Penicillin, Aspirin)...'
                      value={newAllergy}
                      onChange={(e) => setNewAllergy(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing && newAllergy.trim()) {
                          e.preventDefault()
                          addAllergy(newAllergy)
                        }
                      }}
                      className='border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-sky-500 flex-1 max-w-sm bg-slate-50/50 focus:bg-white'
                    />
                    <button
                      type='button'
                      onClick={() => addAllergy(newAllergy)}
                      className='bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs px-3.5 py-2 rounded-xl border border-slate-200 font-bold cursor-pointer transition-colors'
                    >
                      <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                    </button>
                  </div>

                  {/* Suggestion Chips */}
                  <div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
                    <span className='text-[10px] text-slate-400 font-semibold'>Quick add:</span>
                    {COMMON_ALLERGY_OPTIONS.map((sug) => (
                      <button
                        key={sug}
                        type='button'
                        onClick={() => addAllergy(sug)}
                        className='px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-[10px] font-semibold transition-colors cursor-pointer border border-slate-200/60'
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Current Regular Medications */}
            <div className='space-y-2.5 pt-3 border-t border-slate-100'>
              <label className='text-xs font-bold text-slate-800 block'>
                Medicines taken regularly:
              </label>

              <div className='space-y-2'>
                {userData.currentMedications && userData.currentMedications.length > 0 ? (
                  userData.currentMedications.map((med, idx) => (
                    <div
                      key={idx}
                      className='bg-slate-50 border border-slate-200/90 rounded-xl p-3 text-xs flex items-center justify-between'
                    >
                      <div className='flex items-center gap-2'>
                        <Pill className='w-4 h-4 text-sky-600' />
                        <span className='font-bold text-slate-900 text-sm'>{med.name}</span>
                        {med.dosage && (
                          <span className='text-slate-500 text-xs tabular-nums font-medium'>
                            ({med.dosage})
                          </span>
                        )}
                      </div>
                      {isEdit && (
                        <button
                          type='button'
                          onClick={() =>
                            setUserData((prev) => ({
                              ...prev,
                              currentMedications: prev.currentMedications.filter((_, i) => i !== idx)
                            }))
                          }
                          className='text-slate-400 hover:text-rose-600 cursor-pointer p-1'
                          title='Remove medication'
                        >
                          <X className='w-4 h-4' />
                        </button>
                      )}
                    </div>
                  ))
                ) : userData.noCurrentMedications ? (
                  <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold'>
                    <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
                    <span>None — Not taking any regular medications</span>
                  </span>
                ) : (
                  <p className='text-xs text-slate-400 italic'>No regular medicines confirmed yet.</p>
                )}
              </div>

              {isEdit && (
                <div className='space-y-2 pt-1'>
                  <button
                    type='button'
                    onClick={() =>
                      setUserData((prev) => ({
                        ...prev,
                        noCurrentMedications: !prev.noCurrentMedications,
                        currentMedications: !prev.noCurrentMedications ? [] : prev.currentMedications
                      }))
                    }
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                      userData.noCurrentMedications
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Check className='w-3.5 h-3.5' />
                    <span>None (Not taking any regular medications)</span>
                  </button>

                  <div className='flex flex-wrap gap-2'>
                    <input
                      type='text'
                      placeholder='Medicine name (e.g. Metformin)...'
                      value={newMed.name}
                      onChange={(e) => setNewMed((prev) => ({ ...prev, name: e.target.value }))}
                      className='border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-sky-500 flex-1 min-w-[160px] bg-slate-50/50 focus:bg-white'
                    />
                    <input
                      type='text'
                      placeholder='Dose (e.g. 500mg)...'
                      value={newMed.dosage}
                      onChange={(e) => setNewMed((prev) => ({ ...prev, dosage: e.target.value }))}
                      className='border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-sky-500 w-32 bg-slate-50/50 focus:bg-white'
                    />
                    <button
                      type='button'
                      onClick={() => {
                        if (newMed.name.trim()) {
                          setUserData((prev) => ({
                            ...prev,
                            currentMedications: [
                              ...(prev.currentMedications || []),
                              { name: newMed.name.trim(), dosage: newMed.dosage.trim() }
                            ],
                            noCurrentMedications: false
                          }))
                          setNewMed({ name: '', dosage: '' })
                        }
                      }}
                      className='bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs px-3.5 py-2 rounded-xl border border-slate-200 font-bold cursor-pointer transition-colors'
                    >
                      <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Chronic / Pre-existing Conditions */}
            <div className='space-y-2.5 pt-3 border-t border-slate-100'>
              <label className='text-xs font-bold text-slate-800 flex items-center gap-1.5'>
                <Activity className='w-3.5 h-3.5 text-indigo-600' />
                <span>Chronic / pre-existing conditions:</span>
              </label>

              <div className='flex flex-wrap gap-2 items-center'>
                {userData.chronicConditions && userData.chronicConditions.length > 0 ? (
                  userData.chronicConditions.map((cond, idx) => (
                    <span
                      key={idx}
                      className='bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs px-3 py-1 rounded-xl flex items-center gap-1.5 font-bold'
                    >
                      <span>{cond}</span>
                      {isEdit && (
                        <button
                          type='button'
                          onClick={() =>
                            setUserData((prev) => ({
                              ...prev,
                              chronicConditions: prev.chronicConditions.filter((_, i) => i !== idx)
                            }))
                          }
                          className='text-indigo-400 hover:text-indigo-800 ml-1 cursor-pointer'
                        >
                          <X className='w-3.5 h-3.5' />
                        </button>
                      )}
                    </span>
                  ))
                ) : userData.noChronicConditions ? (
                  <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold'>
                    <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
                    <span>None — No chronic medical conditions</span>
                  </span>
                ) : (
                  <p className='text-xs text-slate-400 italic'>No chronic conditions confirmed yet.</p>
                )}
              </div>

              {isEdit && (
                <div className='space-y-2 pt-1'>
                  <button
                    type='button'
                    onClick={() =>
                      setUserData((prev) => ({
                        ...prev,
                        noChronicConditions: !prev.noChronicConditions,
                        chronicConditions: !prev.noChronicConditions ? [] : prev.chronicConditions
                      }))
                    }
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                      userData.noChronicConditions
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Check className='w-3.5 h-3.5' />
                    <span>None (No chronic medical conditions)</span>
                  </button>

                  <div className='flex gap-2'>
                    <input
                      type='text'
                      placeholder='Add condition (e.g. Diabetes, Asthma)...'
                      value={newCondition}
                      onChange={(e) => setNewCondition(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing && newCondition.trim()) {
                          e.preventDefault()
                          addCondition(newCondition)
                        }
                      }}
                      className='border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-sky-500 flex-1 max-w-sm bg-slate-50/50 focus:bg-white'
                    />
                    <button
                      type='button'
                      onClick={() => addCondition(newCondition)}
                      className='bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs px-3.5 py-2 rounded-xl border border-slate-200 font-bold cursor-pointer transition-colors'
                    >
                      <Plus className='w-3.5 h-3.5 inline mr-1' /> Add
                    </button>
                  </div>

                  <div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
                    <span className='text-[10px] text-slate-400 font-semibold'>Quick add:</span>
                    {COMMON_CHRONIC_CONDITIONS.map((sug) => (
                      <button
                        key={sug}
                        type='button'
                        onClick={() => addCondition(sug)}
                        className='px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-semibold transition-colors cursor-pointer border border-slate-200/60'
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connected Google Account & Security Card */}
          <div className='bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4'>
            <h3 className='text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 pb-3 border-b border-slate-100'>
              <KeyRound className='w-4 h-4 text-sky-600' />
              <span>Identity & connected accounts</span>
            </h3>

            <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200/90 bg-slate-50/70'>
              <div className='flex items-center gap-3.5'>
                <div className='p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0'>
                  <GoogleLogoIcon className='w-5 h-5' />
                </div>
                <div>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-xs text-slate-900'>Google Account</span>
                    {userData.isGoogleAuth || userData.authProvider === 'google' ? (
                      <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                        <CheckCircle2 className='w-3 h-3 text-emerald-600' /> Connected
                      </span>
                    ) : (
                      <span className='inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600'>
                        Not linked
                      </span>
                    )}
                  </div>
                  <p className='text-[11px] text-slate-500 mt-0.5'>
                    {userData.isGoogleAuth || userData.authProvider === 'google'
                      ? `Linked to Google Identity (${userData.email}). Enables 1-Tap authentication.`
                      : 'Link your Google account for secure, 1-tap sign-in and verified identity.'}
                  </p>
                </div>
              </div>

              {!(userData.isGoogleAuth || userData.authProvider === 'google') && (
                <div className='shrink-0 w-full sm:w-auto'>
                  <GoogleAuthButton state='Link' onAuthSuccess={() => loadUserProfileData()} />
                </div>
              )}
            </div>

            {/* Medical Privacy Reassurance */}
            <div className='pt-2 flex items-center gap-2 text-[11px] text-slate-400'>
              <HeartHandshake className='w-4 h-4 text-slate-400 shrink-0' />
              <span>Your personal health dossier is encrypted and protected under healthcare privacy standards.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MyProfile
