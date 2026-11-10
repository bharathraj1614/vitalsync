import { S, opt, NONE_OPTION } from "./_helpers.js";

/** Women's health and child health protocols */
export default [
    {
        id: "period_problems",
        version: 1,
        reviewStatus: "draft",
        label: "Period problems",
        bodySystem: "womens_health",
        organDomain: "gynec",
        synonyms: [
            "irregular periods", "missed period", "late period", "heavy periods", "heavy bleeding during periods", "period pain",
            "painful periods", "pcos", "pcod", "menstrual", "periods", "period", "menopause", "hot flashes", "spotting"
        ],
        route: {
            primary: S.GYNEC,
            secondary: null,
            urgency: "routine",
            reason: "A Gynecologist specialises in menstrual and hormonal problems and can examine and scan you if needed."
        },
        concern: "Menstrual irregularity",
        questions: [
            {
                id: "main",
                slot: "Main concern",
                text: "What is the main problem with your periods?",
                options: [
                    opt("irregular", "Irregular or missed periods", { concern: "Irregular cycles (PCOS / thyroid / pregnancy screen)" }, ["irregular", "missed", "late", "not coming"]),
                    opt("heavy", "Very heavy bleeding (pad every 1–2 hours, or clots)", { urgency: "soon", concern: "Heavy menstrual bleeding (fibroid / anaemia screen)" }, ["heavy", "clots", "soaking"]),
                    opt("painful", "Very painful periods", { concern: "Dysmenorrhoea (endometriosis screen)" }, ["painful", "cramps", "pain"]),
                    opt("abnormal_bleed", "Bleeding between periods, after sex, or after menopause", { urgency: "urgent", concern: "Abnormal uterine bleeding", reason: "Bleeding between periods, after sex or after menopause should be checked by a Gynecologist promptly." }, ["between periods", "after sex", "after menopause", "spotting"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do any of these apply?",
                options: [
                    opt("pregnant", "I could be pregnant", { urgency: "soon", concern: "Possible pregnancy — test advised" }, ["pregnant", "unprotected"]),
                    opt("pcos", "Acne, facial hair or weight gain", { secondary: S.DERM, secondaryReason: "A Dermatologist can co-manage acne or excess hair linked to PCOS.", concern: "PCOS pattern" }, ["acne", "facial hair", "weight gain"]),
                    opt("anaemia", "Dizzy, very tired or breathless", { urgency: "urgent", secondary: S.GP, secondaryReason: "Heavy blood loss can cause anaemia — a General Physician can check your blood count.", reason: "Feeling faint or breathless with heavy periods suggests significant blood loss." }, ["dizzy", "tired", "breathless", "faint"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Track your cycle dates, flow and pain in an app or diary.",
            "A hot water bag and light exercise can ease period cramps.",
            "Eat iron-rich food if your periods are heavy."
        ]
    },
    {
        id: "pregnancy",
        version: 1,
        reviewStatus: "draft",
        label: "Pregnancy care",
        bodySystem: "womens_health",
        organDomain: "gynec",
        synonyms: ["pregnant", "pregnancy", "prenatal", "antenatal", "expecting a baby", "positive pregnancy test", "trying to conceive", "planning pregnancy"],
        route: {
            primary: S.GYNEC,
            secondary: null,
            urgency: "routine",
            reason: "A Gynecologist (obstetrician) should guide your pregnancy care, scans and supplements."
        },
        concern: "Pregnancy care",
        questions: [
            {
                id: "stage",
                slot: "Situation",
                text: "Which best describes your situation?",
                options: [
                    opt("planning", "Planning or just found out I'm pregnant", { concern: "Early pregnancy / pre-conception care" }, ["planning", "just found out", "positive test", "trying"]),
                    opt("routine", "Routine check-up during pregnancy", { concern: "Routine antenatal care" }, ["checkup", "check up", "routine", "scan"]),
                    opt("vomiting", "Severe vomiting, can't keep food down", { urgency: "soon", concern: "Hyperemesis gravidarum screen" }, ["vomiting", "cant eat", "cannot keep"]),
                    opt("preeclampsia", "Swelling of face/hands with headache or blurred vision", { urgency: "urgent", concern: "Pre-eclampsia warning signs", reason: "These can be signs of high blood pressure in pregnancy and need same-day review." }, ["swelling", "blurred vision", "headache"])
                ]
            },
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these right now?",
                options: [
                    opt("bleeding", "Bleeding or leaking fluid", { urgency: "emergency", reason: "Bleeding or leaking fluid in pregnancy needs immediate hospital care." }, ["bleeding", "leaking", "water broke"]),
                    opt("movement", "Baby moving less than usual (after 28 weeks)", { urgency: "emergency", reason: "Reduced baby movements need immediate hospital assessment." }, ["not moving", "moving less", "reduced movement"]),
                    opt("uti", "Burning urine or fever", { urgency: "urgent", concern: "Infection in pregnancy" }, ["burning", "fever"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Take folic acid daily (and iron/calcium as advised by your doctor).",
            "Avoid self-medicating — check every medicine with your doctor first.",
            "Keep your antenatal card and scan reports handy for your consultation."
        ]
    },
    {
        id: "vaginal_symptoms",
        version: 1,
        reviewStatus: "draft",
        label: "Vaginal discharge / itching",
        bodySystem: "womens_health",
        organDomain: "gynec",
        synonyms: ["vaginal discharge", "white discharge", "vaginal itching", "safed pani", "leucorrhea", "leucorrhoea", "vaginal odour", "vaginal odor", "itching down there", "private part itching"],
        route: {
            primary: S.GYNEC,
            secondary: null,
            urgency: "routine",
            reason: "A Gynecologist can examine you and test the discharge to give the right treatment."
        },
        concern: "Vaginal infection screen",
        questions: [
            {
                id: "type",
                slot: "Discharge type",
                text: "What is the discharge like?",
                options: [
                    opt("yeast", "Thick, white and itchy (curd-like)", { concern: "Vaginal yeast infection (candidiasis)" }, ["thick", "white", "curd", "itchy"]),
                    opt("bv", "Grey or thin with a fishy smell", { concern: "Bacterial vaginosis" }, ["grey", "fishy", "smell", "odour"]),
                    opt("sti", "Yellow-green, frothy, or with pain during sex", { urgency: "soon", concern: "Possible sexually transmitted infection" }, ["yellow", "green", "frothy", "pain during sex"]),
                    opt("normal_more", "Normal-looking but more than usual", { concern: "Physiological discharge" }, ["normal", "more than usual", "clear"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do any of these apply?",
                options: [
                    opt("pid", "Fever or lower belly pain", { urgency: "urgent", concern: "Pelvic inflammatory disease screen", reason: "Discharge with fever or pelvic pain needs same-day assessment." }, ["fever", "lower belly", "pelvic pain"]),
                    opt("pregnant", "I am pregnant", { urgency: "soon" }, ["pregnant"]),
                    opt("diabetes_abx", "I have diabetes or recently took antibiotics", { concern: "Yeast infection risk factors present" }, ["diabetes", "antibiotics"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Wear loose cotton underwear and avoid scented washes or douching.",
            "Avoid self-treating with over-the-counter creams more than once without a check-up.",
            "Your partner may also need treatment if an infection is confirmed."
        ]
    },
    {
        id: "child_illness",
        version: 1,
        reviewStatus: "draft",
        label: "Child health concern",
        bodySystem: "child",
        organDomain: "pediatric",
        synonyms: ["my child", "my baby", "my son", "my daughter", "my kid", "infant", "toddler", "newborn", "baby has"],
        route: {
            primary: S.PEDS,
            secondary: null,
            urgency: "routine",
            reason: "A Pediatrician is trained in children's illnesses, medicine doses and growth."
        },
        concern: "Child health concern",
        questions: [
            {
                id: "main",
                slot: "Main symptom",
                text: "What is the main problem with your child?",
                options: [
                    opt("fever", "Fever", { concern: "Fever in a child" }, ["fever", "temperature", "bukhar"]),
                    opt("respiratory", "Cough, cold or noisy breathing", { concern: "Respiratory infection in a child" }, ["cough", "cold", "breathing"]),
                    opt("gi", "Vomiting, loose motions, or not feeding", { concern: "Gastroenteritis / feeding problem in a child" }, ["vomiting", "loose", "not feeding", "not eating"]),
                    opt("skin", "Rash or skin problem", { secondary: S.DERM, secondaryReason: "A Dermatologist can help if the skin problem persists.", concern: "Skin rash in a child" }, ["rash", "skin", "itching"])
                ]
            },
            {
                id: "danger",
                slot: "Danger signs",
                text: "Does your child have any of these?",
                options: [
                    opt("infant", "Under 3 months old with fever", { urgency: "urgent", reason: "Any fever in a baby under 3 months needs same-day medical review." }, ["under 3 months", "newborn", "2 months", "1 month"]),
                    opt("dehydrated", "Very sleepy, not drinking, or very few wet nappies", { urgency: "urgent", reason: "These are signs of dehydration or serious illness in a child." }, ["sleepy", "not drinking", "no urine", "dry nappies"]),
                    opt("breathing", "Fast breathing or chest pulling in", { urgency: "emergency", reason: "Fast breathing or chest in-drawing is a danger sign in children." }, ["fast breathing", "chest pulling", "struggling to breathe"]),
                    opt("well", "None — active and drinking well", { concern: undefined }, ["active", "playing", "drinking well", "none"])
                ]
            }
        ],
        selfCare: [
            "Keep your child well hydrated with breast milk, water or ORS.",
            "Use paracetamol syrup dosed by your child's weight — never adult tablets.",
            "Note temperature readings, feeds and wet nappies for the doctor."
        ]
    }
];
