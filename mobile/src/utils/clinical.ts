export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const;

export const COMMON_ALLERGY_OPTIONS = [
  'Penicillin',
  'Sulfa Drugs',
  'Aspirin / NSAIDs',
  'Ibuprofen',
  'Peanuts',
  'Latex',
  'Contrast Dye',
  'Pollen / Dust',
] as const;

export const COMMON_CHRONIC_CONDITIONS = [
  'Hypertension',
  'Type 2 Diabetes',
  'Asthma',
  'Hypothyroidism',
  'Migraine',
  'GERD / Acid Reflux',
  'PCOS',
  'Arthritis',
] as const;

export const SPECIALITIES = [
  'General physician',
  'Gynecologist',
  'Dermatologist',
  'Pediatricians',
  'Neurologist',
  'Gastroenterologist',
] as const;

export interface MedicationEntry {
  name: string;
  dosage?: string;
}

export interface EmergencyContact {
  name?: string;
  relation?: string;
  phone?: string;
}

export interface UserAddress {
  line1?: string;
  line2?: string;
}

export interface UserData {
  _id: string;
  name: string;
  email: string;
  image?: string;
  phone?: string;
  address?: UserAddress;
  gender?: string;
  dob?: string;
  bloodGroup?: string;
  heightCm?: number | string | null;
  weightKg?: number | string | null;
  emergencyContact?: EmergencyContact;
  allergies?: string[];
  noKnownAllergies?: boolean;
  currentMedications?: Array<MedicationEntry | string>;
  noCurrentMedications?: boolean;
  chronicConditions?: string[];
  noChronicConditions?: boolean;
  onboardingCompleted?: boolean;
}

export interface DoctorData {
  _id: string;
  name: string;
  email?: string;
  image?: string;
  speciality: string;
  degree: string;
  experience: string;
  about: string;
  available: boolean;
  fees: number;
  address?: UserAddress;
  slots_booked?: Record<string, string[]>;
}

export interface AppointmentData {
  _id: string;
  userId: string;
  docId: string;
  slotDate: string;
  slotTime: string;
  userData: UserData;
  docData: DoctorData;
  amount: number;
  date: number;
  reasonForVisit?: string;
  cancelled?: boolean;
  payment?: boolean;
  paymentMethod?: string;
  isCompleted?: boolean;
}

export interface SlotItem {
  datetime: Date;
  time: string;
  hours: number;
  slotDateKey: string;
}

export const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const isPhoneValid = (phone?: string): boolean => {
  if (!phone) return false;
  const cleaned = String(phone).trim();
  if (!cleaned || cleaned === '000000000' || cleaned === '0000000000') return false;
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 7;
};

export const isDobValid = (dob?: string): boolean => {
  if (!dob || dob === 'Not Selected') return false;
  const parsed = new Date(dob);
  return !isNaN(parsed.getTime());
};

export const isGenderValid = (gender?: string): boolean => {
  return Boolean(gender && gender !== 'Not Selected');
};

export const calculateProfileCompleteness = (userData?: UserData | null) => {
  if (!userData) {
    return {
      percentage: 0,
      missingFields: [] as string[],
      isComplete: false,
    };
  }

  const hasName = Boolean(userData.name && userData.name.trim().length >= 2);
  const hasDob = isDobValid(userData.dob);
  const hasGender = isGenderValid(userData.gender);
  const hasPhone = isPhoneValid(userData.phone);
  const hasBloodGroup = Boolean(userData.bloodGroup && userData.bloodGroup.trim());

  const allergiesAnswered = Boolean(
    (Array.isArray(userData.allergies) && userData.allergies.length > 0) ||
      userData.noKnownAllergies === true
  );
  const medicationsAnswered = Boolean(
    (Array.isArray(userData.currentMedications) && userData.currentMedications.length > 0) ||
      userData.noCurrentMedications === true
  );
  const conditionsAnswered = Boolean(
    (Array.isArray(userData.chronicConditions) && userData.chronicConditions.length > 0) ||
      userData.noChronicConditions === true
  );
  const hasAddress = Boolean(userData.address?.line1 && userData.address.line1.trim().length >= 3);
  const hasVitalsOrEmergency = Boolean(
    (Number(userData.heightCm) > 0 && Number(userData.weightKg) > 0) ||
      (userData.emergencyContact?.phone && isPhoneValid(userData.emergencyContact.phone))
  );

  const items = [
    { label: 'Full Name', weight: 10, completed: hasName },
    { label: 'Date of Birth', weight: 15, completed: hasDob },
    { label: 'Gender', weight: 10, completed: hasGender },
    { label: 'Mobile Phone', weight: 15, completed: hasPhone },
    { label: 'Blood Group', weight: 10, completed: hasBloodGroup },
    { label: 'Drug & Food Allergies', weight: 15, completed: allergiesAnswered },
    { label: 'Current Medications', weight: 10, completed: medicationsAnswered },
    { label: 'Chronic Conditions', weight: 5, completed: conditionsAnswered },
    { label: 'Residential Address', weight: 5, completed: hasAddress },
    { label: 'Height/Weight or Emergency Contact', weight: 5, completed: hasVitalsOrEmergency },
  ];

  const percentage = items.reduce((sum, item) => sum + (item.completed ? item.weight : 0), 0);
  const missingFields = items.filter((i) => !i.completed).map((i) => i.label);

  return {
    percentage,
    missingFields,
    isComplete: percentage === 100,
  };
};

export const calculateBmi = (heightCm?: number | string | null, weightKg?: number | string | null) => {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h < 40 || w < 2) return null;
  const heightM = h / 100;
  const bmi = w / (heightM * heightM);
  if (!isFinite(bmi) || bmi <= 0) return null;
  let category = 'Normal';
  if (bmi < 18.5) category = 'Underweight';
  else if (bmi >= 25 && bmi < 30) category = 'Overweight';
  else if (bmi >= 30) category = 'Obese';
  return { value: bmi.toFixed(1), category };
};

export const slotDateFormat = (slotDate?: string): string => {
  if (!slotDate) return '';
  const dateArray = slotDate.split('_');
  const monthIdx = Number(dateArray[1]) - 1;
  return `${dateArray[0]} ${MONTH_NAMES[monthIdx] || dateArray[1]} ${dateArray[2]}`;
};

export const formatDoctorName = (name?: string): string => {
  const clean = String(name || 'Doctor').trim();
  return clean.startsWith('Dr.') ? clean : `Dr. ${clean}`;
};

export const generateDoctorSlots = (docInfo?: DoctorData | null): SlotItem[][] => {
  if (!docInfo) return [];
  const booked = docInfo.slots_booked || {};
  const today = new Date();
  const slotsByDay: SlotItem[][] = [];

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + i);

    const endTime = new Date(today);
    endTime.setDate(today.getDate() + i);
    endTime.setHours(21, 0, 0, 0);

    if (today.getDate() === currentDate.getDate()) {
      currentDate.setHours(currentDate.getHours() > 10 ? currentDate.getHours() + 1 : 10);
      currentDate.setMinutes(currentDate.getMinutes() > 30 ? 30 : 0);
      currentDate.setSeconds(0, 0);
    } else {
      currentDate.setHours(10, 0, 0, 0);
    }

    const timeSlots: SlotItem[] = [];
    while (currentDate < endTime) {
      const formattedTime = currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const day = currentDate.getDate();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const slotDateKey = `${day}_${month}_${year}`;

      const isSlotAvailable = !booked[slotDateKey] || !booked[slotDateKey].includes(formattedTime);
      if (isSlotAvailable) {
        timeSlots.push({
          datetime: new Date(currentDate),
          time: formattedTime,
          hours: currentDate.getHours(),
          slotDateKey,
        });
      }
      currentDate.setMinutes(currentDate.getMinutes() + 30);
    }

    slotsByDay.push(timeSlots);
  }

  return slotsByDay;
};

export const groupSlotsByPeriod = (slots: SlotItem[] = []) => {
  const morning: SlotItem[] = [];
  const afternoon: SlotItem[] = [];
  const evening: SlotItem[] = [];

  slots.forEach((slot) => {
    if (slot.hours < 12) morning.push(slot);
    else if (slot.hours < 17) afternoon.push(slot);
    else evening.push(slot);
  });

  return { morning, afternoon, evening };
};
