/**
 * Deterministic Routing Resolver.
 *
 * Given:
 *   - a protocol from the library,
 *   - answers collected from the patient (`{ [questionId]: optionValue }`),
 *   - safety gate output (`{ emergency, urgent }`),
 *   - patient profile context (`{ age, gender, allergies, currentMedications, medsFormatted, chronicConditions }`),
 *   - whether the patient is a child (`isChild`),
 *
 * Computes the final, auditable routing decision:
 *   - primarySpeciality (always one of the 6 bookable specialties)
 *   - secondarySpeciality (bookable specialty or null)
 *   - idealSpeciality (optional non-bookable specialist name when ideal != bookable)
 *   - idealNote (honest explanation when ideal specialist is not on the platform)
 *   - urgency ("routine" | "soon" | "urgent" | "emergency")
 *   - urgencyLevel ("low" | "medium" | "high" for frontend compatibility)
 *   - possibleConcernArea
 *   - primaryReasoning / secondaryReasoning
 *   - immediateAdvice
 *   - medicationNotes
 */
import { BOOKABLE_SPECIALTIES as S, maxUrgency, toLegacyUrgency } from "./specialties.js";
import { findPhrase, tokenize } from "./normalize.js";

function applyEffects(state, effects = {}) {
    if (!effects) return;
    if (effects.primary) {
        // If primary changes and no explicit secondary was set in effects, keep previous primary as secondary if different
        if (!("secondary" in effects) && state.primary && state.primary !== effects.primary) {
            state.secondary = state.primary;
        }
        state.primary = effects.primary;
    }
    if ("secondary" in effects) {
        // Don't clobber an existing valid secondary if the option's secondary is already the primary specialist
        if (effects.secondary && effects.secondary === state.primary) {
            // keep current state.secondary (e.g. GP when Q1 already promoted Specialist to primary)
        } else {
            state.secondary = effects.secondary;
        }
    }
    if (effects.ideal) {
        state.ideal = effects.ideal;
    }
    if (effects.urgency) {
        state.urgency = maxUrgency(state.urgency, effects.urgency);
    }
    if (effects.reason) {
        state.reason = effects.reason;
    }
    if (effects.secondaryReason) {
        state.secondaryReason = effects.secondaryReason;
    }
    if (effects.concern) {
        state.concern = effects.concern;
    }
}

function matchesProfileCondition(when = {}, { age, sex, answers }) {
    if (when.minAge !== undefined && (age === null || age === undefined || age < when.minAge)) {
        return false;
    }
    if (when.maxAge !== undefined && (age === null || age === undefined || age > when.maxAge)) {
        return false;
    }
    if (when.sex && (!sex || sex.toLowerCase() !== when.sex.toLowerCase())) {
        return false;
    }
    if (when.answers) {
        for (const [qId, allowedValues] of Object.entries(when.answers)) {
            if (!allowedValues.includes(answers[qId])) return false;
        }
    }
    return true;
}

export function resolveProtocolRoute({
    protocol,
    answers = {},
    safety = { emergency: null, urgent: [] },
    patientContext = null,
    isChild = false,
    rawNarrative = ""
}) {
    // 1. Emergency short-circuit
    if (safety?.emergency) {
        const em = safety.emergency;
        const primary = isChild ? S.PEDS : em.route || S.GP;
        return {
            protocolId: protocol?.id || "emergency",
            protocolLabel: protocol?.label || em.label,
            organDomain: protocol?.organDomain || "general",
            urgency: "emergency",
            urgencyLevel: "high",
            isEmergencyBypass: true,
            emergencyRule: em,
            emergencyBanner: em.crisisLine
                ? `IMMEDIATE SUPPORT AVAILABLE: Please call ${em.crisisLine} right now. You do not have to carry this alone.`
                : `ACUTE MEDICAL EMERGENCY (${em.label.toUpperCase()}): Per MoHFW Telemedicine Guidelines, please call 108 / 112 or go to the nearest Hospital Emergency Room immediately.`,
            primarySpeciality: primary,
            secondarySpeciality: primary !== S.GP ? S.GP : null,
            idealSpeciality: null,
            idealNote: null,
            possibleConcernArea: `${em.label} — Immediate In-Person Emergency Care Required`,
            primaryReasoning: `Your symptoms include a critical warning sign (${em.label.toLowerCase()}). Telemedicine cannot safely replace emergency hospital care for this presentation.`,
            secondaryReasoning: "",
            immediateAdvice: em.crisisLine
                ? `Call ${em.crisisLine} immediately and stay with a trusted family member or friend.`
                : "Call 108 / 112 immediately, do not drive yourself to the hospital, and keep someone with you until help arrives.",
            medicationNotes: []
        };
    }

    // 2. Start from protocol baseline
    const state = {
        primary: protocol.route.primary,
        secondary: protocol.route.secondary || null,
        ideal: protocol.route.ideal || null,
        urgency: protocol.route.urgency || "routine",
        reason: protocol.route.reason,
        secondaryReason: protocol.route.secondaryReason || "",
        concern: protocol.concern
    };

    // 3. Apply each answered question's option effects in order
    for (const q of protocol.questions || []) {
        const chosenVal = answers[q.id];
        if (!chosenVal) continue;
        const opt = q.options.find((o) => o.value === chosenVal);
        if (opt?.effects) {
            applyEffects(state, opt.effects);
        }
    }

    // 4. Apply profile rules (age, biological sex, answer combinations)
    const age = patientContext?.age ?? null;
    const sex = patientContext?.gender ?? null;
    for (const rule of protocol.profileRules || []) {
        if (matchesProfileCondition(rule.when, { age, sex, answers })) {
            applyEffects(state, rule.effects);
        }
    }

    // 5. Apply urgent safety-gate hits (escalate urgency and route if needed)
    if (safety?.urgent?.length > 0) {
        state.urgency = maxUrgency(state.urgency, "urgent");
        const urgentHit = safety.urgent[0];
        if (urgentHit.route && urgentHit.route !== state.primary) {
            state.secondary = state.primary;
            state.primary = urgentHit.route;
            state.reason = `Because you mentioned ${urgentHit.label.toLowerCase()}, prompt evaluation by a ${urgentHit.route} is recommended.`;
        }
    }

    // 6. Pediatric override (child phrase in prompt OR profile age < 16)
    const childByAge = age !== null && age < 16;
    if ((isChild || childByAge) && protocol.id !== "pregnancy") {
        if (state.primary !== S.PEDS) {
            state.secondary = state.primary;
            state.secondaryReason = `A ${state.primary} can also co-manage organ-specific concerns alongside your child's Pediatrician.`;
            state.primary = S.PEDS;
            state.reason = "Because the patient is under 16, a Pediatrician is the primary specialist for age-appropriate diagnosis and weight-based dosing.";
        }
    }

    // 7. Biological sex sanity check: never route a male patient to Gynecologist
    if (sex && sex.toLowerCase() === "male") {
        if (state.primary === S.GYNEC) {
            state.primary = S.GP;
            state.reason = "A General Physician can evaluate your symptoms and arrange targeted tests.";
        }
        if (state.secondary === S.GYNEC) {
            state.secondary = null;
            state.secondaryReason = "";
        }
    }

    // Deduplicate primary & secondary
    if (state.secondary === state.primary) {
        state.secondary = null;
    }

    if (state.secondary && !state.secondaryReason) {
        state.secondaryReason = `You can also consult a ${state.secondary} for targeted specialist evaluation alongside your ${state.primary}.`;
    }

    // 8. Medication hints (match against patient profile meds + raw text)
    const medSourceText = [
        rawNarrative,
        ...(patientContext?.medsFormatted || [])
    ].join(" ");
    const medTokens = tokenize(medSourceText);
    const medicationNotes = [];
    for (const hint of protocol.medicationHints || []) {
        if (hint.match.some((m) => findPhrase(medTokens, m).found)) {
            medicationNotes.push(hint.note);
        }
    }

    // 9. Honest ideal-specialist disclosure when ideal specialist isn't one of the 6 bookable specialties
    const idealNote = state.ideal
        ? `Clinical note: An ${state.ideal} is the sub-specialist for this condition. On VitalSync, a ${state.primary} can run the initial workup and start treatment.`
        : null;

    const selfCareLines = [...(protocol.selfCare || [])];
    if (medicationNotes.length > 0) {
        selfCareLines.unshift(medicationNotes[0]);
    }

    return {
        protocolId: protocol.id,
        protocolLabel: protocol.label,
        organDomain: protocol.organDomain || "general",
        urgency: state.urgency,
        urgencyLevel: toLegacyUrgency(state.urgency),
        isEmergencyBypass: false,
        emergencyRule: null,
        emergencyBanner: null,
        primarySpeciality: state.primary,
        secondarySpeciality: state.secondary,
        idealSpeciality: state.ideal,
        idealNote,
        possibleConcernArea: state.concern,
        primaryReasoning: state.reason + (idealNote ? ` (${idealNote})` : ""),
        secondaryReasoning: state.secondaryReason,
        immediateAdvice: selfCareLines.slice(0, 3).join(" "),
        medicationNotes
    };
}
