// Shared clinical profile completeness & onboarding evaluation utility

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']

export const COMMON_ALLERGY_OPTIONS = [
  'Penicillin',
  'Sulfa drugs',
  'Aspirin',
  'NSAIDs (Ibuprofen)',
  'Amoxicillin',
  'Codeine',
  'Peanuts / Tree nuts',
  'Shellfish',
  'Latex'
]

export const COMMON_CHRONIC_CONDITIONS = [
  'Diabetes (Type 1 / 2)',
  'Hypertension (High BP)',
  'Asthma / COPD',
  'Thyroid Disorder',
  'PCOS / PCOD',
  'Heart Disease',
  'Acid Reflux / GERD',
  'Migraine'
]

export const isPhoneValid = (phone) => {
  if (!phone) return false
  const cleaned = String(phone).trim()
  if (!cleaned || cleaned === '000000000' || cleaned === '0000000000') return false
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 7
}

export const isDobValid = (dob) => {
  if (!dob || dob === 'Not Selected') return false
  const parsed = new Date(dob)
  return !isNaN(parsed.getTime())
}

export const isGenderValid = (gender) => {
  return Boolean(gender && gender !== 'Not Selected')
}

/**
 * Evaluates patient profile completeness (0-100%) and returns itemized status.
 * Note: Allergies, Medications, and Chronic Conditions do NOT grant completion credit
 * when left blank unless the patient explicitly selects "None" (e.g. noKnownAllergies = true)
 * or records at least one item.
 */
export const calculateProfileCompleteness = (userData) => {
  if (!userData) {
    return {
      percentage: 0,
      items: [],
      missingItems: [],
      completedItems: [],
      isComplete: false,
      allergiesAnswered: false,
      medicationsAnswered: false,
      conditionsAnswered: false,
      mandatoryComplete: false
    }
  }

  const hasName = Boolean(userData.name && userData.name.trim().length >= 2)
  const hasDob = isDobValid(userData.dob)
  const hasGender = isGenderValid(userData.gender)
  const hasPhone = isPhoneValid(userData.phone)
  const hasBloodGroup = Boolean(userData.bloodGroup && userData.bloodGroup.trim())

  const allergiesAnswered = Boolean(
    (Array.isArray(userData.allergies) && userData.allergies.length > 0) ||
      userData.noKnownAllergies === true
  )

  const medicationsAnswered = Boolean(
    (Array.isArray(userData.currentMedications) && userData.currentMedications.length > 0) ||
      userData.noCurrentMedications === true
  )

  const conditionsAnswered = Boolean(
    (Array.isArray(userData.chronicConditions) && userData.chronicConditions.length > 0) ||
      userData.noChronicConditions === true
  )

  const hasAddress = Boolean(userData.address?.line1 && userData.address.line1.trim().length >= 3)
  const hasVitalsOrEmergency = Boolean(
    (Number(userData.heightCm) > 0 && Number(userData.weightKg) > 0) ||
      (userData.emergencyContact?.phone && isPhoneValid(userData.emergencyContact.phone))
  )

  const items = [
    {
      id: 'name',
      label: 'Full Name',
      category: 'mandatory',
      weight: 10,
      completed: hasName,
      hint: 'Legal name for prescriptions'
    },
    {
      id: 'dob',
      label: 'Date of Birth',
      category: 'mandatory',
      weight: 15,
      completed: hasDob,
      hint: 'Required for age-specific clinical triage & dosing'
    },
    {
      id: 'gender',
      label: 'Biological Sex / Gender',
      category: 'mandatory',
      weight: 10,
      completed: hasGender,
      hint: 'Required for accurate clinical screening'
    },
    {
      id: 'phone',
      label: 'Mobile Phone Number',
      category: 'mandatory',
      weight: 15,
      completed: hasPhone,
      hint: 'Required for doctor callbacks & telemedicine alerts'
    },
    {
      id: 'bloodGroup',
      label: 'Blood Group',
      category: 'mandatory',
      weight: 10,
      completed: hasBloodGroup,
      hint: 'Emergency clinical baseline'
    },
    {
      id: 'allergies',
      label: 'Drug & Food Allergies',
      category: 'clinical',
      weight: 15,
      completed: allergiesAnswered,
      hint: 'Add known allergies or explicitly select "None (No known allergies)"'
    },
    {
      id: 'medications',
      label: 'Current Regular Medications',
      category: 'clinical',
      weight: 10,
      completed: medicationsAnswered,
      hint: 'Add active medicines or select "None"'
    },
    {
      id: 'conditions',
      label: 'Chronic Medical Conditions',
      category: 'clinical',
      weight: 5,
      completed: conditionsAnswered,
      hint: 'Select pre-existing conditions or "None"'
    },
    {
      id: 'address',
      label: 'Residential Address',
      category: 'extended',
      weight: 5,
      completed: hasAddress,
      hint: 'Used on digital prescriptions'
    },
    {
      id: 'vitalsEmergency',
      label: 'Height/Weight or Emergency Contact',
      category: 'extended',
      weight: 5,
      completed: hasVitalsOrEmergency,
      hint: 'Baseline BMI metrics or emergency next-of-kin'
    }
  ]

  const percentage = items.reduce((sum, item) => sum + (item.completed ? item.weight : 0), 0)
  const completedItems = items.filter((i) => i.completed)
  const missingItems = items.filter((i) => !i.completed)
  const mandatoryComplete = hasName && hasDob && hasGender && hasPhone

  return {
    percentage,
    items,
    completedItems,
    missingItems,
    isComplete: percentage === 100,
    allergiesAnswered,
    medicationsAnswered,
    conditionsAnswered,
    mandatoryComplete
  }
}

/**
 * Determines whether the user should be prompted with the first-time clinical onboarding modal.
 */
export const shouldPromptOnboarding = (userData) => {
  if (!userData) return false
  if (userData.onboardingCompleted) return false
  const { mandatoryComplete, allergiesAnswered } = calculateProfileCompleteness(userData)
  return !mandatoryComplete || !allergiesAnswered
}
