import { S, I, opt, NONE_OPTION } from "./_helpers.js";

/** General medicine protocols (fever, respiratory, musculoskeletal, mental wellbeing, urinary, metabolic) */
export default [
    {
        id: "fever",
        version: 1,
        reviewStatus: "draft",
        label: "Fever",
        bodySystem: "general",
        organDomain: "general",
        synonyms: ["fever", "feaver", "fevar", "bukhar", "high temperature", "temperature", "feverish", "chills", "shivering"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can examine you, find the source of the fever and order tests such as dengue, malaria or typhoid if needed."
        },
        concern: "Fever — likely viral; source to be confirmed",
        questions: [
            {
                id: "duration",
                slot: "Duration",
                text: "How long have you had the fever?",
                options: [
                    opt("short", "1–2 days", { concern: "Short fever (likely viral)" }, ["1 day", "2 days", "today", "yesterday", "since morning"]),
                    opt("mid", "3–5 days", { urgency: "soon", concern: "Fever beyond 3 days (blood tests advised)" }, ["3 days", "4 days", "5 days"]),
                    opt("long", "More than 5 days", { urgency: "urgent", concern: "Prolonged fever (typhoid / dengue / malaria / TB screen)", reason: "Fever lasting more than 5 days needs blood tests and examination without delay." }, ["week", "6 days", "7 days", "10 days", "long"]),
                    opt("intermittent", "Comes and goes with shivering", { urgency: "soon", concern: "Intermittent fever with chills (malaria screen)" }, ["comes and goes", "shivering", "rigors", "chills"])
                ]
            },
            {
                id: "associated",
                slot: "Associated symptoms",
                text: "Do you have any of these with the fever?",
                options: [
                    opt("dengue", "Rash, bleeding gums, or severe body / eye pain", { urgency: "urgent", concern: "Dengue warning signs", reason: "These can be dengue warning signs and need same-day blood counts." }, ["rash", "bleeding gums", "eye pain", "body pain", "severe body ache"]),
                    opt("urinary", "Burning urine or back / side pain", { urgency: "soon", concern: "Urinary tract / kidney infection screen" }, ["burning urine", "urine", "back pain", "side pain"]),
                    opt("breathless", "Cough with breathlessness", { urgency: "urgent", ideal: I.PULMO, concern: "Chest infection / pneumonia screen", reason: "Fever with breathlessness needs a same-day chest examination." }, ["breathless", "breathing", "shortness of breath"]),
                    opt("cold_only", "Only a mild cold or sore throat", { concern: "Viral upper respiratory infection" }, ["cold", "sore throat", "runny nose"])
                ]
            }
        ],
        selfCare: [
            "Rest, drink plenty of fluids, and take paracetamol for fever if you are not allergic.",
            "Avoid ibuprofen or aspirin until dengue has been ruled out.",
            "Check your temperature every 6 hours and note the readings."
        ]
    },
    {
        id: "cough_cold",
        version: 1,
        reviewStatus: "draft",
        label: "Cough / cold / sore throat",
        bodySystem: "general",
        organDomain: "general",
        synonyms: ["cough", "coughing", "cold", "sore throat", "runny nose", "blocked nose", "stuffy nose", "khansi", "zukam", "gala kharab", "sneezing", "throat pain", "phlegm"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can examine your throat and chest and decide whether you need anything beyond symptom relief."
        },
        concern: "Upper respiratory tract infection",
        questions: [
            {
                id: "duration",
                slot: "Duration",
                text: "How long have you had these symptoms?",
                options: [
                    opt("short", "Less than a week", { concern: "Acute viral cold / cough" }, ["few days", "2 days", "3 days", "since yesterday"]),
                    opt("mid", "1–3 weeks", { concern: "Lingering post-viral cough" }, ["week", "2 weeks", "10 days"]),
                    opt("long", "More than 3 weeks", { urgency: "soon", ideal: I.PULMO, concern: "Chronic cough (TB / asthma / reflux screen)", reason: "A cough lasting over 3 weeks needs examination and possibly a chest X-ray and TB test." }, ["3 weeks", "month", "months"]),
                    opt("allergic", "Keeps coming back with sneezing and itchy eyes", { ideal: I.ENT, concern: "Allergic rhinitis" }, ["sneezing", "itchy eyes", "allergy", "dust", "every morning"])
                ]
            },
            {
                id: "associated",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("wheeze", "Breathlessness or wheezing", { urgency: "soon", ideal: I.PULMO, concern: "Possible asthma / bronchitis" }, ["breathless", "wheezing", "wheeze", "tight chest"]),
                    opt("tb_signs", "Blood in phlegm, night sweats or weight loss", { urgency: "urgent", concern: "Tuberculosis must be ruled out", reason: "These signs need prompt TB testing." }, ["blood in phlegm", "night sweats", "weight loss"]),
                    opt("sinus_ear", "High fever, ear pain, or face / sinus pain", { urgency: "soon", concern: "Possible bacterial sinus / ear / throat infection" }, ["ear pain", "sinus", "face pain", "high fever"]),
                    NONE_OPTION()
                ]
            }
        ],
        medicationHints: [
            { match: ["enalapril", "ramipril", "lisinopril", "perindopril", "pril"], note: "BP medicines ending in '-pril' can cause a dry cough — mention this to your doctor." }
        ],
        selfCare: [
            "Warm salt-water gargles, steam inhalation and honey in warm water can ease symptoms.",
            "Rest and drink plenty of warm fluids.",
            "Antibiotics don't help viral colds — take them only if a doctor prescribes them."
        ]
    },
    {
        id: "fatigue",
        version: 1,
        reviewStatus: "draft",
        label: "Tiredness / weakness",
        bodySystem: "general",
        organDomain: "general",
        synonyms: ["tired", "tiredness", "fatigue", "weakness", "low energy", "exhausted", "kamzori", "thakan", "no energy", "always sleepy", "lethargic"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can run basic blood tests (blood count, sugar, thyroid, vitamins) that explain most tiredness."
        },
        concern: "Fatigue — cause to be investigated",
        questions: [
            {
                id: "pattern",
                slot: "Pattern",
                text: "Which best fits how you feel?",
                options: [
                    opt("thyroid", "Weight gain, feeling cold, dry skin or hair fall", { ideal: I.ENDO, concern: "Possible thyroid (hypothyroidism) link" }, ["weight gain", "cold", "dry skin", "hair fall"]),
                    opt("anaemia", "Breathless or pale, or heavy periods", {
                        concern: "Possible anaemia",
                        secondaryReason: "Heavy periods are a common cause of anaemia in women, which a Gynecologist can treat."
                    }, ["pale", "breathless", "heavy periods"]),
                    opt("mood", "Low mood, losing interest, poor sleep", { ideal: I.PSYCH, concern: "Possible depression / stress-related fatigue" }, ["low mood", "sad", "no interest", "depressed", "poor sleep"]),
                    opt("general", "Tired even after good sleep, for 2+ weeks", { urgency: "soon", concern: "Persistent unexplained fatigue" }, ["after sleep", "2 weeks", "weeks", "all the time"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do you have any of these?",
                options: [
                    opt("diabetes", "Very thirsty or passing urine often", { urgency: "soon", ideal: I.ENDO, concern: "Possible diabetes" }, ["thirsty", "urine often", "frequent urination"]),
                    opt("weight_loss", "Losing weight without trying", { urgency: "urgent", reason: "Unexplained weight loss with tiredness needs prompt evaluation." }, ["weight loss", "losing weight"]),
                    opt("snoring", "Loud snoring or falling asleep in the day", { concern: "Possible sleep apnoea" }, ["snoring", "snore", "daytime sleepiness"]),
                    NONE_OPTION()
                ]
            }
        ],
        profileRules: [
            {
                when: { sex: "Female", answers: { pattern: ["anaemia"] } },
                effects: { secondary: S.GYNEC, secondaryReason: "Heavy periods are a common cause of anaemia in women, which a Gynecologist can treat." }
            }
        ],
        selfCare: [
            "Aim for 7–8 hours of regular sleep and limit screens before bed.",
            "Eat iron- and protein-rich food and stay hydrated.",
            "Avoid starting energy drinks or multiple supplements before your blood tests."
        ]
    },
    {
        id: "joint_body_pain",
        version: 1,
        reviewStatus: "draft",
        label: "Joint / body pain",
        bodySystem: "musculoskeletal",
        organDomain: "general",
        synonyms: [
            "joint pain", "knee pain", "knee joint", "body ache", "body pain", "muscle pain", "jodo me dard",
            "joints paining", "arthritis", "swollen joint", "joint is hot", "shoulder pain", "hip pain", "ankle pain", "wrist pain"
        ],
        route: {
            primary: S.GP,
            secondary: null,
            ideal: I.ORTHO,
            urgency: "routine",
            reason: "A General Physician can examine the joint, order X-rays or blood tests, and start treatment."
        },
        concern: "Musculoskeletal pain",
        questions: [
            {
                id: "pattern",
                slot: "Pain pattern",
                text: "Which best describes the pain?",
                options: [
                    opt("injury", "One joint, after an injury or overuse", { ideal: I.ORTHO, concern: "Sprain / overuse injury" }, ["injury", "twisted", "sports", "fell", "gym"]),
                    opt("inflammatory", "Many joints, swollen, stiff for 30+ minutes in the morning", { urgency: "soon", ideal: I.RHEUM, concern: "Inflammatory arthritis screen", reason: "Swollen joints with long morning stiffness should be evaluated soon, as early treatment protects joints." }, ["many joints", "swollen", "morning stiffness", "stiff"]),
                    opt("wear", "Knee or hip pain worse with walking (age 45+)", { ideal: I.ORTHO, concern: "Osteoarthritis pattern" }, ["walking", "stairs", "knee", "hip"]),
                    opt("viral", "Whole-body aches with fever", { concern: "Viral fever / chikungunya / dengue screen" }, ["fever", "whole body", "all over"])
                ]
            },
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("hot_joint", "Joint is hot, red and very swollen", { urgency: "urgent", concern: "Gout / joint infection screen", reason: "A hot, red, swollen joint needs same-day assessment to rule out infection." }, ["hot", "red", "very swollen"]),
                    opt("fracture", "Can't bear weight, or looks deformed after a fall", { urgency: "urgent", ideal: I.ORTHO, concern: "Possible fracture", reason: "Inability to bear weight after a fall needs an X-ray today." }, ["cant walk", "cannot bear weight", "deformed", "fracture"]),
                    opt("psoriasis", "Skin rash or psoriasis", { secondary: S.DERM, secondaryReason: "Joint pain with psoriasis can be psoriatic arthritis; a Dermatologist can co-manage the skin.", concern: "Psoriatic arthritis screen" }, ["psoriasis", "rash", "scaly skin"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Rest the painful joint, use ice for 15 minutes for new injuries, and keep gently mobile.",
            "Avoid long-term self-medication with painkillers — they can harm the stomach and kidneys.",
            "Maintain a healthy weight to reduce load on knees and hips."
        ]
    },
    {
        id: "back_neck_pain",
        version: 1,
        reviewStatus: "draft",
        label: "Back / neck pain",
        bodySystem: "musculoskeletal",
        organDomain: "general",
        synonyms: ["back pain", "backache", "lower back pain", "neck pain", "kamar dard", "spine pain", "upper back pain", "slip disc", "neck stiffness"],
        route: {
            primary: S.GP,
            secondary: null,
            ideal: I.ORTHO,
            urgency: "routine",
            reason: "Most back and neck pain is mechanical and settles with General Physician-guided treatment and exercises."
        },
        concern: "Mechanical back / neck pain",
        questions: [
            {
                id: "pattern",
                slot: "Pain pattern",
                text: "Which best describes your pain?",
                options: [
                    opt("mechanical", "Started after lifting or poor posture, slowly improving", { concern: "Mechanical strain" }, ["lifting", "posture", "sitting", "improving"]),
                    opt("radiating", "Shoots down a leg or arm, with tingling", { secondary: S.NEURO, secondaryReason: "Pain shooting down a limb suggests a pinched nerve, which a Neurologist can evaluate.", concern: "Nerve root compression (sciatica / radiculopathy)" }, ["shooting", "down my leg", "down my arm", "tingling", "sciatica"]),
                    opt("red_flag", "Constant, worse at night, or with fever / weight loss", { urgency: "urgent", concern: "Non-mechanical back pain (infection / other causes)", reason: "Constant night pain or pain with fever needs prompt evaluation." }, ["night", "constant", "fever", "weight loss"]),
                    opt("inflammatory", "Stiff in the morning, better with movement (under 40)", { urgency: "soon", ideal: I.RHEUM, concern: "Inflammatory back pain (spondyloarthritis screen)" }, ["morning stiffness", "better with movement"])
                ]
            },
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("cauda", "Loss of bladder / bowel control or numbness in the groin", { urgency: "emergency", reason: "This can mean severe nerve compression (cauda equina) and is an emergency." }, ["bladder", "bowel control", "groin numbness", "saddle"]),
                    opt("weakness", "Weakness in a leg or foot", { urgency: "urgent", primary: S.NEURO, secondary: S.GP, reason: "Leg weakness with back pain needs prompt Neurologist assessment." }, ["leg weakness", "foot drop", "weak leg"]),
                    opt("desk", "Long hours at a desk or on the phone", { concern: "Posture-related pain" }, ["desk", "laptop", "phone", "computer"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Stay gently active; bed rest for more than a day or two slows recovery.",
            "Use a hot pack and check your desk, chair and screen height.",
            "Avoid lifting heavy weights until the pain settles."
        ]
    },
    {
        id: "mental_wellbeing",
        version: 1,
        reviewStatus: "draft",
        label: "Stress, anxiety, sleep or mood",
        bodySystem: "mind",
        organDomain: "general",
        synonyms: ["anxiety", "anxious", "stress", "stressed", "depression", "depressed", "cant sleep", "cannot sleep", "insomnia", "panic attack", "panic attacks", "feeling low", "overthinking", "trouble sleeping", "sad all the time"],
        route: {
            primary: S.GP,
            secondary: null,
            ideal: I.PSYCH,
            urgency: "routine",
            reason: "A General Physician can screen for physical causes (thyroid, anaemia), start treatment and refer you for counselling."
        },
        concern: "Emotional wellbeing / sleep",
        questions: [
            {
                id: "main",
                slot: "Main concern",
                text: "What's troubling you most?",
                options: [
                    opt("sleep", "Trouble falling or staying asleep", { concern: "Insomnia" }, ["sleep", "insomnia", "awake"]),
                    opt("anxiety", "Constant worry, racing heart, or panic attacks", { concern: "Anxiety / panic" }, ["worry", "panic", "racing heart", "anxious"]),
                    opt("low_mood", "Low mood or loss of interest for 2+ weeks", { urgency: "soon", concern: "Possible depression" }, ["low mood", "no interest", "sad", "depressed", "hopeless"]),
                    opt("self_harm", "Thoughts of harming myself", { urgency: "emergency", reason: "Your safety comes first. Please reach out for immediate support." }, ["harm myself", "suicide", "end my life", "self harm"])
                ]
            },
            {
                id: "impact",
                slot: "Impact",
                text: "How much is this affecting your daily life?",
                options: [
                    opt("mild", "Mildly — I'm managing day to day", { concern: undefined }, ["mild", "managing"]),
                    opt("significant", "It's affecting my work, studies or relationships", { urgency: "soon" }, ["work", "studies", "relationships", "affecting"]),
                    opt("coping", "I'm using alcohol, pills or substances to cope", { urgency: "soon", concern: "Coping with substances — needs support" }, ["alcohol", "pills", "drinking", "substances"])
                ]
            }
        ],
        selfCare: [
            "Keep a regular sleep–wake time and avoid caffeine after 4 pm.",
            "Talk to someone you trust; free 24x7 support is available on Tele-MANAS 14416.",
            "Short daily walks and slow breathing (4 seconds in, 6 seconds out) can reduce anxiety."
        ]
    },
    {
        id: "urinary",
        version: 1,
        reviewStatus: "draft",
        label: "Urinary symptoms",
        bodySystem: "general",
        organDomain: "general",
        synonyms: ["burning urination", "burning urine", "painful urination", "frequent urination", "uti", "urine infection", "peshab me jalan", "blood in urine", "urinating often", "burning while peeing", "pee burns"],
        route: {
            primary: S.GP,
            secondary: null,
            ideal: I.URO,
            urgency: "soon",
            reason: "A General Physician can test your urine and treat most urinary infections quickly."
        },
        concern: "Urinary tract symptoms",
        questions: [
            {
                id: "main",
                slot: "Main symptom",
                text: "What is the main problem?",
                options: [
                    opt("burning", "Burning or pain while passing urine", { concern: "Urinary tract infection (UTI)" }, ["burning", "pain", "jalan"]),
                    opt("frequency_thirst", "Passing urine very often and feeling very thirsty", { ideal: I.ENDO, concern: "Possible diabetes" }, ["thirsty", "very often", "night"]),
                    opt("blood", "Blood in urine", { urgency: "urgent", concern: "Haematuria (stones / infection / other causes)", reason: "Blood in urine needs prompt evaluation." }, ["blood", "red urine"]),
                    opt("weak_stream", "Weak stream or difficulty starting (men)", { ideal: I.URO, concern: "Prostate enlargement screen" }, ["weak stream", "difficulty starting", "dribbling", "prostate"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do any of these apply?",
                options: [
                    opt("kidney", "Fever, chills, or pain in the back / side", { urgency: "urgent", concern: "Possible kidney infection", reason: "Urinary symptoms with fever or flank pain suggest a kidney infection that needs same-day treatment." }, ["fever", "chills", "back pain", "side pain", "flank"]),
                    opt("pregnant", "I am pregnant", { primary: S.GYNEC, secondary: S.GP, urgency: "soon", reason: "Urinary infections in pregnancy should be treated by your Gynecologist." }, ["pregnant"]),
                    opt("discharge", "Unusual vaginal discharge", { secondary: S.GYNEC, secondaryReason: "Discharge with urinary symptoms may be a vaginal infection, which a Gynecologist can treat." }, ["discharge", "vaginal"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Drink plenty of water and don't hold urine for long periods.",
            "Avoid self-starting antibiotics — a urine test helps choose the right one.",
            "Seek care the same day if fever or back pain develops."
        ]
    },
    {
        id: "weight_change",
        version: 1,
        reviewStatus: "draft",
        label: "Weight gain / loss",
        bodySystem: "general",
        organDomain: "general",
        synonyms: ["weight gain", "gaining weight", "weight loss", "losing weight", "obesity", "overweight", "underweight", "thyroid", "belly fat"],
        route: {
            primary: S.GP,
            secondary: null,
            ideal: I.ENDO,
            urgency: "routine",
            reason: "A General Physician can check thyroid, sugar and hormone levels and build a safe weight plan."
        },
        concern: "Weight change",
        questions: [
            {
                id: "pattern",
                slot: "Pattern",
                text: "Which best describes the change?",
                options: [
                    opt("thyroid", "Gaining weight with tiredness or feeling cold", { concern: "Possible hypothyroidism" }, ["tired", "cold", "sluggish"]),
                    opt("unexplained_loss", "Losing weight without trying", { urgency: "urgent", concern: "Unexplained weight loss", reason: "Unintentional weight loss needs prompt evaluation." }, ["without trying", "losing weight", "weight loss"]),
                    opt("pcos", "Gaining weight with irregular periods or facial hair", { secondary: S.GYNEC, secondaryReason: "Weight gain with irregular periods may be PCOS, which a Gynecologist manages.", concern: "Possible PCOS" }, ["irregular periods", "facial hair", "pcos", "pcod"]),
                    opt("lifestyle", "I want help losing weight healthily", { concern: "Lifestyle weight management" }, ["help losing weight", "diet plan", "healthy"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do any of these apply?",
                options: [
                    opt("diabetes", "Very thirsty or passing urine often", { urgency: "soon", concern: "Possible diabetes" }, ["thirsty", "urine often"]),
                    opt("night_sweats", "Night sweats or recurring fever", { urgency: "urgent", reason: "Weight change with night sweats or fever needs prompt investigation." }, ["night sweats", "fever"]),
                    opt("medicine", "Started a new medicine (e.g. steroids)", { concern: "Possible medicine-related weight change" }, ["steroid", "new medicine"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Track your weight weekly at the same time of day.",
            "Focus on whole foods, regular meals and 30 minutes of daily activity.",
            "Avoid crash diets or weight-loss pills without medical advice."
        ]
    }
];
