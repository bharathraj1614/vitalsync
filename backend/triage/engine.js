/**
 * Clinical Triage Engine v2 — Orchestrator.
 *
 * Pipeline:
 *   1. SAFETY GATE (deterministic red flags, runs on every turn)
 *   2. UNDERSTAND (lexicon + typo/compound normalization -> LLM fallback -> body-system picker;
 *      NEVER silently defaults an unrecognized symptom to General Physician)
 *   3. PREFILL (detects answers already present in the initial description so we never ask
 *      redundant questions)
 *   4. ASK DISCRIMINATING QUESTIONS (only from the matched protocol's question list)
 *   5. ROUTE (deterministic protocol rules + profile modifiers + available doctors)
 *   6. EXPLAIN (constrained LLM polish validated against chosen specialties)
 */
import { runSafetyGate } from "./safetyGate.js";
import {
    ALL_PROTOCOLS,
    COMPLAINT_PROTOCOLS,
    SYSTEM_PICKER,
    getProtocol,
    validateProtocols
} from "./protocols/index.js";
import {
    classifyByLexicon,
    detectChildContext,
    hasSymptomCues,
    isCancelOrResetCommand,
    isNonSymptomMetaInput,
    mapAnswerToOption,
    mapSystemPick,
    prefillAnswers
} from "./classifier.js";
import { resolveProtocolRoute } from "./router.js";
import { classifyComplaintWithLLM, polishExplanationWithLLM } from "./llm.js";

// Validate protocol library once on module load
const startupErrors = validateProtocols();
if (startupErrors.length > 0) {
    console.error("⚠️ Triage protocol validation warnings:", startupErrors);
}

// Ring buffer of recent anonymized triage sessions for quality auditing
const triageAuditLog = [];
const MAX_AUDIT_LOG = 200;

export function recordTriageAudit(entry) {
    triageAuditLog.push({ timestamp: new Date().toISOString(), ...entry });
    if (triageAuditLog.length > MAX_AUDIT_LOG) triageAuditLog.shift();
}

export function getTriageAuditLog() {
    return [...triageAuditLog];
}

/**
 * Formats the "Understood: ..." confirmation object sent to the UI.
 */
function buildUnderstoodChip(protocol, answers = {}, classification = {}) {
    if (!protocol) return null;
    const prefilledDetails = [];
    for (const q of protocol.questions || []) {
        const val = answers[q.id];
        if (!val) continue;
        const opt = q.options.find((o) => o.value === val);
        if (opt) prefilledDetails.push({ questionId: q.id, slot: q.slot, label: opt.label });
    }
    const alternativeProtocols = (classification.alternatives || [])
        .map((id) => getProtocol(id))
        .filter(Boolean)
        .map((p) => ({ id: p.id, label: p.label }));

    // Offer same-body-system alternatives first, then common general complaints
    const sameSystem = COMPLAINT_PROTOCOLS.filter(
        (p) => p.id !== protocol.id && p.bodySystem === protocol.bodySystem
    );
    const otherSystem = COMPLAINT_PROTOCOLS.filter(
        (p) => p.id !== protocol.id && p.bodySystem !== protocol.bodySystem
    );
    const fallbackAlternatives = [...sameSystem, ...otherSystem]
        .slice(0, 5)
        .map((p) => ({ id: p.id, label: p.label }));

    return {
        protocolId: protocol.id,
        label: protocol.label,
        bodySystem: protocol.bodySystem,
        confidence: classification.confidence ?? 0.85,
        source: classification.source || "lexicon",
        prefilledDetails,
        alternatives: alternativeProtocols.length > 0 ? alternativeProtocols : fallbackAlternatives.slice(0, 4)
    };
}

/**
 * Finds the next unanswered question in a protocol.
 */
function getNextUnansweredQuestion(protocol, answers = {}) {
    for (const q of protocol.questions || []) {
        if (!answers[q.id]) return q;
    }
    return null;
}

/**
 * Converts `{ [qId]: optionValue }` into human-readable `{ slot, answer }[]` for the UI sidebar.
 */
function buildCollectedFactsList(protocol, answers = {}) {
    if (!protocol) return [];
    const list = [];
    for (const q of protocol.questions || []) {
        const val = answers[q.id];
        if (!val) continue;
        const opt = q.options.find((o) => o.value === val);
        list.push({
            questionId: q.id,
            slot: q.slot,
            answer: opt ? opt.label : val
        });
    }
    return list;
}

/**
 * Multi-turn triage state machine.
 *
 * Returns either:
 *   - `{ type: "system_picker", question, quickOptions, triageState }` when complaint is unclear
 *   - `{ type: "question", question, quickOptions, understood, triageState, canSkipToVerdict: true }`
 *   - `{ type: "verdict", routeResult, understood, triageState }`
 */
export async function runTriageTurn({
    message = "",
    triageState = null,
    forceVerdict = false,
    overrideProtocolId = null,
    patientContext = null,
    allowLLM = true
}) {
    const cleanMsg = String(message || "").trim();

    // 0. SESSION RESET / CANCELLATION INTERCEPTOR (prevents "cancel" or "start a new symptom check" from becoming a symptom or answer)
    if (!overrideProtocolId && !forceVerdict && isCancelOrResetCommand(cleanMsg)) {
        return {
            type: "reset",
            question:
                "Ready for a fresh symptom check! Tell me what symptoms you are experiencing, when they started, and how they feel.",
            quickOptions: [
                "I have severe hairfall at the top of my head",
                "Pooping right after drinking water happens daily",
                "Throbbing headache on one side for 2 days",
                "Itchy skin rash on my arms"
            ],
            canSkipToVerdict: false,
            triageState: {
                active: false,
                questionCount: 0,
                chiefComplaint: "",
                protocolId: null,
                answers: {},
                answersText: {},
                collectedFacts: []
            }
        };
    }

    // 0.5. META / NAVIGATION / GREETING GUARD (prevents action pills like "Open Medicine Safety Checker page" or "Hi" from becoming chief complaints)
    if (!overrideProtocolId && !forceVerdict && isNonSymptomMetaInput(cleanMsg)) {
        const directSafety = runSafetyGate(cleanMsg);
        const directLex = classifyByLexicon(cleanMsg);
        if (!directSafety.emergency && directSafety.urgent.length === 0 && !directLex) {
            return {
                type: "non_clinical",
                question:
                    "I'm Dr. Pulse, your VitalSync Clinical Assistant. Describe your physical symptoms in your own words to start a clinical check, ask if a medicine is safe with your profile, or pick an option below:",
                quickOptions: [
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water happens daily",
                    "Throbbing headache on one side for 2 days",
                    "Show available doctors"
                ],
                canSkipToVerdict: false,
                triageState: {
                    active: false,
                    questionCount: 0,
                    chiefComplaint: "",
                    protocolId: null,
                    answers: {},
                    answersText: {},
                    collectedFacts: []
                }
            };
        }
    }

    const isActive = Boolean(triageState?.active);
    const chiefComplaint = isActive && triageState.chiefComplaint ? triageState.chiefComplaint : cleanMsg;

    // Combine full narrative for safety gate & child check
    const priorAnswersText = Object.values(triageState?.answersText || {}).join(" ");
    const cumulativeNarrative = [chiefComplaint, priorAnswersText, cleanMsg].filter(Boolean).join(". ");

    // 1. SAFETY GATE (always runs first on cumulative narrative)
    const safety = runSafetyGate(cumulativeNarrative);
    const isChild = Boolean(triageState?.isChild) || detectChildContext(cumulativeNarrative);

    if (safety.emergency) {
        const currentProto = getProtocol(overrideProtocolId || triageState?.protocolId) || getProtocol("generic_general");
        const routeResult = resolveProtocolRoute({
            protocol: currentProto,
            answers: triageState?.answers || {},
            safety,
            patientContext,
            isChild,
            rawNarrative: cumulativeNarrative
        });
        recordTriageAudit({
            mode: "emergency_bypass",
            chiefComplaint,
            emergencyId: safety.emergency.id,
            primary: routeResult.primarySpeciality
        });
        return {
            type: "verdict",
            routeResult,
            understood: buildUnderstoodChip(currentProto, triageState?.answers || {}, { source: "safety_gate", confidence: 1 }),
            triageState: {
                active: false,
                questionCount: 0,
                chiefComplaint,
                protocolId: currentProto?.id || null,
                organDomain: routeResult.organDomain,
                answers: triageState?.answers || {},
                collectedFacts: buildCollectedFactsList(currentProto, triageState?.answers || {})
            }
        };
    }

    // 2. RESOLVE PROTOCOL (existing active protocol, user override, or new classification)
    let protocol = null;
    let classification = null;
    let answers = { ...(triageState?.answers || {}) };
    let answersText = { ...(triageState?.answersText || {}) };

    if (overrideProtocolId && getProtocol(overrideProtocolId)) {
        protocol = getProtocol(overrideProtocolId);
        classification = { protocolId: protocol.id, source: "user_override", confidence: 1.0, alternatives: [] };
        answers = prefillAnswers(protocol, chiefComplaint);
        answersText = {};
    } else if (isActive && triageState?.awaitingSystemPick) {
        const picked = mapSystemPick(cleanMsg);
        const rematch = classifyByLexicon(cleanMsg);
        if (picked) {
            protocol = getProtocol(picked.protocolId);
            classification = { protocolId: protocol.id, source: "system_picker", confidence: 0.9, alternatives: [] };
        } else if (rematch) {
            protocol = getProtocol(rematch.protocolId);
            classification = rematch;
            answers = prefillAnswers(protocol, cleanMsg);
        } else {
            protocol = getProtocol("generic_general");
            classification = { protocolId: "generic_general", source: "system_fallback", confidence: 0.5, alternatives: [] };
        }
    } else if (isActive && triageState?.protocolId) {
        protocol = getProtocol(triageState.protocolId);
        classification = {
            protocolId: protocol.id,
            source: triageState.classificationSource || "lexicon",
            confidence: triageState.classificationConfidence || 0.85,
            alternatives: []
        };

        // Map the user's answer to the question that was just asked
        if (cleanMsg && !forceVerdict && triageState.currentQuestionId) {
            const askedQ = (protocol.questions || []).find((q) => q.id === triageState.currentQuestionId);
            if (askedQ) {
                const matchedOpt = mapAnswerToOption(askedQ, cleanMsg);
                answers[askedQ.id] = matchedOpt ? matchedOpt.value : cleanMsg;
                answersText[askedQ.id] = matchedOpt ? matchedOpt.label : cleanMsg;
            }
        }
    } else {
        // Turn 1: Classify the initial symptom description
        if (isChild && !classifyByLexicon(cleanMsg)) {
            protocol = getProtocol("child_illness");
            classification = { protocolId: "child_illness", source: "child_detector", confidence: 0.9, alternatives: [] };
        } else {
            classification = classifyByLexicon(cleanMsg);
            if (!classification && allowLLM) {
                classification = await classifyComplaintWithLLM(cleanMsg);
            }
            if (classification) {
                protocol = getProtocol(classification.protocolId);
            }
        }

        // If still unknown -> verify it actually has symptom cues before prompting body-system picker!
        if (!protocol) {
            if (forceVerdict) {
                protocol = getProtocol("generic_general");
                classification = { protocolId: "generic_general", source: "forced_fallback", confidence: 0.5, alternatives: [] };
            } else if (hasSymptomCues(cleanMsg) || safety.urgent.length > 0 || isChild) {
                return {
                    type: "system_picker",
                    question:
                        "I want to make sure I ask the right questions and match the right specialist. Which area does your concern relate to?",
                    quickOptions: SYSTEM_PICKER.map((s) => s.label),
                    canSkipToVerdict: true,
                    triageState: {
                        active: true,
                        awaitingSystemPick: true,
                        questionCount: 1,
                        chiefComplaint,
                        protocolId: null,
                        organDomain: "general",
                        isChild,
                        answers: {},
                        answersText: {},
                        collectedFacts: []
                    }
                };
            } else {
                // Non-symptom / unclear input with zero symptom cues -> do NOT start triage or pollute chiefComplaint!
                return {
                    type: "non_clinical",
                    question:
                        "Could you describe the physical symptoms you are experiencing (for example: pain, fever, rash, dizziness, or digestive trouble), or choose one of the options below?",
                    quickOptions: [
                        "I have severe hairfall at the top of my head",
                        "Pooping right after drinking water happens daily",
                        "Throbbing headache on one side for 2 days",
                        "Show available doctors"
                    ],
                    canSkipToVerdict: false,
                    triageState: {
                        active: false,
                        questionCount: 0,
                        chiefComplaint: "",
                        protocolId: null,
                        answers: {},
                        answersText: {},
                        collectedFacts: []
                    }
                };
            }
        }

        // Pre-fill any answers the user already stated in their opening message
        answers = prefillAnswers(protocol, chiefComplaint);
    }

    const understood = buildUnderstoodChip(protocol, answers, classification);
    const collectedFacts = buildCollectedFactsList(protocol, answers);

    // 3. CHECK IF WE SHOULD ASK NEXT DISCRIMINATING QUESTION OR DELIVER VERDICT
    const nextQ = getNextUnansweredQuestion(protocol, answers);
    const urgentTriggeredByAnswer = safety.urgent.length > 0;

    // Also inspect if any answered option already set urgency === "emergency"
    const routePreview = resolveProtocolRoute({
        protocol,
        answers,
        safety,
        patientContext,
        isChild,
        rawNarrative: cumulativeNarrative
    });

    if (routePreview.urgency === "emergency") {
        const emergencyRoute = resolveProtocolRoute({
            protocol,
            answers,
            safety: {
                emergency: {
                    id: "protocol_emergency",
                    label: routePreview.possibleConcernArea || protocol.label,
                    route: routePreview.primarySpeciality
                },
                urgent: []
            },
            patientContext,
            isChild,
            rawNarrative: cumulativeNarrative
        });
        return {
            type: "verdict",
            routeResult: emergencyRoute,
            understood,
            triageState: {
                active: false,
                questionCount: 0,
                chiefComplaint,
                protocolId: protocol.id,
                organDomain: protocol.organDomain,
                answers,
                collectedFacts
            }
        };
    }

    if (!forceVerdict && !urgentTriggeredByAnswer && nextQ) {
        const totalQuestions = (protocol.questions || []).length;
        const answeredCount = Object.keys(answers).length;
        const stepNumber = Math.min(totalQuestions, answeredCount + 1);

        // On the very first question, acknowledge what was understood
        const prefilledSummary =
            understood.prefilledDetails.length > 0
                ? ` (${understood.prefilledDetails.map((d) => d.label.toLowerCase()).join(", ")})`
                : "";
        const prefix =
            !isActive || overrideProtocolId
                ? `I noted **${protocol.label.toLowerCase()}**${prefilledSummary}. `
                : "";

        return {
            type: "question",
            question: `${prefix.replace(/\*\*/g, "")}${nextQ.text}`,
            quickOptions: nextQ.options.map((o) => o.label),
            understood,
            canSkipToVerdict: true,
            triageState: {
                active: true,
                awaitingSystemPick: false,
                questionCount: stepNumber,
                totalQuestions,
                chiefComplaint,
                protocolId: protocol.id,
                protocolLabel: protocol.label,
                organDomain: protocol.organDomain,
                currentQuestionId: nextQ.id,
                lastSlotName: nextQ.slot,
                isChild,
                classificationSource: classification?.source || "lexicon",
                classificationConfidence: classification?.confidence || 0.85,
                answers,
                answersText,
                collectedFacts
            }
        };
    }

    // 4. DELIVER FINAL VERDICT
    let finalRoute = routePreview;
    if (allowLLM) {
        const factsSummary = collectedFacts.map((f) => `${f.slot}: ${f.answer}`).join(" | ");
        finalRoute = await polishExplanationWithLLM(routePreview, {
            chiefComplaint,
            factsSummary,
            patientSummary: patientContext?.summaryBadge || ""
        });
    }

    recordTriageAudit({
        mode: "verdict",
        chiefComplaint,
        protocolId: protocol.id,
        answers,
        primary: finalRoute.primarySpeciality,
        secondary: finalRoute.secondarySpeciality,
        urgency: finalRoute.urgency
    });

    return {
        type: "verdict",
        routeResult: finalRoute,
        understood,
        triageState: {
            active: false,
            questionCount: 0,
            chiefComplaint,
            protocolId: protocol.id,
            protocolLabel: protocol.label,
            organDomain: protocol.organDomain,
            answers,
            collectedFacts
        }
    };
}

/**
 * One-shot synchronous evaluation (used by legacy `/api/ai/analyze-symptoms` and unit tests).
 */
export function evaluateOneShotTriage(symptomText = "", { answers = {}, patientContext = null } = {}) {
    const safety = runSafetyGate(symptomText);
    const isChild = detectChildContext(symptomText);
    const lexiconMatch = classifyByLexicon(symptomText);
    const classification =
        isChild && (!lexiconMatch || answers.danger || answers.main)
            ? { protocolId: "child_illness", source: "child_detector", confidence: 0.9 }
            : lexiconMatch;

    const protocol = getProtocol(classification?.protocolId) || getProtocol("generic_general");
    const mergedAnswers = { ...prefillAnswers(protocol, symptomText), ...answers };

    const routeResult = resolveProtocolRoute({
        protocol,
        answers: mergedAnswers,
        safety,
        patientContext,
        isChild,
        rawNarrative: symptomText
    });

    return {
        classification,
        protocol,
        answers: mergedAnswers,
        safety,
        routeResult
    };
}

/**
 * Backward-compatible wrapper for `evaluateClinicalRules(symptomText)` in `aiController.js`
 * and `detectDoctorQuery(message)` in `chatbotController.js`.
 */
export function evaluateCompatibilityRules(symptomText = "") {
    const { classification, protocol, safety, routeResult } = evaluateOneShotTriage(symptomText);
    const matchedComplaint = Boolean(classification);
    const hasSymptomSignal = matchedComplaint || Boolean(safety.emergency) || safety.urgent.length > 0 || hasSymptomCues(symptomText);

    return {
        protocolId: protocol.id,
        protocolLabel: protocol.label,
        matchedComplaint,
        hasNeuroRedFlag: safety.emergency?.id === "stroke" || safety.emergency?.id === "neuro_acute",
        hasCardiacRedFlag: safety.emergency?.id === "cardiac" || safety.emergency?.id === "breathing",
        hasGiRedFlag:
            safety.emergency?.id === "bleeding" ||
            safety.urgent.some((u) => ["gi_bleed", "jaundice", "swallowing"].includes(u.id)),
        hasDermSpecialistFlag: protocol.organDomain === "derm",
        isPediatric: routeResult.primarySpeciality === "Pediatricians",
        isGynec: protocol.organDomain === "gynec",
        isGiDomain: protocol.organDomain === "gi",
        isNeuroDomain: protocol.organDomain === "neuro",
        isDermDomain: protocol.organDomain === "derm",
        isChronicOrPersistent: routeResult.urgency === "soon",
        organDomain: protocol.organDomain || "general",
        isLifeThreateningEmergency: routeResult.isEmergencyBypass,
        isBenignPrimarySymptom: !routeResult.isEmergencyBypass && routeResult.urgency === "routine",
        hasPrimaryCareComplaint: hasSymptomSignal,
        deterministicSpeciality: routeResult.primarySpeciality,
        secondarySpeciality: routeResult.secondarySpeciality,
        urgencyLevel: routeResult.urgencyLevel,
        routeResult
    };
}

export { ALL_PROTOCOLS, COMPLAINT_PROTOCOLS, SYSTEM_PICKER, getProtocol };
