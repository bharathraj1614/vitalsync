/**
 * Specialty registry for the triage engine.
 *
 * BOOKABLE specialties are the exact `speciality` strings stored on doctor documents.
 * IDEAL specialties are clinically preferred specialists that the platform does not (yet)
 * offer. Protocols may name an ideal specialist; the router then falls back to the
 * declared bookable specialty and tells the patient honestly.
 */

export const BOOKABLE_SPECIALTIES = Object.freeze({
    GP: "General physician",
    GYNEC: "Gynecologist",
    DERM: "Dermatologist",
    PEDS: "Pediatricians",
    NEURO: "Neurologist",
    GASTRO: "Gastroenterologist"
});

export const BOOKABLE_LIST = Object.freeze(Object.values(BOOKABLE_SPECIALTIES));

export const IDEAL_SPECIALTIES = Object.freeze({
    ENDO: "Endocrinologist",
    ORTHO: "Orthopedician",
    ENT: "ENT specialist",
    PULMO: "Pulmonologist",
    CARDIO: "Cardiologist",
    PSYCH: "Psychiatrist",
    URO: "Urologist",
    RHEUM: "Rheumatologist"
});

/** Words that, if they appear in LLM-written explanation text, indicate a specialty mention. */
export const SPECIALTY_MENTION_PATTERNS = {
    "General physician": [/general physician/i, /\bgp\b/i, /family doctor/i, /primary care/i],
    Gynecologist: [/gyn(a)?ecolog/i, /obstetric/i],
    Dermatologist: [/dermatolog/i, /skin specialist/i, /trichologist/i],
    Pediatricians: [/p(a)?ediatric/i],
    Neurologist: [/neurolog/i],
    Gastroenterologist: [/gastroenterolog/i, /gastro specialist/i, /hepatolog/i],
    Endocrinologist: [/endocrinolog/i],
    Orthopedician: [/orthop(a)?edi/i],
    "ENT specialist": [/\bent\b/i, /otolaryngolog/i],
    Pulmonologist: [/pulmonolog/i, /chest specialist/i],
    Cardiologist: [/cardiolog/i],
    Psychiatrist: [/psychiatr/i, /psycholog/i],
    Urologist: [/urolog/i],
    Rheumatologist: [/rheumatolog/i]
};

export const URGENCY_ORDER = ["routine", "soon", "urgent", "emergency"];

export const maxUrgency = (a = "routine", b = "routine") =>
    URGENCY_ORDER.indexOf(b) > URGENCY_ORDER.indexOf(a) ? b : a;

/** Maps engine urgency onto the legacy verdict card levels (low / medium / high). */
export const toLegacyUrgency = (urgency) =>
    ({ routine: "low", soon: "medium", urgent: "high", emergency: "high" }[urgency] || "low");
