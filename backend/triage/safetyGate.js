/**
 * Deterministic Safety Gate — runs FIRST on every free-text turn, before any protocol logic.
 *
 * EMERGENCY rules bypass the interview entirely (call 108 / 112).
 * URGENT rules do not stop the interview but raise urgency and may force a route.
 *
 * Matching is word-boundary + negation aware ("no chest pain" does not fire).
 * Sources: MoHFW Telemedicine Practice Guidelines (2020) emergency list, NICE CKS red flags,
 * AHA/ASA BE-FAST stroke signs, SNOOP4 headache red flags.
 *
 * ⚠️ Clinical content — requires review by a licensed clinician before production use.
 */
import { tokenize, findPhrase } from "./normalize.js";
import { BOOKABLE_SPECIALTIES as S } from "./specialties.js";

/**
 * A rule fires when ANY of `any` matches, or when ALL groups in `all` have at least one match.
 */
export const EMERGENCY_RULES = [
    {
        id: "cardiac",
        label: "Possible heart attack",
        any: ["crushing chest", "chest pressure", "chest tightness", "heart attack", "pain radiating to left arm", "pain radiating to jaw"],
        all: [["chest pain", "chest ache", "pain in chest", "seene me dard"], ["sweating", "left arm", "jaw", "breathless", "shortness of breath", "vomiting", "nausea"]],
        route: S.GP
    },
    {
        id: "stroke",
        label: "Possible stroke (BE-FAST signs)",
        any: [
            "face drooping", "facial droop", "face droop", "slurred speech", "cannot speak", "cant speak",
            "one sided weakness", "weakness on one side", "numbness on one side", "one side of body",
            "sudden loss of vision", "sudden vision loss", "sudden blindness", "paralysis", "paralysed", "paralyzed", "stroke"
        ],
        route: S.NEURO
    },
    {
        id: "breathing",
        label: "Severe breathing difficulty or allergic reaction",
        any: [
            "cannot breathe", "cant breathe", "unable to breathe", "struggling to breathe", "gasping",
            "lips turning blue", "blue lips", "throat closing", "throat swelling", "tongue swelling", "anaphylaxis"
        ],
        route: S.GP
    },
    {
        id: "neuro_acute",
        label: "Acute neurological emergency",
        any: [
            "worst headache of my life", "thunderclap", "sudden severe headache", "seizure", "seizures",
            "convulsion", "convulsions", "fits", "unconscious", "not waking up",
            "stiff neck with fever", "sudden confusion"
        ],
        route: S.NEURO
    },
    {
        id: "pregnancy_emergency",
        label: "Pregnancy warning sign",
        all: [["pregnant", "pregnancy"], ["bleeding", "severe pain", "baby not moving", "water broke", "fits", "seizure"]],
        route: S.GYNEC
    },
    {
        id: "cauda_equina",
        label: "Possible spinal nerve compression (cauda equina)",
        any: ["loss of bladder control", "loss of bowel control", "incontinence with back pain", "numbness in groin", "saddle anesthesia"],
        route: S.NEURO
    },
    {
        id: "bleeding",
        label: "Serious bleeding",
        any: [
            "vomiting blood", "blood in vomit", "coughing blood", "coughing up blood", "black tarry stool",
            "bleeding wont stop", "bleeding not stopping", "uncontrolled bleeding"
        ],
        all: [["bleeding"], ["wont stop", "not stopping", "uncontrolled"]],
        route: S.GASTRO
    },
    {
        id: "mental_health_crisis",
        label: "Mental health crisis",
        any: [
            "suicide", "suicidal", "kill myself", "end my life", "want to die", "self harm", "hurt myself",
            "cut myself", "no reason to live"
        ],
        route: S.GP,
        crisisLine: "Tele-MANAS 14416 (24x7, free) or 112"
    }
];

export const URGENT_RULES = [
    { id: "gi_bleed", label: "Blood in stool", any: ["blood in stool", "bloody stool", "blood in poop", "rectal bleeding", "black stool", "bleeding from anus"], route: S.GASTRO },
    { id: "jaundice", label: "Yellowing of eyes/skin", any: ["jaundice", "yellow eyes", "yellow skin", "eyes turning yellow", "piliya"], route: S.GASTRO },
    { id: "weight_loss", label: "Unexplained weight loss", any: ["unexplained weight loss", "losing weight without trying", "sudden weight loss"], route: S.GP },
    { id: "persistent_vomiting", label: "Unable to keep fluids down", any: ["cannot keep water down", "cant keep anything down", "persistent vomiting", "vomiting everything"], route: S.GP },
    { id: "swallowing", label: "Difficulty swallowing", any: ["difficulty swallowing", "cannot swallow", "food getting stuck", "dysphagia"], route: S.GASTRO },
    { id: "high_fever", label: "Very high or prolonged fever", any: ["fever for a week", "fever since a week", "104", "105", "high fever for 3 days", "fever more than 3 days"], route: S.GP },
    { id: "syncope", label: "Fainting episode", any: ["fainted", "passed out", "blacked out", "fainting"], route: S.GP },
    { id: "spreading_skin", label: "Rapidly spreading skin infection", any: ["spreading redness", "spreading rapidly", "skin turning black", "red streak"], route: S.DERM }
];

function ruleMatches(tokens, rule) {
    const positive = (p) => {
        const r = findPhrase(tokens, p);
        return r.found && !r.negated;
    };
    const anyHit = (rule.any || []).find(positive);
    if (anyHit) return anyHit;
    if (rule.all && rule.all.every((group) => group.some(positive))) {
        return rule.all.map((g) => g.find(positive)).join(" + ");
    }
    return null;
}

/**
 * @returns {{ emergency: object|null, urgent: object[] }}
 */
export function runSafetyGate(text = "") {
    const tokens = tokenize(text);
    if (tokens.length === 0) return { emergency: null, urgent: [] };

    for (const rule of EMERGENCY_RULES) {
        const hit = ruleMatches(tokens, rule);
        if (hit) return { emergency: { ...rule, matched: hit }, urgent: [] };
    }

    const urgent = [];
    for (const rule of URGENT_RULES) {
        const hit = ruleMatches(tokens, rule);
        if (hit) urgent.push({ ...rule, matched: hit });
    }
    return { emergency: null, urgent };
}
