import { getVisionModel } from "../config/gemini.js";
import doctorModel from "../models/doctorModel.js";
import { BOOKABLE_LIST } from "../triage/specialties.js";
import { evaluateCompatibilityRules, evaluateOneShotTriage } from "../triage/engine.js";
import { polishExplanationWithLLM } from "../triage/llm.js";

// Canonical Outpatient Specialities available in VitalSync Hospital Registry (12 Empanelled Doctors across 6 Departments)
const AVAILABLE_SPECIALITIES = BOOKABLE_LIST;

/**
 * Deterministic Clinical Rule & Protocol Engine (Clinical Triage Engine v2).
 * Evaluates free-text symptoms via word-boundary + compound/typo-tolerant normalization,
 * MoHFW / NICE / SNOOP-4 safety gate, and 26 complaint protocols.
 */
const evaluateClinicalRules = (symptomText = "") => evaluateCompatibilityRules(symptomText);

// API to analyze symptoms and recommend a specialist using Clinical Triage Engine v2
const analyzeSymptoms = async (req, res) => {
    try {
        const { symptoms } = req.body;

        if (!symptoms || symptoms.trim().length === 0) {
            return res.json({ success: false, message: "Please describe your symptoms" });
        }

        const startTime = performance.now();

        // 1. Run deterministic safety gate + protocol classification + routing resolver
        const { protocol, routeResult } = evaluateOneShotTriage(symptoms);

        // 2. Polish explanation text via constrained LLM (validated against chosen specialties)
        const polished = await polishExplanationWithLLM(routeResult, {
            chiefComplaint: symptoms
        });

        const aiResponse = {
            urgencyLevel: polished.urgencyLevel,
            recommendedSpeciality: polished.primarySpeciality,
            secondarySpeciality: polished.secondarySpeciality,
            secondaryReasoning: polished.secondaryReasoning,
            idealSpeciality: polished.idealSpeciality,
            idealNote: polished.idealNote,
            isEmergencyBypass: polished.isEmergencyBypass,
            emergencyBanner: polished.emergencyBanner,
            triageProtocol: polished.isEmergencyBypass
                ? "MoHFW Emergency ER Bypass (108/112)"
                : `Protocol: ${protocol.label}`,
            possibleConcernArea: polished.possibleConcernArea,
            reasoning: polished.primaryReasoning,
            immediateAdvice: polished.immediateAdvice,
            disclaimer:
                "Automated clinical triage under WHO Stepped-Care & MoHFW Telemedicine Guidelines. Not a substitute for in-person medical diagnosis."
        };

        const availableDoctors = await doctorModel
            .find({
                speciality: aiResponse.recommendedSpeciality,
                available: true
            })
            .select("-password -email -privateKey");

        const secondaryDoctors = aiResponse.secondarySpeciality
            ? await doctorModel
                  .find({
                      speciality: aiResponse.secondarySpeciality,
                      available: true
                  })
                  .select("-password -email -privateKey")
            : [];

        const latencyMs = Math.round(performance.now() - startTime);

        res.json({
            success: true,
            analysis: aiResponse,
            algorithm: {
                name: "Clinical Triage Engine v2",
                protocol: aiResponse.triageProtocol,
                redFlagScreening: polished.isEmergencyBypass
                    ? "Emergency Protocol Activated"
                    : "Safety Gate Passed",
                costOptimization: "Protocol-Driven Specialist Routing",
                latencyMs
            },
            availableDoctors,
            secondaryDoctors,
            totalDoctorsFound: availableDoctors.length + secondaryDoctors.length
        });
    } catch (error) {
        console.log("AI Analysis Global Error:", error.message);

        const fallbackDoctors = await doctorModel
            .find({
                speciality: "General physician",
                available: true
            })
            .select("-password -email -privateKey");

        res.json({
            success: true,
            analysis: {
                urgencyLevel: "medium",
                recommendedSpeciality: "General physician",
                isEmergencyBypass: false,
                triageProtocol: "Stepped-Care Primary Care Gatekeeping",
                possibleConcernArea: "General medical consultation",
                reasoning:
                    "Based on primary care stepped-care protocols, an initial consultation with a General physician provides comprehensive vital assessment and cost-effective care.",
                immediateAdvice: "Stay comfortable, drink plenty of water, and consult the physician below.",
                disclaimer: "Automated stepped-care recommendation."
            },
            algorithm: {
                name: "Clinical Triage Engine v2",
                protocol: "Deterministic Rule-Based Fallback",
                costOptimization: "Primary Care First (Cost-Protected)"
            },
            availableDoctors: fallbackDoctors,
            totalDoctorsFound: fallbackDoctors.length
        });
    }
};

// API to summarize a medical report (image/text)
const summarizeReport = async (req, res) => {
    try {
        const { imageUrl, reportText } = req.body;

        if (!imageUrl && !reportText) {
            return res.json({ success: false, message: "Please provide a report image URL or text" });
        }

        const model = getVisionModel();

        const systemPrompt = `You are a medical report analysis AI for a telemedicine platform. Analyze the provided medical report and extract key information.

RESPOND IN THE FOLLOWING JSON FORMAT ONLY (no markdown, no code blocks, just raw JSON):
{
    "reportType": "type of report (e.g., Blood Test, X-Ray, Prescription, etc.)",
    "keyFindings": ["finding 1", "finding 2", "finding 3"],
    "vitalMetrics": {
        "metric_name": "value with unit"
    },
    "medications": ["medication 1", "medication 2"],
    "summary": "2-3 sentence plain language summary of the report for a non-medical person",
    "flaggedValues": ["any abnormal or concerning values"],
    "recommendedFollowUp": "brief follow-up recommendation if applicable"
}

IMPORTANT: If the image is not a medical report, respond with:
{
    "reportType": "Not a medical report",
    "summary": "The uploaded file does not appear to be a medical report. Please upload a valid medical document.",
    "keyFindings": [],
    "vitalMetrics": {},
    "medications": [],
    "flaggedValues": [],
    "recommendedFollowUp": ""
}`;

        let result;

        if (imageUrl) {
            const imageResponse = await fetch(imageUrl);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString("base64");
            const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

            result = await model.generateContent([
                { text: systemPrompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                }
            ]);
        } else {
            result = await model.generateContent([
                { text: systemPrompt },
                { text: `Medical report text:\n${reportText}` }
            ]);
        }

        const responseText = result.response.text();

        let aiSummary;
        try {
            const cleanedResponse = responseText
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
            aiSummary = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.log("Report parsing error:", parseError);
            aiSummary = {
                reportType: "Unknown",
                summary: "Unable to fully parse the report. Please consult your doctor for detailed analysis.",
                keyFindings: [],
                vitalMetrics: {},
                medications: [],
                flaggedValues: [],
                recommendedFollowUp: "Please consult your doctor."
            };
        }

        res.json({
            success: true,
            summary: aiSummary
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Report analysis failed. Please try again." });
    }
};

export { analyzeSymptoms, summarizeReport, evaluateClinicalRules, AVAILABLE_SPECIALITIES };
