import mongoose from "mongoose";
import { getTextModel } from "../config/gemini.js";
import { retrieveContext } from "../utils/ragEngine.js";
import doctorModel from "../models/doctorModel.js";
import userModel from "../models/userModel.js";
import { AVAILABLE_SPECIALITIES, evaluateClinicalRules } from "./aiController.js";
import { evaluateSafetyWithAI } from "../data/ddiDatabase.js";
import { runTriageTurn } from "../triage/engine.js";

// In-memory conversation history (per user session)
const conversationHistory = new Map();
const MAX_HISTORY = 12;

// Explicit specialist request keywords
const EXPLICIT_SPECIALITY_ALIASES = {
    "General physician": ["general physician", "general doctor", "family doctor", "gp", "internal medicine"],
    "Gynecologist": ["gynecologist", "gynaecologist", "gynec", "obstetrician"],
    "Dermatologist": ["dermatologist", "skin specialist", "skin doctor", "trichologist", "hair specialist"],
    "Pediatricians": ["pediatrician", "paediatrician", "child specialist"],
    "Neurologist": ["neurologist", "brain specialist", "nerve specialist"],
    "Gastroenterologist": ["gastroenterologist", "gastrologist", "gasterologist", "gastro specialist", "gut specialist", "digestive specialist", "liver specialist"]
};

const MEDICINE_INTENT_KEYWORDS = [
    "can i take", "is it safe to take", "interaction", "interact with",
    "side effect", "allergic to", "safe for me", "tablet", "capsule",
    "ibuprofen", "paracetamol", "aspirin", "amoxicillin", "penicillin", "metformin",
    "azithromycin", "pantoprazole", "omeprazole", "cetirizine", "dolo", "combiflam", "augmentin"
];

const PLATFORM_FAQ_KEYWORDS = [
    "how do i book", "how to book", "cancel appointment", "refund", "reschedule",
    "video call", "join call", "prescription download", "verify prescription",
    "payment", "razorpay", "stripe", "where can i see"
];

/**
 * Computes patient age from DOB string
 */
function calculateAgeFromDob(dob) {
    if (!dob || dob === "Not Selected") return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const diffMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(diffMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    return !isNaN(age) && age >= 0 && age < 130 ? age : null;
}

/**
 * Fetches and formats patient clinical profile context
 */
async function getPatientClinicalContext(userId) {
    if (!userId || userId === "anonymous" || !mongoose.Types.ObjectId.isValid(userId)) {
        return null;
    }
    try {
        const user = await userModel
            .findById(userId)
            .select("name dob gender bloodGroup allergies noKnownAllergies currentMedications noCurrentMedications chronicConditions noChronicConditions heightCm weightKg")
            .lean();
        if (!user) return null;

        const age = calculateAgeFromDob(user.dob);
        const gender = user.gender && user.gender !== "Not Selected" ? user.gender : null;
        const allergiesList = Array.isArray(user.allergies) ? user.allergies.filter(Boolean) : [];
        const medsList = Array.isArray(user.currentMedications)
            ? user.currentMedications.map((m) => (typeof m === "string" ? m : `${m.name}${m.dosage ? ` (${m.dosage})` : ""}`)).filter(Boolean)
            : [];
        const conditionsList = Array.isArray(user.chronicConditions) ? user.chronicConditions.filter(Boolean) : [];

        const summaryParts = [];
        if (age !== null) summaryParts.push(`${age} yrs`);
        if (gender) summaryParts.push(gender);
        if (user.bloodGroup) summaryParts.push(`Blood: ${user.bloodGroup}`);
        if (allergiesList.length > 0) summaryParts.push(`Allergies: ${allergiesList.join(", ")}`);
        else if (user.noKnownAllergies) summaryParts.push("Allergies: None (NKDA)");
        if (medsList.length > 0) summaryParts.push(`Active Meds: ${medsList.join(", ")}`);
        if (conditionsList.length > 0) summaryParts.push(`Conditions: ${conditionsList.join(", ")}`);

        return {
            name: user.name,
            age,
            gender,
            bloodGroup: user.bloodGroup || null,
            allergies: allergiesList,
            noKnownAllergies: Boolean(user.noKnownAllergies),
            currentMedications: user.currentMedications || [],
            medsFormatted: medsList,
            chronicConditions: conditionsList,
            summaryBadge: summaryParts.join(" • ") || "Registered Patient"
        };
    } catch {
        return null;
    }
}

/**
 * Intent & Explicit Specialty Detector
 */
function detectDoctorQuery(message) {
    const lower = String(message || "").toLowerCase();

    const doctorIntentWords = [
        "doctor", "specialist", "available", "book", "appointment",
        "consult", "find", "recommend", "suggest", "which", "who", "list", "show"
    ];
    const hasDoctorIntent = doctorIntentWords.some((w) => lower.includes(w));

    const ruleVerdict = evaluateClinicalRules(lower);
    const hasSymptomIntent = Boolean(ruleVerdict.hasPrimaryCareComplaint);

    // 1. Check if the user explicitly named a specialist title (e.g., "show me dermatologists")
    for (const speciality of AVAILABLE_SPECIALITIES) {
        if (lower.includes(speciality.toLowerCase())) {
            return { isDoctorQuery: true, hasSymptomIntent, explicitSpeciality: speciality, speciality, ruleVerdict };
        }
    }
    for (const [speciality, aliases] of Object.entries(EXPLICIT_SPECIALITY_ALIASES)) {
        if (aliases.some((alias) => lower.includes(alias))) {
            return { isDoctorQuery: true, hasSymptomIntent, explicitSpeciality: speciality, speciality, ruleVerdict };
        }
    }

    if (!hasDoctorIntent && !hasSymptomIntent) {
        return { isDoctorQuery: false, hasSymptomIntent: false, explicitSpeciality: null, speciality: null, ruleVerdict };
    }

    if (hasSymptomIntent) {
        return {
            isDoctorQuery: true,
            hasSymptomIntent: true,
            explicitSpeciality: null,
            speciality: ruleVerdict.deterministicSpeciality,
            ruleVerdict
        };
    }

    return { isDoctorQuery: true, hasSymptomIntent: false, explicitSpeciality: null, speciality: null, ruleVerdict };
}

/**
 * Hydrates a deterministic `routeResult` from `runTriageTurn` with live doctors and handoff summary.
 */
async function hydrateClinicalVerdict({ routeResult, chiefComplaint, collectedFacts = [], patientContext = null }) {
    const primaryDoctors = await doctorModel
        .find({ speciality: routeResult.primarySpeciality, available: true })
        .select("name speciality degree experience fees address image about")
        .limit(4)
        .lean();

    const secondaryDoctors =
        routeResult.secondarySpeciality && routeResult.secondarySpeciality !== routeResult.primarySpeciality
            ? await doctorModel
                  .find({ speciality: routeResult.secondarySpeciality, available: true })
                  .select("name speciality degree experience fees address image about")
                  .limit(4)
                  .lean()
            : [];

    const handoffLines = [
        `Chief Complaint: ${chiefComplaint} (${routeResult.protocolLabel})`,
        ...(collectedFacts.length > 0
            ? [`Triage Details: ${collectedFacts.map((f) => `${f.slot}: ${f.answer}`).join("; ")}`]
            : []),
        ...(patientContext?.summaryBadge ? [`Patient Context: ${patientContext.summaryBadge}`] : []),
        `Triage Routing: ${routeResult.primarySpeciality}${routeResult.secondarySpeciality ? ` + ${routeResult.secondarySpeciality}` : ""} (${routeResult.urgency.toUpperCase()})`
    ];

    return {
        protocolId: routeResult.protocolId,
        protocolLabel: routeResult.protocolLabel,
        urgency: routeResult.urgency,
        urgencyLevel: routeResult.urgencyLevel,
        isEmergencyBypass: routeResult.isEmergencyBypass,
        emergencyBanner: routeResult.emergencyBanner,
        primarySpeciality: routeResult.primarySpeciality,
        primaryReasoning: routeResult.primaryReasoning,
        primaryDoctors,
        secondarySpeciality: routeResult.secondarySpeciality,
        secondaryReasoning: routeResult.secondaryReasoning,
        secondaryDoctors,
        idealSpeciality: routeResult.idealSpeciality,
        idealNote: routeResult.idealNote,
        possibleConcernArea: routeResult.possibleConcernArea,
        immediateAdvice: routeResult.immediateAdvice,
        medicationNotes: routeResult.medicationNotes || [],
        clinicalSummaryForDoctor: handoffLines.join(" | "),
        patientProfileUsed: patientContext?.summaryBadge || null,
        disclaimer:
            "Automated clinical triage (Draft v1 — requires clinician review before clinical deployment). Not a substitute for an in-person medical diagnosis."
    };
}

/**
 * Unified Multi-Turn Clinical Assistant Endpoint (POST /api/chatbot/assistant)
 * Powers both the full-page Symptom Checker Assistant and the floating ChatWidget.
 */
const assistantTurn = async (req, res) => {
    try {
        const {
            userId,
            message = "",
            triageState = null,
            forceVerdict = false,
            overrideProtocolId = null
        } = req.body;

        const cleanMsg = String(message).trim();
        if (!cleanMsg && !forceVerdict && !overrideProtocolId) {
            return res.json({ success: false, message: "Please enter a message" });
        }

        // 1. Load live patient clinical profile from MongoDB if logged in
        const patientContext = await getPatientClinicalContext(userId);

        // 2. Check if user is asking a Medicine / Drug Allergy Safety question
        const lowerMsg = cleanMsg.toLowerCase();
        const isMedicineSafetyQuery =
            !triageState?.active &&
            !overrideProtocolId &&
            MEDICINE_INTENT_KEYWORDS.some((kw) => lowerMsg.includes(kw)) &&
            (lowerMsg.includes("safe") ||
                lowerMsg.includes("take") ||
                lowerMsg.includes("interact") ||
                lowerMsg.includes("allerg"));

        if (isMedicineSafetyQuery) {
            const candidateDrugs = [
                "Ibuprofen", "Paracetamol", "Aspirin", "Amoxicillin", "Penicillin",
                "Metformin", "Azithromycin", "Pantoprazole", "Omeprazole", "Cetirizine",
                "Dolo 650", "Combiflam", "Augmentin", "Ciprofloxacin", "Diclofenac", "Naproxen"
            ].filter((d) => lowerMsg.includes(d.toLowerCase()));

            const drugsToScreen = candidateDrugs.length > 0 ? candidateDrugs : [cleanMsg];
            const safetyReport = await evaluateSafetyWithAI(
                drugsToScreen,
                patientContext?.currentMedications || [],
                patientContext?.allergies || []
            );

            const replyText =
                safetyReport.overallRisk === "SAFE"
                    ? `I screened ${drugsToScreen.join(", ")} against your profile (${patientContext?.summaryBadge || "no recorded allergies"}). No direct allergy or drug-drug conflicts were flagged, though you should always confirm dosing with your doctor.`
                    : `Safety Alert (${safetyReport.overallRisk} Risk): Screening ${drugsToScreen.join(", ")} against your profile (${patientContext?.summaryBadge || "profile"}) flagged potential concerns. Please review the safety card below before taking this medication.`;

            return res.json({
                success: true,
                intent: "medicine_safety",
                response: replyText,
                safetyReport,
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: { active: false, questionCount: 0, chiefComplaint: "", collectedFacts: [] },
                quickOptions: [
                    "Check my symptoms instead",
                    "Show General Physician doctors",
                    "Open Medicine Safety Checker page"
                ]
            });
        }

        // 3. Check for explicit specialist lookup (e.g. "Show me Dermatologists") or FAQ
        const { hasSymptomIntent, explicitSpeciality } = detectDoctorQuery(cleanMsg);
        const isFaqIntent = !overrideProtocolId && PLATFORM_FAQ_KEYWORDS.some((kw) => lowerMsg.includes(kw));

        if (explicitSpeciality && !triageState?.active && !hasSymptomIntent && !overrideProtocolId) {
            const docs = await doctorModel
                .find({ speciality: explicitSpeciality, available: true })
                .select("name speciality degree experience fees address image about")
                .limit(5)
                .lean();

            return res.json({
                success: true,
                intent: "doctor_lookup",
                response:
                    docs.length > 0
                        ? `Here are our available ${explicitSpeciality} specialists. You can book a consultation directly or describe your symptoms for a guided clinical check:`
                        : `We don't have an available ${explicitSpeciality} online right this moment, but you can browse all doctors or describe your symptoms below.`,
                doctors: docs,
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: { active: false, questionCount: 0, chiefComplaint: "", collectedFacts: [] },
                quickOptions: [
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water daily",
                    "Show General Physician doctors"
                ]
            });
        }

        // 4. Symptom Triage Flow (Clinical Triage Engine v2)
        // If user is on the symptom checker / assistant and isn't asking a platform FAQ, run the triage engine
        if (!isFaqIntent) {
            const turn = await runTriageTurn({
                message: cleanMsg,
                triageState,
                forceVerdict,
                overrideProtocolId,
                patientContext,
                allowLLM: true
            });

            if (turn.type === "system_picker" || turn.type === "question") {
                return res.json({
                    success: true,
                    intent: "triage_question",
                    response: turn.question,
                    quickOptions: turn.quickOptions,
                    understood: turn.understood || null,
                    canSkipToVerdict: turn.canSkipToVerdict,
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: turn.triageState
                });
            }

            // Deliver hydrated clinical verdict
            const verdict = await hydrateClinicalVerdict({
                routeResult: turn.routeResult,
                chiefComplaint: turn.triageState.chiefComplaint,
                collectedFacts: turn.triageState.collectedFacts,
                patientContext
            });

            const summaryText = verdict.isEmergencyBypass
                ? verdict.emergencyBanner
                : verdict.secondarySpeciality
                ? `Based on your symptoms (${verdict.possibleConcernArea.toLowerCase()}), I recommend consulting a ${verdict.primarySpeciality}, and I have also included ${verdict.secondarySpeciality} specialists alongside.`
                : `Based on your symptoms (${verdict.possibleConcernArea.toLowerCase()}), I recommend consulting a ${verdict.primarySpeciality}.`;

            return res.json({
                success: true,
                intent: "triage_verdict",
                response: summaryText,
                understood: turn.understood || null,
                verdict,
                doctors: verdict.primaryDoctors,
                secondaryDoctors: verdict.secondaryDoctors,
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: turn.triageState,
                quickOptions: [
                    "Start a new symptom check",
                    "Check medicine safety",
                    "How do video consultations work?"
                ]
            });
        }

        // 5. Platform FAQ / General Healthcare Assistance via Okapi BM25 RAG
        const relevantDocs = retrieveContext(cleanMsg, 3);
        const contextBlock =
            relevantDocs.length > 0
                ? relevantDocs.map((doc) => `[${doc.category.toUpperCase()}] ${doc.question}\n${doc.content}`).join("\n\n")
                : "";

        let botReply =
            "I can help you check symptoms step-by-step, find the right specialist, screen medications against your allergies, or guide you through booking an appointment. How are you feeling today?";

        if (relevantDocs.length > 0) {
            botReply = relevantDocs[0].content;
        }

        try {
            const model = getTextModel();
            const prompt = `You are VitalSync's Unified Clinical & Platform Assistant.
Patient Context: ${patientContext?.summaryBadge || "Guest"}
Retrieved Platform Info:
${contextBlock || "Standard telemedicine portal with General Physician, Gastroenterologist, Neurologist, Dermatologist, Gynecologist, and Pediatricians."}

User Message: ${cleanMsg}

Respond warmly and concisely in 2-3 plain-text sentences (no markdown asterisks). If they mention any health symptom, invite them to describe it so you can run a quick 2-step clinical check.`;
            const result = await model.generateContent(prompt);
            botReply = result.response.text().replace(/\*\*/g, "").trim();
        } catch {
            // Keep deterministic RAG answer
        }

        return res.json({
            success: true,
            intent: "general_chat",
            response: botReply,
            sourcesUsed: relevantDocs.map((d) => ({
                id: d.id,
                question: d.question,
                category: d.category
            })),
            patientProfileUsed: patientContext?.summaryBadge || null,
            triageState: { active: false, questionCount: 0, chiefComplaint: "", collectedFacts: [] },
            quickOptions: [
                "I have severe hairfall at the top of my head",
                "Pooping right after drinking water daily",
                "Throbbing headache for 2 days",
                "Show available doctors"
            ]
        });
    } catch (error) {
        console.error("Unified Assistant Error:", error.message);
        return res.json({
            success: true,
            intent: "general_chat",
            response:
                "I'm here to help you check symptoms or find the right specialist. Describe how you're feeling or tap one of the quick options below.",
            triageState: { active: false, questionCount: 0, chiefComplaint: "", collectedFacts: [] },
            quickOptions: [
                "I have severe hairfall at the top of my head",
                "Pooping right after drinking water daily",
                "Show General Physician doctors"
            ]
        });
    }
};

/**
 * Legacy Okapi BM25 RAG Chatbot endpoint — kept for backward compatibility
 */
const chatWithBot = async (req, res) => {
    try {
        const { userId, message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.json({ success: false, message: "Please enter a message" });
        }

        const relevantDocs = retrieveContext(message, 3);
        const contextBlock =
            relevantDocs.length > 0
                ? relevantDocs
                      .map(
                          (doc) =>
                              `[${doc.category.toUpperCase()} | BM25=${doc.score.toFixed(2)}] ${doc.question}\n${doc.content}`
                      )
                      .join("\n\n---\n\n")
                : "No specific knowledge base entry found for this query.";

        const { isDoctorQuery, speciality } = detectDoctorQuery(message);
        let matchedDoctors = [];
        let doctorContextBlock = "";

        if (isDoctorQuery) {
            const query = { available: true };
            if (speciality) {
                query.speciality = speciality;
            }
            matchedDoctors = await doctorModel
                .find(query)
                .select("name speciality degree experience fees address image")
                .limit(5)
                .lean();

            if (matchedDoctors.length > 0) {
                doctorContextBlock =
                    `\n\nLIVE STEPPED-CARE MATCHED DOCTORS FROM DATABASE (Recommended Department: ${speciality || "All Available"}):\n` +
                    matchedDoctors
                        .map(
                            (d, i) =>
                                `${i + 1}. ${d.name.startsWith("Dr.") ? d.name : "Dr. " + d.name} — ${d.speciality} | ${d.degree} | ${d.experience} experience | ₹${d.fees} consultation fee`
                        )
                        .join("\n");
            }
        }

        const sessionId = userId || req.headers?.["x-session-id"] || req.body?.sessionId;
        let history = [];
        if (sessionId) {
            if (!conversationHistory.has(sessionId)) {
                conversationHistory.set(sessionId, []);
            }
            history = conversationHistory.get(sessionId);
        }

        const historyBlock =
            history.length > 0 ? history.map((h) => `${h.role}: ${h.text}`).join("\n") : "No previous conversation.";

        const systemPrompt = `You are VitalSync AI Assistant, a clinical triage & navigation chatbot implementing WHO Stepped-Care Primary Care Gatekeeping and MoHFW Telemedicine Guidelines.
RETRIEVED KNOWLEDGE BASE CONTEXT:
${contextBlock}
${doctorContextBlock}
CONVERSATION HISTORY:
${historyBlock}
USER'S CURRENT MESSAGE: ${message}
Respond naturally in plain text as VitalSync AI Assistant:`;

        const model = getTextModel();
        const result = await model.generateContent(systemPrompt);
        const botResponse = result.response.text();

        if (sessionId) {
            history.push({ role: "User", text: message });
            history.push({ role: "Assistant", text: botResponse });
            while (history.length > MAX_HISTORY * 2) {
                history.shift();
            }
        }

        res.json({
            success: true,
            response: botResponse,
            doctors: matchedDoctors,
            retrievalAlgorithm: "Okapi BM25 Sparse Vector Retrieval + Clinical Triage Engine v2",
            sourcesUsed: relevantDocs.map((d) => ({
                id: d.id,
                question: d.question,
                category: d.category,
                relevanceScore: Math.round(d.score * 100) / 100
            }))
        });
    } catch (error) {
        console.log("Chatbot Error:", error.message);
        res.json({
            success: true,
            response: "Our AI service is briefly busy. Please use the Symptom Checker Assistant.",
            doctors: [],
            sourcesUsed: []
        });
    }
};

const clearChatHistory = async (req, res) => {
    try {
        const { userId } = req.body;
        const sessionId = userId || "anonymous";
        conversationHistory.delete(sessionId);
        res.json({ success: true, message: "Chat history cleared" });
    } catch {
        res.json({ success: false, message: "Failed to clear history" });
    }
};

export { chatWithBot, clearChatHistory, assistantTurn };
