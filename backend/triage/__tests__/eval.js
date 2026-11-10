/**
 * Clinical Triage Engine v2 — Vignette Evaluation Harness (Semigran BMJ 2015 methodology).
 *
 * Verifies:
 *   1. Protocol library schema integrity (0 authoring errors).
 *   2. 100% emergency red-flag sensitivity (0% under-triage on emergencies).
 *   3. Negation safety ("no chest pain", "without blood in stool" do NOT trigger red flags).
 *   4. 155 patient vignettes (including typos, compound words like "hairfall", Hinglish,
 *      pediatric & gynecological routing, dual-specialist routing, and discriminating Q&A).
 */
import { validateProtocols, ALL_PROTOCOLS } from "../protocols/index.js";
import { evaluateOneShotTriage, runTriageTurn } from "../engine.js";
import { BOOKABLE_SPECIALTIES as S } from "../specialties.js";

const VIGNETTES = [
    // =========================================================================
    // 1. EMERGENCY RED FLAGS (25 vignettes — Target: 100% emergency bypass)
    // =========================================================================
    { text: "crushing chest pain radiating to left arm and sweating", expectEmergency: true, expectPrimary: S.GP },
    { text: "severe chest pressure and shortness of breath", expectEmergency: true, expectPrimary: S.GP },
    { text: "chest tightness radiating to jaw", expectEmergency: true, expectPrimary: S.GP },
    { text: "seene me dard with sweating and breathless", expectEmergency: true, expectPrimary: S.GP },
    { text: "I think I am having a heart attack", expectEmergency: true, expectPrimary: S.GP },
    { text: "my father has facial droop and slurred speech", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "sudden weakness on one side of body", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "numbness on one side and cant speak properly", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "sudden loss of vision in one eye", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "signs of stroke face drooping", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "worst headache of my life thunderclap headache", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "he is having seizures and convulsions right now", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "patient is unconscious and not waking up", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "high fever and stiff neck with fever and sudden confusion", expectEmergency: true, expectPrimary: S.NEURO },
    { text: "I cannot breathe my throat is closing up", expectEmergency: true, expectPrimary: S.GP },
    { text: "severe anaphylaxis tongue swelling struggling to breathe", expectEmergency: true, expectPrimary: S.GP },
    { text: "lips turning blue and gasping for air", expectEmergency: true, expectPrimary: S.GP },
    { text: "vomiting blood since morning", expectEmergency: true, expectPrimary: S.GASTRO },
    { text: "passing black tarry stool and dizzy", expectEmergency: true, expectPrimary: S.GASTRO },
    { text: "coughing up blood heavily", expectEmergency: true, expectPrimary: S.GASTRO },
    { text: "heavy bleeding that wont stop", expectEmergency: true, expectPrimary: S.GASTRO },
    { text: "I am 7 months pregnant and having heavy bleeding and severe pain", expectEmergency: true, expectPrimary: S.GYNEC },
    { text: "pregnant 32 weeks and baby not moving at all", expectEmergency: true, expectPrimary: S.GYNEC },
    { text: "I want to end my life and feel suicidal", expectEmergency: true, expectPrimary: S.GP },
    { text: "having thoughts to hurt myself no reason to live", expectEmergency: true, expectPrimary: S.GP },

    // =========================================================================
    // 2. SKIN, HAIR & NAILS — DERMATOLOGIST (25 vignettes)
    // =========================================================================
    { text: "I have severe hairfall at the top of my head", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "hair fall and thinning hair on crown", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "severe hair loss and receding hairline", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "mere baal gir rahe hai bahut zyada", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "round bald patch on my scalp", expectPrimary: S.DERM, expectProtocol: "hair_loss", expectUrgency: "soon" },
    { text: "alopecia patches on head", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "hair shedding all over on my pillow and comb", expectPrimary: S.DERM, expectSecondary: S.GP, expectProtocol: "hair_loss" },
    { text: "hairfall with itchy scalp and dandruff", expectPrimary: S.DERM, expectProtocol: "hair_loss" },
    { text: "hairfall with tiredness and weight gain", answers: { associated: "systemic" }, expectPrimary: S.DERM, expectSecondary: S.GP, expectProtocol: "hair_loss" },
    { text: "hair thinning with irregular periods and facial hair", answers: { associated: "hormonal" }, expectPrimary: S.DERM, expectSecondary: S.GYNEC, expectProtocol: "hair_loss" },
    { text: "painful cystic acne on cheeks leaving scars", expectPrimary: S.DERM, expectProtocol: "acne", expectUrgency: "soon" },
    { text: "many pimples and breakouts on my face and back", expectPrimary: S.DERM, expectProtocol: "acne" },
    { text: "chehre par daane aur muhase ho gaye", expectPrimary: S.DERM, expectProtocol: "acne" },
    { text: "acne with irregular periods and pcos", answers: { associated: "hormonal" }, expectPrimary: S.DERM, expectSecondary: S.GYNEC, expectProtocol: "acne" },
    { text: "itchy red rash on my arms and hives", expectPrimary: S.DERM, expectProtocol: "skin_rash_itch" },
    { text: "dry scaly eczema patches on elbows", expectPrimary: S.DERM, expectProtocol: "skin_rash_itch" },
    { text: "psoriasis plaques on skin and khujli", expectPrimary: S.DERM, expectProtocol: "skin_rash_itch" },
    { text: "urticaria raised itchy welts that come and go", expectPrimary: S.DERM, expectProtocol: "skin_rash_itch" },
    { text: "dark patches and melasma on cheeks and forehead", expectPrimary: S.DERM, expectProtocol: "pigmentation" },
    { text: "white patches on skin vitiligo safed daag", expectPrimary: S.DERM, expectProtocol: "pigmentation", expectUrgency: "soon" },
    { text: "a mole that is changing and bleeding", expectPrimary: S.DERM, expectProtocol: "pigmentation", expectUrgency: "urgent" },
    { text: "ringworm fungal infection in groin and thigh", expectPrimary: S.DERM, expectProtocol: "fungal_infection" },
    { text: "yellow thick crumbling nail fungus", expectPrimary: S.DERM, expectProtocol: "fungal_infection" },
    { text: "daad aur groin itch keeps coming back", expectPrimary: S.DERM, expectProtocol: "fungal_infection" },
    { text: "athletes foot fungal infection between toes", expectPrimary: S.DERM, expectProtocol: "fungal_infection" },

    // =========================================================================
    // 3. DIGESTIVE / GI — GP + GASTROENTEROLOGIST (25 vignettes)
    // =========================================================================
    { text: "pooping just after dring water happens daily", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "bowel_after_meals" },
    { text: "urge to pass stool right after eating every meal", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "bowel_after_meals" },
    { text: "have to go to toilet right after eating", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "bowel_after_meals" },
    { text: "poop after drinking water with greasy floating stool", answers: { stool: "greasy" }, expectPrimary: S.GASTRO, expectSecondary: S.GP, expectProtocol: "bowel_after_meals" },
    { text: "stomach acidity and heartburn after spicy meals", expectPrimary: S.GP, expectProtocol: "acidity_reflux" },
    { text: "acid reflux most days for 2 weeks", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "acidity_reflux" },
    { text: "acidity not helping despite pantoprazole for weeks", expectPrimary: S.GASTRO, expectSecondary: S.GP, expectProtocol: "acidity_reflux" },
    { text: "khatti dakar and gas trouble after eating", expectPrimary: S.GP, expectProtocol: "acidity_reflux" },
    { text: "acidity with difficulty swallowing food getting stuck", expectPrimary: S.GASTRO, expectSecondary: S.GP, expectUrgency: "urgent" },
    { text: "mild stomach pain since morning", expectPrimary: S.GP, expectProtocol: "abdominal_pain" },
    { text: "severe pain in lower right side of stomach", expectPrimary: S.GP, expectProtocol: "abdominal_pain", expectUrgency: "urgent" },
    { text: "pet me dard coming and going after meals", answers: { pattern: "recurring_meals" }, expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "abdominal_pain" },
    { text: "loose motions since yesterday", expectPrimary: S.GP, expectProtocol: "diarrhea" },
    { text: "watery stools and diarrhea for more than 2 weeks", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "diarrhea" },
    { text: "loose stools with blood in stool", expectPrimary: S.GASTRO, expectSecondary: S.GP, expectUrgency: "urgent" },
    { text: "dast aur loose motion since morning", expectPrimary: S.GP, expectProtocol: "diarrhea" },
    { text: "constipation and hard stools for a few days", expectPrimary: S.GP, expectProtocol: "constipation" },
    { text: "chronic constipation for several months", expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "constipation" },
    { text: "kabz with blood on stool and piles pain", answers: { associated: "blood_pain" }, expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "constipation" },
    { text: "nausea and vomiting after outside food today", expectPrimary: S.GP, expectProtocol: "nausea_vomiting" },
    { text: "ulti and nausea ongoing for 2 weeks", answers: { context: "ongoing" }, expectPrimary: S.GP, expectSecondary: S.GASTRO, expectProtocol: "nausea_vomiting" },
    { text: "nausea and missed period could be pregnant", answers: { context: "pregnancy" }, expectPrimary: S.GYNEC, expectSecondary: S.GP, expectProtocol: "nausea_vomiting" },
    { text: "yellow eyes and jaundice since 3 days", expectPrimary: S.GASTRO, expectUrgency: "urgent" },
    { text: "rectal bleeding and blood in poop", expectPrimary: S.GASTRO, expectUrgency: "urgent" },
    { text: "no blood in stool just mild indigestion after spicy meal", expectPrimary: S.GP, expectEmergency: false, expectProtocol: "acidity_reflux" },

    // =========================================================================
    // 4. HEAD, NERVES & BALANCE — GP + NEUROLOGIST (18 vignettes)
    // =========================================================================
    { text: "throbbing headache on one side with light sensitivity", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "headache" },
    { text: "mild tension headache from screen strain", expectPrimary: S.GP, expectProtocol: "headache" },
    { text: "headche and sar dard since yesterday", expectPrimary: S.GP, expectProtocol: "headache" },
    { text: "new headache getting worse every day and worse on waking", expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "headache", expectUrgency: "urgent" },
    { text: "severe headache around eye with watering in bouts", expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "headache" },
    { text: "daily headache taking painkillers most days", answers: { frequency: "chronic" }, expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "headache" },
    { text: "dizziness and room spinning when turning my head", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "dizziness" },
    { text: "lightheaded when I stand up", expectPrimary: S.GP, expectProtocol: "dizziness" },
    { text: "chakkar aana and unsteady walking losing balance", answers: { type: "unsteady" }, expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "dizziness" },
    { text: "vertigo and giddiness since 2 days", expectPrimary: S.GP, expectProtocol: "dizziness" },
    { text: "numbness and tingling in both feet gradually", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "numbness_tingling" },
    { text: "pins and needles in hand and fingers worse at night", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "numbness_tingling" },
    { text: "jhunjhuni in feet with weakness and dropping things", answers: { associated: "weakness" }, expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "numbness_tingling" },
    { text: "burning feet and nerve pain in legs", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "numbness_tingling" },
    { text: "headache for 2 days, no slurred speech, no facial droop", expectPrimary: S.GP, expectEmergency: false, expectProtocol: "headache" },
    { text: "migraine on one side without vision loss", expectPrimary: S.GP, expectSecondary: S.NEURO, expectEmergency: false, expectProtocol: "headache" },
    { text: "shaking hands and tremor for months", expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "generic_neuro" },
    { text: "memory problems getting forgetful", answers: { alarm: "memory" }, expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "generic_neuro" },

    // =========================================================================
    // 5. WOMEN'S HEALTH & PEDIATRICS (22 vignettes)
    // =========================================================================
    { text: "irregular periods and missed period for 2 months", expectPrimary: S.GYNEC, expectProtocol: "period_problems" },
    { text: "pcos with irregular periods and acne", answers: { associated: "pcos" }, expectPrimary: S.GYNEC, expectSecondary: S.DERM, expectProtocol: "period_problems" },
    { text: "heavy bleeding during periods with clots", expectPrimary: S.GYNEC, expectProtocol: "period_problems", expectUrgency: "soon" },
    { text: "very painful periods and cramps", expectPrimary: S.GYNEC, expectProtocol: "period_problems" },
    { text: "bleeding between periods and after sex", expectPrimary: S.GYNEC, expectProtocol: "period_problems", expectUrgency: "urgent" },
    { text: "heavy periods making me dizzy and breathless", answers: { associated: "anaemia" }, expectPrimary: S.GYNEC, expectSecondary: S.GP, expectProtocol: "period_problems", expectUrgency: "urgent" },
    { text: "just found out I am pregnant positive pregnancy test", expectPrimary: S.GYNEC, expectProtocol: "pregnancy" },
    { text: "routine antenatal pregnancy checkup", expectPrimary: S.GYNEC, expectProtocol: "pregnancy" },
    { text: "pregnant with swelling of face and blurred vision", answers: { stage: "preeclampsia" }, expectPrimary: S.GYNEC, expectProtocol: "pregnancy", expectUrgency: "urgent" },
    { text: "trying to conceive planning pregnancy", expectPrimary: S.GYNEC, expectProtocol: "pregnancy" },
    { text: "thick white vaginal discharge and vaginal itching", expectPrimary: S.GYNEC, expectProtocol: "vaginal_symptoms" },
    { text: "safed pani discharge with fishy smell", expectPrimary: S.GYNEC, expectProtocol: "vaginal_symptoms" },
    { text: "vaginal discharge with fever and pelvic pain", answers: { associated: "pid" }, expectPrimary: S.GYNEC, expectProtocol: "vaginal_symptoms", expectUrgency: "urgent" },
    { text: "my 4 year old son has fever since yesterday", expectPrimary: S.PEDS },
    { text: "my baby has cough and cold", expectPrimary: S.PEDS },
    { text: "my toddler has loose motions and not eating", expectPrimary: S.PEDS },
    { text: "infant 2 months old with fever", answers: { danger: "infant" }, expectPrimary: S.PEDS, expectUrgency: "urgent" },
    { text: "my child has itchy skin rash on arms", expectPrimary: S.PEDS, expectSecondary: S.DERM },
    { text: "my 6 year old daughter has stomach pain", expectPrimary: S.PEDS },
    { text: "newborn baby not feeding well", expectPrimary: S.PEDS },
    { text: "headache for 2 days", patientContext: { age: 10, gender: "Male" }, expectPrimary: S.PEDS },
    { text: "loose motion since morning", patientContext: { age: 8, gender: "Female" }, expectPrimary: S.PEDS },

    // =========================================================================
    // 6. GENERAL MEDICINE, RESPIRATORY, MSK, URINARY, MENTAL WELLBEING (40 vignettes)
    // =========================================================================
    { text: "fever and chills since yesterday", expectPrimary: S.GP, expectProtocol: "fever" },
    { text: "bukhar and high temperature for 4 days", expectPrimary: S.GP, expectProtocol: "fever", expectUrgency: "soon" },
    { text: "feaver for more than 5 days", answers: { duration: "long" }, expectPrimary: S.GP, expectProtocol: "fever", expectUrgency: "urgent" },
    { text: "fever with rash and bleeding gums and severe body ache", expectPrimary: S.GP, expectProtocol: "fever", expectUrgency: "urgent" },
    { text: "fever Comes and goes with shivering", expectPrimary: S.GP, expectProtocol: "fever", expectUrgency: "soon" },
    { text: "cough and sore throat for 3 days", expectPrimary: S.GP, expectProtocol: "cough_cold" },
    { text: "khansi aur zukam gala kharab", expectPrimary: S.GP, expectProtocol: "cough_cold" },
    { text: "cough for more than 3 weeks", expectPrimary: S.GP, expectProtocol: "cough_cold", expectUrgency: "soon" },
    { text: "cough with blood in phlegm and night sweats", expectPrimary: S.GP, expectProtocol: "cough_cold", expectUrgency: "urgent" },
    { text: "cough with wheezing and breathless", expectPrimary: S.GP, expectProtocol: "cough_cold", expectUrgency: "soon" },
    { text: "runny nose and sneezing every morning with itchy eyes", expectPrimary: S.GP, expectProtocol: "cough_cold" },
    { text: "feeling tired and exhausted all the time", expectPrimary: S.GP, expectProtocol: "fatigue" },
    { text: "kamzori aur thakan for 2 weeks", expectPrimary: S.GP, expectProtocol: "fatigue" },
    { text: "fatigue with pale skin and heavy periods", patientContext: { age: 29, gender: "Female" }, expectPrimary: S.GP, expectSecondary: S.GYNEC, expectProtocol: "fatigue" },
    { text: "tiredness with unexplained weight loss", expectPrimary: S.GP, expectProtocol: "fatigue", expectUrgency: "urgent" },
    { text: "knee joint pain worse with walking stairs", expectPrimary: S.GP, expectProtocol: "joint_body_pain" },
    { text: "jodo me dard and swollen joints with morning stiffness", expectPrimary: S.GP, expectProtocol: "joint_body_pain", expectUrgency: "soon" },
    { text: "joint pain with psoriasis scaly skin", answers: { alarm: "psoriasis" }, expectPrimary: S.GP, expectSecondary: S.DERM, expectProtocol: "joint_body_pain" },
    { text: "knee joint is hot red and very swollen", answers: { alarm: "hot_joint" }, expectPrimary: S.GP, expectProtocol: "joint_body_pain", expectUrgency: "urgent" },
    { text: "shoulder pain after gym workout", expectPrimary: S.GP, expectProtocol: "joint_body_pain" },
    { text: "lower back pain after lifting heavy box", expectPrimary: S.GP, expectProtocol: "back_neck_pain" },
    { text: "kamar dard shooting down my leg with sciatica", expectPrimary: S.GP, expectSecondary: S.NEURO, expectProtocol: "back_neck_pain" },
    { text: "back pain with leg weakness and foot drop", answers: { alarm: "weakness" }, expectPrimary: S.NEURO, expectSecondary: S.GP, expectProtocol: "back_neck_pain", expectUrgency: "urgent" },
    { text: "neck pain from long hours at laptop", expectPrimary: S.GP, expectProtocol: "back_neck_pain" },
    { text: "back pain with loss of bladder control", answers: { alarm: "cauda" }, expectEmergency: true, expectProtocol: "back_neck_pain" },
    { text: "anxiety and panic attacks with racing heart", expectPrimary: S.GP, expectProtocol: "mental_wellbeing" },
    { text: "insomnia and trouble sleeping at night", expectPrimary: S.GP, expectProtocol: "mental_wellbeing" },
    { text: "feeling depressed and low mood for 3 weeks", expectPrimary: S.GP, expectProtocol: "mental_wellbeing", expectUrgency: "soon" },
    { text: "overthinking and stressed at work", expectPrimary: S.GP, expectProtocol: "mental_wellbeing" },
    { text: "burning urination and painful urination", expectPrimary: S.GP, expectProtocol: "urinary", expectUrgency: "soon" },
    { text: "peshab me jalan and uti symptoms", expectPrimary: S.GP, expectProtocol: "urinary" },
    { text: "blood in urine since morning", expectPrimary: S.GP, expectProtocol: "urinary", expectUrgency: "urgent" },
    { text: "burning urine with fever and chills and back pain", answers: { associated: "kidney" }, expectPrimary: S.GP, expectProtocol: "urinary", expectUrgency: "urgent" },
    { text: "burning urination and I am pregnant", answers: { associated: "pregnant" }, expectPrimary: S.GYNEC, expectSecondary: S.GP, expectProtocol: "urinary" },
    { text: "frequent urination and feeling very thirsty", expectPrimary: S.GP, expectProtocol: "urinary" },
    { text: "gaining weight with tiredness and feeling cold", expectPrimary: S.GP, expectProtocol: "weight_change" },
    { text: "losing weight without trying", expectPrimary: S.GP, expectProtocol: "weight_change", expectUrgency: "urgent" },
    { text: "weight gain with irregular periods and facial hair", expectPrimary: S.GP, expectSecondary: S.GYNEC, expectProtocol: "weight_change" },
    { text: "fainted and blacked out briefly this morning", expectPrimary: S.GP, expectUrgency: "urgent" },
    { text: "no chest pain, no shortness of breath, just a mild cold", expectPrimary: S.GP, expectEmergency: false, expectProtocol: "cough_cold" }
];

async function runEvaluation() {
    console.log("====================================================================");
    console.log("  CLINICAL TRIAGE ENGINE v2 — VIGNETTE EVALUATION SUITE");
    console.log("====================================================================\n");

    // 1. Validate protocol schemas
    const schemaErrors = validateProtocols();
    console.log(`[1] Protocol Library Schema Check (${ALL_PROTOCOLS.length} protocols):`);
    if (schemaErrors.length > 0) {
        console.error("  ❌ Schema errors:", schemaErrors);
        process.exit(1);
    }
    console.log("  ✅ 0 schema errors across all protocols.\n");

    // 2. Multi-turn regression test on the exact hair-fall conversation
    console.log("[2] Multi-Turn Regression Check ('I have severe hairfall at the top of my head'):");
    const turn1 = await runTriageTurn({
        message: "I have severe hairfall at the top of my head",
        allowLLM: false
    });
    const turn1Passed =
        turn1.type === "question" &&
        turn1.triageState.protocolId === "hair_loss" &&
        turn1.triageState.answers.pattern === "crown_thinning" &&
        turn1.triageState.currentQuestionId === "associated";

    const turn2 = await runTriageTurn({
        message: "None of these",
        triageState: turn1.triageState,
        allowLLM: false
    });
    const turn2Passed =
        turn2.type === "verdict" &&
        turn2.routeResult.primarySpeciality === S.DERM &&
        turn2.routeResult.possibleConcernArea.toLowerCase().includes("androgenetic");

    if (!turn1Passed || !turn2Passed) {
        console.error("  ❌ Hairfall multi-turn regression failed:", { turn1, turn2 });
        process.exit(1);
    }
    console.log("  ✅ Turn 1 matched 'hair_loss', pre-filled 'Thinning on top/crown', skipped Q1, and asked Q2 ('Possible triggers').");
    console.log(`  ✅ Turn 2 routed to Primary: ${turn2.routeResult.primarySpeciality} (${turn2.routeResult.possibleConcernArea}).\n`);

    // 3. Unknown symptom check — must NOT silently default to GP on Turn 1
    console.log("[3] Unknown Complaint Safety Check (No silent GP fallback):");
    const unknownTurn = await runTriageTurn({
        message: "I feel something strange in my body",
        allowLLM: false
    });
    if (unknownTurn.type !== "system_picker") {
        console.error("  ❌ Expected system_picker for ambiguous complaint, got:", unknownTurn.type);
        process.exit(1);
    }
    console.log("  ✅ Ambiguous complaint prompted body-system picker instead of silent GP default.\n");

    // 3B. Non-Symptom / Action Pill / Greeting Contamination Guard Check
    console.log("[3B] Non-Symptom & Navigation Action Guard Check (Zero Chief Complaint Contamination):");
    const nonSymptomInputs = [
        "Open Medicine Safety Checker page",
        "Check medicine safety",
        "Show General Physician doctors",
        "Show available doctors",
        "How do video consultations work?",
        "Hi",
        "Hello Dr Pulse",
        "Thank you",
        "Who are you?"
    ];
    for (const msg of nonSymptomInputs) {
        const resTurn = await runTriageTurn({ message: msg, allowLLM: false });
        if (resTurn.type !== "non_clinical" || resTurn.triageState.active || resTurn.triageState.chiefComplaint !== "") {
            console.error(`  ❌ Non-symptom input "${msg}" contaminated triage state:`, resTurn);
            process.exit(1);
        }
    }
    const resetTurn = await runTriageTurn({
        message: "Start a new symptom check",
        triageState: turn1.triageState,
        allowLLM: false
    });
    if (resetTurn.type !== "reset" || resetTurn.triageState.active || resetTurn.triageState.chiefComplaint !== "") {
        console.error("  ❌ Reset command failed to clear active triage state:", resetTurn);
        process.exit(1);
    }
    console.log(`  ✅ All ${nonSymptomInputs.length + 1} navigation pills, greetings, and reset commands blocked from polluting chiefComplaint.\n`);

    // 4. Run all 155 clinical vignettes
    let passed = 0;
    let failed = 0;
    let emergencyTotal = 0;
    let emergencyCaught = 0;
    const failures = [];

    for (const [idx, v] of VIGNETTES.entries()) {
        const res = evaluateOneShotTriage(v.text, {
            answers: v.answers || {},
            patientContext: v.patientContext || null
        });
        const r = res.routeResult;

        if (v.expectEmergency === true) emergencyTotal++;

        const checks = [];
        if (v.expectEmergency !== undefined && Boolean(r.isEmergencyBypass) !== v.expectEmergency) {
            checks.push(`emergency expected=${v.expectEmergency} actual=${r.isEmergencyBypass}`);
        } else if (v.expectEmergency === true && r.isEmergencyBypass) {
            emergencyCaught++;
        }

        if (v.expectPrimary && r.primarySpeciality !== v.expectPrimary) {
            checks.push(`primary expected="${v.expectPrimary}" actual="${r.primarySpeciality}"`);
        }
        if (v.expectSecondary !== undefined && r.secondarySpeciality !== v.expectSecondary) {
            checks.push(`secondary expected="${v.expectSecondary}" actual="${r.secondarySpeciality}"`);
        }
        if (v.expectProtocol && res.protocol.id !== v.expectProtocol) {
            checks.push(`protocol expected="${v.expectProtocol}" actual="${res.protocol.id}"`);
        }
        if (v.expectUrgency && r.urgency !== v.expectUrgency) {
            checks.push(`urgency expected="${v.expectUrgency}" actual="${r.urgency}"`);
        }

        if (checks.length === 0) {
            passed++;
        } else {
            failed++;
            failures.push({ index: idx + 1, text: v.text, checks });
        }
    }

    const accuracy = ((passed / VIGNETTES.length) * 100).toFixed(1);
    const emergencySensitivity = ((emergencyCaught / emergencyTotal) * 100).toFixed(1);

    console.log(`[4] Vignette Benchmark Results (${VIGNETTES.length} vignettes):`);
    console.log(`  • Total Vignettes Tested     : ${VIGNETTES.length}`);
    console.log(`  • Primary Routing Accuracy   : ${passed}/${VIGNETTES.length} (${accuracy}%)`);
    console.log(`  • Red-Flag Emergency Recall  : ${emergencyCaught}/${emergencyTotal} (${emergencySensitivity}%) — Under-triage: ${emergencyTotal - emergencyCaught}`);

    if (failures.length > 0) {
        console.error("\n  ❌ Failed vignettes:");
        for (const f of failures) {
            console.error(`    #${f.index} "${f.text}" -> ${f.checks.join("; ")}`);
        }
        process.exit(1);
    }

    console.log("\n====================================================================");
    console.log("  ALL CHECKS PASSED (100% Red-Flag Recall, 100% Vignette Accuracy)");
    console.log("====================================================================");
}

runEvaluation();
