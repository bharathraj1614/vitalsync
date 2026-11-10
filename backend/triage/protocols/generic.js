import { S, opt, NONE_OPTION } from "./_helpers.js";

/**
 * Body-system fallback protocols.
 * Used when the patient's complaint doesn't match a specific protocol and they pick
 * a body area from the "Which area is this about?" picker. Questions are deliberately
 * system-level (duration + red flags) because the specific complaint is unknown.
 */
const durationQuestion = (specialistIfChronic, reason) => ({
    id: "duration",
    slot: "Duration",
    text: "How long has this been going on?",
    options: [
        opt("days", "A few days", {}, ["few days", "today", "yesterday"]),
        opt("weeks", "1–4 weeks", { urgency: "soon" }, ["week", "weeks"]),
        opt("months", "More than a month, or keeps coming back", specialistIfChronic
            ? { urgency: "soon", secondary: specialistIfChronic, secondaryReason: reason }
            : { urgency: "soon" }, ["month", "months", "years", "keeps coming back"])
    ]
});

const severityQuestion = {
    id: "severity",
    slot: "Severity",
    text: "How is it affecting you?",
    options: [
        opt("mild", "Mild — I can carry on normally", {}, ["mild"]),
        opt("moderate", "Moderate — it's disrupting work or sleep", { urgency: "soon" }, ["moderate", "sleep", "work"]),
        opt("severe", "Severe or getting worse quickly", { urgency: "urgent", reason: "Severe or rapidly worsening symptoms should be examined today." }, ["severe", "worse", "worsening"])
    ]
};

export const SYSTEM_PICKER = [
    { value: "skin_hair", label: "Skin, hair or nails", protocolId: "generic_skin" },
    { value: "digestive", label: "Stomach or digestion", protocolId: "generic_digestive" },
    { value: "head_nerves", label: "Head, nerves or dizziness", protocolId: "generic_neuro" },
    { value: "womens_health", label: "Periods, pregnancy or women's health", protocolId: "period_problems" },
    { value: "child", label: "My child's health", protocolId: "child_illness" },
    { value: "musculoskeletal", label: "Bones, joints or muscles", protocolId: "joint_body_pain" },
    { value: "mind", label: "Stress, sleep or mood", protocolId: "mental_wellbeing" },
    { value: "general", label: "Fever, cough or something else", protocolId: "generic_general" }
];

export default [
    {
        id: "generic_skin",
        version: 1,
        reviewStatus: "draft",
        label: "Skin, hair or nail concern",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: ["skin", "nail", "nails", "scalp", "hair"],
        route: { primary: S.DERM, secondary: null, urgency: "routine", reason: "Dermatologists treat conditions of the skin, hair and nails." },
        concern: "Skin / hair / nail concern",
        questions: [durationQuestion(null), severityQuestion],
        selfCare: ["Avoid applying steroid or mixed creams until examined.", "Take a clear photo of the affected area to show your doctor."]
    },
    {
        id: "generic_digestive",
        version: 1,
        reviewStatus: "draft",
        label: "Digestive concern",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: ["stomach", "digestion", "digestive", "gut", "bowel", "stool", "poop", "motion"],
        route: { primary: S.GP, secondary: null, urgency: "routine", reason: "A General Physician can examine you and order first-line tests for digestive symptoms." },
        concern: "Digestive symptoms",
        questions: [
            durationQuestion(S.GASTRO, "Long-standing digestive symptoms are best evaluated by a Gastroenterologist."),
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("bleed", "Blood in stool or black stool", { urgency: "urgent", primary: S.GASTRO, secondary: S.GP, reason: "Bleeding from the gut needs prompt Gastroenterologist evaluation." }, ["blood", "black stool"]),
                    opt("weight", "Weight loss or difficulty swallowing", { urgency: "urgent", primary: S.GASTRO, secondary: S.GP, reason: "These warning signs need specialist evaluation." }, ["weight loss", "swallow"]),
                    opt("vomit", "Repeated vomiting or severe pain", { urgency: "urgent", reason: "Repeated vomiting or severe pain should be examined today." }, ["vomiting", "severe pain"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: ["Eat light meals and stay hydrated.", "Keep a short diary of food and symptoms for your doctor."]
    },
    {
        id: "generic_neuro",
        version: 1,
        reviewStatus: "draft",
        label: "Head or nerve concern",
        bodySystem: "head_nerves",
        organDomain: "neuro",
        synonyms: ["nerve", "nerves", "memory", "tremor", "shaking hands", "balance"],
        route: { primary: S.GP, secondary: S.NEURO, urgency: "routine", reason: "A General Physician can do an initial examination and basic tests.", secondaryReason: "A Neurologist can assess persistent nerve or brain-related symptoms." },
        concern: "Neurological symptoms",
        questions: [
            durationQuestion(S.NEURO, "Symptoms lasting over a month are worth a Neurologist's review."),
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("focal", "Weakness, numbness, or speech / vision change", { urgency: "emergency", primary: S.NEURO, reason: "These can be signs of a stroke." }, ["weakness", "speech", "vision"]),
                    opt("memory", "Memory problems or confusion getting worse", { urgency: "soon", primary: S.NEURO, secondary: S.GP, reason: "Progressive memory problems should be assessed by a Neurologist." }, ["memory", "confusion", "forgetful"]),
                    opt("tremor", "Shaking hands or slow movements", { urgency: "soon", primary: S.NEURO, secondary: S.GP, reason: "Tremor or slowness should be assessed by a Neurologist." }, ["tremor", "shaking", "slow"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: ["Avoid driving if you have dizziness, weakness or vision changes.", "Note when symptoms happen and how long they last."]
    },
    {
        id: "generic_general",
        version: 1,
        reviewStatus: "draft",
        label: "General health concern",
        bodySystem: "general",
        organDomain: "general",
        synonyms: [],
        route: { primary: S.GP, secondary: null, urgency: "routine", reason: "A General Physician is the right first doctor for a wide range of health concerns and can refer you on if needed." },
        concern: "General health concern",
        questions: [durationQuestion(null), severityQuestion],
        selfCare: ["Rest, stay hydrated and note any new symptoms before your consultation."]
    }
];
