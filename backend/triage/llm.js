/**
 * Strictly Constrained LLM Layer for Clinical Triage Engine v2.
 *
 * RULE 1: The LLM may classify free text into one of the existing protocol IDs when
 *         the deterministic lexicon does not match. It CANNOT invent a protocol or route.
 * RULE 2: The LLM may polish explanation prose, but every sentence is checked against
 *         `SPECIALTY_MENTION_PATTERNS`. If the LLM mentions a specialist not chosen by
 *         the deterministic router, that text is discarded and the protocol's text is used.
 */
import { getTextModel } from "../config/gemini.js";
import { COMPLAINT_PROTOCOLS, getProtocol } from "./protocols/index.js";
import { SPECIALTY_MENTION_PATTERNS } from "./specialties.js";

const PROTOCOL_CATALOG_PROMPT = COMPLAINT_PROTOCOLS.map(
    (p) => `- "${p.id}": ${p.label} (${p.synonyms.slice(0, 5).join(", ")})`
).join("\n");

/**
 * Maps free-text patient input to a known complaint protocol ID using Gemini.
 * Returns null if offline, low confidence, or invalid protocol ID.
 */
export async function classifyComplaintWithLLM(text = "") {
    if (!process.env.GEMINI_API_KEY || !text || text.trim().length < 3) {
        return null;
    }
    try {
        const model = getTextModel();
        const prompt = `You are a clinical symptom normalizer. Map the patient's message to the single best matching complaint protocol ID from the catalog below, or "unknown" if none fit.

CATALOG:
${PROTOCOL_CATALOG_PROMPT}

Patient message: "${text.replace(/"/g, "'")}"

Respond in raw JSON ONLY (no markdown):
{
  "protocolId": "<one id from catalog or 'unknown'>",
  "confidence": 0.0 to 1.0
}`;
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(raw);
        if (!parsed?.protocolId || parsed.protocolId === "unknown") return null;
        const proto = getProtocol(parsed.protocolId);
        const confidence = Number(parsed.confidence || 0);
        if (!proto || confidence < 0.65) return null;
        return {
            protocolId: proto.id,
            source: "llm",
            confidence,
            hits: [],
            alternatives: []
        };
    } catch {
        return null;
    }
}

/**
 * Checks whether `text` mentions any specialist outside the allowed set.
 */
export function mentionsDisallowedSpecialty(text = "", allowedSpecialties = []) {
    const allowedSet = new Set(allowedSpecialties.filter(Boolean));
    for (const [specName, regexes] of Object.entries(SPECIALTY_MENTION_PATTERNS)) {
        if (allowedSet.has(specName)) continue;
        if (regexes.some((rx) => rx.test(text))) {
            return specName;
        }
    }
    return null;
}

/**
 * Polishes the explanation text while strictly enforcing the router's chosen specialists.
 */
export async function polishExplanationWithLLM(routeResult, { chiefComplaint = "", factsSummary = "", patientSummary = "" } = {}) {
    if (!process.env.GEMINI_API_KEY || routeResult.isEmergencyBypass) {
        return routeResult;
    }

    const allowedSpecialties = [
        routeResult.primarySpeciality,
        routeResult.secondarySpeciality,
        routeResult.idealSpeciality
    ].filter(Boolean);

    try {
        const model = getTextModel();
        const prompt = `You are VitalSync's Clinical Triage Writer.
The deterministic clinical router has ALREADY decided the specialist route. You MUST NOT change or contradict it, and you MUST NOT mention any specialist other than: ${allowedSpecialties.join(", ")}.

Patient Profile: ${patientSummary || "Adult patient"}
Chief Complaint: ${chiefComplaint} (${routeResult.protocolLabel})
Clarified Details: ${factsSummary || "None additional"}
Confirmed Concern Area: ${routeResult.possibleConcernArea}
Primary Specialist: ${routeResult.primarySpeciality}
Secondary Specialist: ${routeResult.secondarySpeciality || "None"}

Write warm, clear, non-diagnostic patient guidance in raw JSON ONLY (no markdown):
{
  "primaryReasoning": "1-2 sentences explaining why ${routeResult.primarySpeciality} is the right primary choice for these specific symptoms",
  "secondaryReasoning": "${routeResult.secondarySpeciality ? `1-2 sentences explaining why ${routeResult.secondarySpeciality} is also recommended alongside` : ""}"
}`;
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(raw);

        const next = { ...routeResult };
        if (
            parsed.primaryReasoning &&
            !mentionsDisallowedSpecialty(parsed.primaryReasoning, [routeResult.primarySpeciality, routeResult.idealSpeciality])
        ) {
            next.primaryReasoning = parsed.primaryReasoning + (routeResult.idealNote ? ` (${routeResult.idealNote})` : "");
        }
        if (
            routeResult.secondarySpeciality &&
            parsed.secondaryReasoning &&
            !mentionsDisallowedSpecialty(parsed.secondaryReasoning, [routeResult.secondarySpeciality, routeResult.primarySpeciality])
        ) {
            next.secondaryReasoning = parsed.secondaryReasoning;
        }
        return next;
    } catch {
        return routeResult;
    }
}
