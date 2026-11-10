/**
 * Shared helpers for authoring complaint protocols.
 *
 * PROTOCOL SCHEMA
 * {
 *   id, version, reviewStatus: "draft" | "clinician_reviewed",
 *   label, bodySystem, organDomain,           // organDomain kept for UI compatibility
 *   synonyms: string[],                        // phrases that identify this complaint (typo tolerant)
 *   route: { primary, secondary, ideal, urgency, reason, secondaryReason },
 *   concern: string,                           // non-diagnostic "what this may relate to"
 *   questions: [{ id, slot, text, options: [{ value, label, match[], effects }] }],
 *   profileRules: [{ when: { minAge, maxAge, sex, answers: { qid: [values] } }, effects }],
 *   medicationHints: [{ match: string[], note }],
 *   selfCare: string[]
 * }
 *
 * EFFECTS (applied in order; later answers override, urgency only ever escalates)
 * { primary, secondary (null clears), ideal, urgency, reason, secondaryReason, concern }
 *
 * DESIGN RULE: every option must change route, urgency, or concern. If an option changes
 * nothing, the question is not discriminating and must be removed.
 *
 * ⚠️ All protocol content is a DRAFT drafted from NICE CKS, MoHFW Standard Treatment Guidelines,
 * IAP and AAD patient guidance. It must be reviewed by a licensed clinician before production use.
 */
export { BOOKABLE_SPECIALTIES as S, IDEAL_SPECIALTIES as I } from "../specialties.js";

export const opt = (value, label, effects = {}, match = []) => ({ value, label, effects, match });

export const NONE_OPTION = (label = "None of these") =>
    opt("none", label, {}, ["none", "nothing", "no", "none of these", "nope", "not really"]);
