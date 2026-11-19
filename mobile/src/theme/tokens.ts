export const COLORS = {
  canvas: '#F4F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF2F7',
  border: '#DCE4EC',
  ink: '#0F1D2E',
  inkSecondary: '#4A5D73',
  inkMuted: '#7B8FA6',
  cobalt: '#0284C7',
  cobaltSoft: '#E0F2FE',
  vitalGreen: '#0D9488',
  vitalGreenSoft: '#CCFBF1',
  cautionAmber: '#D97706',
  cautionAmberSoft: '#FEF3C7',
  alertRose: '#E11D48',
  alertRoseSoft: '#FFE4E6',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const getUrgencyStyle = (level?: string) => {
  switch (String(level || '').toLowerCase()) {
    case 'high':
      return {
        bg: COLORS.alertRoseSoft,
        border: '#FECDD3',
        text: COLORS.alertRose,
        dot: COLORS.alertRose,
        label: 'Urgent Care Needed',
      };
    case 'medium':
      return {
        bg: COLORS.cautionAmberSoft,
        border: '#FDE68A',
        text: COLORS.cautionAmber,
        dot: COLORS.cautionAmber,
        label: 'Consult Soon',
      };
    case 'low':
    default:
      return {
        bg: COLORS.vitalGreenSoft,
        border: '#99F6E4',
        text: COLORS.vitalGreen,
        dot: COLORS.vitalGreen,
        label: 'Routine Visit',
      };
  }
};

export const getRiskStyle = (risk?: string) => {
  switch (String(risk || '').toUpperCase()) {
    case 'SEVERE':
      return {
        bg: COLORS.alertRoseSoft,
        border: '#FDA4AF',
        badgeBg: COLORS.alertRose,
        badgeText: '#FFFFFF',
        text: '#881337',
        label: 'Critical / Contraindicated',
      };
    case 'MODERATE':
      return {
        bg: COLORS.cautionAmberSoft,
        border: '#FCD34D',
        badgeBg: COLORS.cautionAmber,
        badgeText: '#FFFFFF',
        text: '#78350F',
        label: 'Moderate Risk — Consult Physician',
      };
    case 'MILD':
    case 'LOW':
      return {
        bg: COLORS.cautionAmberSoft,
        border: '#FDE68A',
        badgeBg: '#F59E0B',
        badgeText: '#FFFFFF',
        text: '#78350F',
        label: 'Mild Interaction',
      };
    case 'SAFE':
    default:
      return {
        bg: COLORS.vitalGreenSoft,
        border: '#99F6E4',
        badgeBg: COLORS.vitalGreen,
        badgeText: '#FFFFFF',
        text: '#134E4A',
        label: 'Clear Clinical Profile',
      };
  }
};
