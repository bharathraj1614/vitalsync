import mongoose from "mongoose";
import { getTextModel } from "../config/gemini.js";
import { retrieveContext } from "../utils/ragEngine.js";
import doctorModel from "../models/doctorModel.js";
import userModel from "../models/userModel.js";
import { AVAILABLE_SPECIALITIES, evaluateClinicalRules } from "./aiController.js";
import { evaluateSafetyWithAI } from "../data/ddiDatabase.js";
import { runTriageTurn } from "../triage/engine.js";
import { isCancelOrResetCommand } from "../triage/classifier.js";

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
    "azithromycin", "pantoprazole", "omeprazole", "cetirizine", "dolo", "combiflam", "augmentin",
    "ciprofloxacin", "diclofenac", "naproxen", "warfarin", "lisinopril", "atorvastatin"
];

const PLATFORM_FAQ_KEYWORDS = [
    "how do i book", "how to book", "cancel appointment", "cancel booking", "cancel my appointment",
    "refund", "reschedule", "video call", "video consultation", "consultations work", "how does video",
    "join call", "prescription download", "download prescription", "my prescription", "verify prescription",
    "payment", "razorpay", "stripe", "where can i see", "what is vitalsync", "upload report",
    "medical record", "consultation fee", "how much does"
];

const GREETING_REGEX =
    /^(hi|hello|hey|good\s*(morning|afternoon|evening|night)|howdy|greetings|namaste|hola|sup|yo)(\s+there|\s+doctor|\s+dr\.?\s*pulse|\s+bot|\s+assistant)?[!.,?\s]*$/i;

const GRATITUDE_OR_CLOSING_REGEX =
    /^(thanks|thank\s*you|thx|ty|ok|okay|k|cool|great|awesome|got\s*it|understood|alright|bye|goodbye|see\s*ya|nice)(\s+so\s+much|\s+a\s+lot|\s+doctor|\s+dr\.?\s*pulse)?[!.,?\s]*$/i;

const BOT_IDENTITY_REGEX =
    /^(who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|how\s+do\s+you\s+work|what\s+is\s+your\s+name|help|help\s+me)[!.,?\s]*$/i;

const GENERAL_DOCTOR_LOOKUP_PHRASES = [
    "show available doctors",
    "show me doctors",
    "show doctors",
    "find a doctor",
    "find doctors",
    "list doctors",
    "browse doctors",
    "available doctors",
    "all doctors"
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
        const lowerMsg = cleanMsg.toLowerCase();
        const emptyTriageState = { active: false, questionCount: 0, chiefComplaint: "", collectedFacts: [] };

        // 1A. SESSION RESET / CANCELLATION INTENT ("Start a new symptom check", "Check my symptoms instead", "cancel", "reset")
        if (!overrideProtocolId && !forceVerdict && isCancelOrResetCommand(cleanMsg)) {
            if (userId) conversationHistory.delete(userId);
            return res.json({
                success: true,
                intent: "welcome",
                response:
                    "Ready for a fresh symptom check! Tell me what physical symptoms you are experiencing, when they started, and how they feel.",
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: emptyTriageState,
                quickOptions: [
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water happens daily",
                    "Throbbing headache on one side for 2 days",
                    "Itchy skin rash on my arms"
                ]
            });
        }

        // 1B. NAVIGATION & PAGE ACTION INTENT ("Open Medicine Safety Checker page", "View my appointments", "Open my profile")
        if (!overrideProtocolId && !forceVerdict) {
            if (
                lowerMsg.includes("open medicine safety") ||
                lowerMsg.includes("medicine safety checker page") ||
                lowerMsg.includes("open drug checker") ||
                lowerMsg.includes("go to medicine safety")
            ) {
                return res.json({
                    success: true,
                    intent: "navigate",
                    navigateTo: "/drug-checker",
                    actionButton: {
                        label: "Open Medicine Safety Checker",
                        path: "/drug-checker"
                    },
                    response:
                        "You can open our dedicated Medicine Safety & Allergy Checker using the button below, or ask me directly here (for example: 'Is Ibuprofen safe with my profile?').",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "Is Ibuprofen safe with my profile?",
                        "Can I take Paracetamol and Cetirizine together?",
                        "I have severe hairfall at the top of my head"
                    ]
                });
            }

            if (
                lowerMsg === "check medicine safety" ||
                lowerMsg === "medicine safety" ||
                lowerMsg === "drug safety" ||
                lowerMsg === "check drug interactions"
            ) {
                return res.json({
                    success: true,
                    intent: "medicine_guide",
                    actionButton: {
                        label: "Open Medicine Safety Checker",
                        path: "/drug-checker"
                    },
                    response:
                        "I can screen any medication against your recorded allergies and active prescriptions right here. Tell me which medicine you'd like to check (e.g., 'Is Ibuprofen safe with my profile?'), or open our multi-drug checker:",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "Is Ibuprofen safe with my profile?",
                        "Is Amoxicillin safe with my allergies?",
                        "Check my symptoms instead"
                    ]
                });
            }

            if (lowerMsg.includes("view my appointments") || lowerMsg.includes("open my appointments") || lowerMsg === "my appointments") {
                return res.json({
                    success: true,
                    intent: "navigate",
                    navigateTo: "/my-appointments",
                    actionButton: {
                        label: "View My Appointments",
                        path: "/my-appointments"
                    },
                    response: "You can view, manage, or join video consultations for your booked appointments on the My Appointments page:",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "Show available doctors",
                        "I have severe hairfall at the top of my head",
                        "How do video consultations work?"
                    ]
                });
            }

            if (lowerMsg.includes("open my profile") || lowerMsg.includes("edit my profile") || lowerMsg === "my profile") {
                return res.json({
                    success: true,
                    intent: "navigate",
                    navigateTo: "/my-profile",
                    actionButton: {
                        label: "Open My Profile",
                        path: "/my-profile"
                    },
                    response: "You can update your allergies, regular medications, chronic conditions, and emergency contacts on your profile page:",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "Is Ibuprofen safe with my profile?",
                        "I have severe hairfall at the top of my head",
                        "Show available doctors"
                    ]
                });
            }
        }

        // 1C. CONVERSATIONAL GREETINGS, PLEASANTRIES & BOT IDENTITY INTENT
        if (!overrideProtocolId && !forceVerdict) {
            if (GREETING_REGEX.test(cleanMsg)) {
                const firstName = patientContext?.name ? ` ${patientContext.name.split(" ")[0]}` : "";
                return res.json({
                    success: true,
                    intent: "greeting",
                    response: `Hello${firstName}! I'm Dr. Pulse, your VitalSync Clinical Triage & Pharmacology Assistant. Describe your symptoms in your own words (e.g., 'throbbing headache for 2 days'), ask if a medicine is safe with your profile, or browse our specialists.`,
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "I have severe hairfall at the top of my head",
                        "Pooping right after drinking water happens daily",
                        "Throbbing headache on one side for 2 days",
                        "Is Ibuprofen safe with my profile?"
                    ]
                });
            }

            if (GRATITUDE_OR_CLOSING_REGEX.test(cleanMsg)) {
                return res.json({
                    success: true,
                    intent: "closing",
                    response:
                        "You're very welcome! Take care, and reach out anytime you want to check symptoms, screen a medication, or book a specialist.",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "Start a new symptom check",
                        "Show available doctors",
                        "Check medicine safety"
                    ]
                });
            }

            if (BOT_IDENTITY_REGEX.test(cleanMsg)) {
                return res.json({
                    success: true,
                    intent: "bot_identity",
                    response:
                        "I'm Dr. Pulse, VitalSync's AI Clinical Triage & Pharmacology Assistant. I guide you through a focused 2-step clinical check across 30 medical protocols to match the right specialist, screen medications against your allergies and active prescriptions, and help you book appointments.",
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: emptyTriageState,
                    quickOptions: [
                        "I have severe hairfall at the top of my head",
                        "Is Ibuprofen safe with my profile?",
                        "Show available doctors"
                    ]
                });
            }
        }

        // 2. Check if user is asking a Medicine / Drug Allergy Safety question
        const isMedicineSafetyQuery =
            !overrideProtocolId &&
            MEDICINE_INTENT_KEYWORDS.some((kw) => lowerMsg.includes(kw)) &&
            (lowerMsg.includes("safe") ||
                lowerMsg.includes("take") ||
                lowerMsg.includes("interact") ||
                lowerMsg.includes("allerg") ||
                lowerMsg.includes("side effect"));

        if (isMedicineSafetyQuery) {
            const candidateDrugs = [
                "Ibuprofen", "Paracetamol", "Aspirin", "Amoxicillin", "Penicillin",
                "Metformin", "Azithromycin", "Pantoprazole", "Omeprazole", "Cetirizine",
                "Dolo 650", "Combiflam", "Augmentin", "Ciprofloxacin", "Diclofenac",
                "Naproxen", "Warfarin", "Lisinopril", "Atorvastatin"
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
                actionButton: {
                    label: "Open Medicine Safety Checker",
                    path: "/drug-checker"
                },
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: emptyTriageState,
                quickOptions: [
                    "Check my symptoms instead",
                    "Show General Physician doctors",
                    "Open Medicine Safety Checker page"
                ]
            });
        }

        // 3. Check for explicit specialist lookup (e.g. "Show me Dermatologists"), General Doctor Lookup, or FAQ
        const { hasSymptomIntent, explicitSpeciality } = detectDoctorQuery(cleanMsg);
        const isGeneralDoctorLookup =
            !overrideProtocolId &&
            !hasSymptomIntent &&
            GENERAL_DOCTOR_LOOKUP_PHRASES.some((p) => lowerMsg.includes(p));
        const isFaqIntent = !overrideProtocolId && PLATFORM_FAQ_KEYWORDS.some((kw) => lowerMsg.includes(kw));

        if (explicitSpeciality && !hasSymptomIntent && !overrideProtocolId) {
            const docs = await doctorModel
                .find({ speciality: explicitSpeciality, available: true })
                .select("name speciality degree experience fees address image about")
                .limit(5)
                .lean();

            return res.json({
                success: true,
                intent: "doctor_lookup",
                actionButton: {
                    label: `Browse All ${explicitSpeciality} Doctors`,
                    path: `/doctors/${encodeURIComponent(explicitSpeciality)}`
                },
                response:
                    docs.length > 0
                        ? `Here are our available ${explicitSpeciality} specialists. You can book a consultation directly or describe your symptoms for a guided clinical check:`
                        : `We don't have an available ${explicitSpeciality} online right this moment, but you can browse all doctors or describe your symptoms below.`,
                doctors: docs,
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: emptyTriageState,
                quickOptions: [
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water daily",
                    "Show available doctors"
                ]
            });
        }

        if (isGeneralDoctorLookup) {
            const docs = await doctorModel
                .find({ available: true })
                .select("name speciality degree experience fees address image about")
                .limit(6)
                .lean();

            return res.json({
                success: true,
                intent: "doctor_lookup",
                actionButton: {
                    label: "Browse All Doctors by Speciality",
                    path: "/doctors"
                },
                response:
                    docs.length > 0
                        ? "Here are verified specialists currently available on VitalSync. You can book directly with any doctor below, or describe your symptoms so I can match the right department:"
                        : "You can browse our full directory of doctors or describe your symptoms below for a specialist recommendation.",
                doctors: docs,
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: emptyTriageState,
                quickOptions: [
                    "Show General Physician doctors",
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water daily"
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

            if (turn.type === "reset") {
                return res.json({
                    success: true,
                    intent: "welcome",
                    response: turn.question,
                    quickOptions: turn.quickOptions,
                    canSkipToVerdict: false,
                    patientProfileUsed: patientContext?.summaryBadge || null,
                    triageState: turn.triageState
                });
            }

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

            if (turn.type === "verdict") {
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
            // If `turn.type === "non_clinical"`, fall through to Okapi BM25 RAG / conversational guidance below
            // while keeping `triageState` completely clean (`active: false, chiefComplaint: ""`).
        }

        // 5. Platform FAQ / General Healthcare Assistance via Okapi BM25 RAG
        const relevantDocs = retrieveContext(cleanMsg, 3);
        const hasStrongRagMatch = relevantDocs.length > 0 && (isFaqIntent || relevantDocs[0].score >= 1.5);

        if (!hasStrongRagMatch && !isFaqIntent) {
            return res.json({
                success: true,
                intent: "clarify_input",
                response:
                    "Could you describe the physical symptoms you are experiencing (for example: 'throbbing headache for 2 days' or 'itchy rash on my arms'), ask if a medication is safe with your profile, or select one of the options below?",
                patientProfileUsed: patientContext?.summaryBadge || null,
                triageState: emptyTriageState,
                quickOptions: [
                    "I have severe hairfall at the top of my head",
                    "Pooping right after drinking water happens daily",
                    "Throbbing headache on one side for 2 days",
                    "Show available doctors"
                ]
            });
        }

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
            triageState: emptyTriageState,
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
