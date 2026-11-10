import { S, opt, NONE_OPTION } from "./_helpers.js";

/** Digestive system protocols */
export default [
    {
        id: "acidity_reflux",
        version: 1,
        reviewStatus: "draft",
        label: "Acidity / heartburn",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: [
            "acidity", "heartburn", "acid reflux", "reflux", "gerd", "sour burps", "khatti dakar",
            "burning in chest after eating", "burning after meals", "indigestion", "gas trouble", "gastric", "chest burning"
        ],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can confirm this is acid reflux, review food and medicine triggers, and start first-line treatment."
        },
        concern: "Acid reflux / gastritis",
        questions: [
            {
                id: "frequency",
                slot: "How often",
                text: "How often do you get the burning or acidity?",
                options: [
                    opt("occasional", "Occasionally — after heavy or spicy meals", { concern: "Occasional diet-related acid reflux" }, ["occasionally", "sometimes", "spicy", "heavy meal"]),
                    opt("frequent", "Most days for 2+ weeks", {
                        urgency: "soon",
                        secondary: S.GASTRO,
                        secondaryReason: "Reflux on most days for over 2 weeks should be reviewed by a Gastroenterologist if first-line treatment does not settle it."
                    }, ["most days", "daily", "every day", "2 weeks", "weeks"]),
                    opt("despite_meds", "Still happening despite antacids / Pan-D for weeks", {
                        urgency: "soon",
                        primary: S.GASTRO,
                        secondary: S.GP,
                        reason: "Symptoms that persist despite acid-suppressing medicine need specialist evaluation, which may include an endoscopy.",
                        concern: "Reflux not responding to treatment (refractory GERD screen)"
                    }, ["despite", "antacid", "pan d", "pantoprazole", "omeprazole", "not working", "medicine not helping"])
                ]
            },
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these along with the acidity?",
                options: [
                    opt("swallowing", "Food getting stuck or pain while swallowing", {
                        urgency: "urgent", primary: S.GASTRO, secondary: S.GP,
                        reason: "Difficulty swallowing is a warning sign that needs prompt Gastroenterologist evaluation."
                    }, ["swallow", "stuck"]),
                    opt("vomit_black", "Repeated vomiting or black stools", {
                        urgency: "urgent", primary: S.GASTRO, secondary: S.GP,
                        reason: "Vomiting or black stools with acidity can indicate bleeding from the stomach and needs urgent evaluation."
                    }, ["vomiting", "black stool", "black poop"]),
                    opt("weight_loss", "Losing weight without trying", {
                        urgency: "urgent", primary: S.GASTRO, secondary: S.GP,
                        reason: "Unintended weight loss with digestive symptoms needs specialist assessment."
                    }, ["weight loss", "losing weight"]),
                    NONE_OPTION()
                ]
            }
        ],
        profileRules: [
            {
                when: { minAge: 55, answers: { frequency: ["frequent", "despite_meds"] } },
                effects: {
                    primary: S.GASTRO, secondary: S.GP, urgency: "soon",
                    reason: "New or persistent reflux after age 55 is usually evaluated by a Gastroenterologist."
                }
            }
        ],
        medicationHints: [
            { match: ["ibuprofen", "diclofenac", "aspirin", "naproxen", "combiflam", "brufen", "voveran"], note: "Painkillers like ibuprofen, diclofenac and aspirin commonly cause acidity — mention them to your doctor." }
        ],
        selfCare: [
            "Eat smaller meals and avoid lying down for 2–3 hours after eating.",
            "Cut down on tea/coffee, spicy and oily food, alcohol and smoking.",
            "Raise the head end of your bed if symptoms are worse at night."
        ]
    },
    {
        id: "abdominal_pain",
        version: 1,
        reviewStatus: "draft",
        label: "Abdominal pain",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: [
            "stomach pain", "abdominal pain", "abdomen pain", "tummy ache", "tummy pain", "stomach ache",
            "stomachache", "belly pain", "pet dard", "pet me dard", "stomach hurts", "stomach cramps",
            "pain in stomach", "side of stomach", "lower right abdomen", "pain in lower right"
        ],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can examine your abdomen, which is essential to find the cause of tummy pain, and order tests if needed."
        },
        concern: "Abdominal pain — cause to be assessed on examination",
        questions: [
            {
                id: "location",
                slot: "Where is the pain",
                text: "Where is the pain mainly?",
                options: [
                    opt("upper", "Upper middle, just below the chest", { concern: "Upper abdominal pain (gastritis / ulcer / gallbladder screen)" }, ["upper", "below chest", "top of stomach", "epigastric"]),
                    opt("lower_right", "Lower right side", {
                        urgency: "urgent",
                        reason: "Pain in the lower right abdomen must be examined the same day to rule out appendicitis.",
                        concern: "Lower right abdominal pain (appendicitis must be ruled out)"
                    }, ["lower right", "right side", "right lower"]),
                    opt("lower_pelvic", "Lower belly / pelvis (or linked to periods)", {
                        secondary: S.GYNEC,
                        secondaryReason: "Lower abdominal pain in women can come from the uterus or ovaries, so a Gynecologist is a good second opinion.",
                        concern: "Lower abdominal / pelvic pain"
                    }, ["lower belly", "pelvis", "pelvic", "period", "below navel"]),
                    opt("all_over", "All over or moving around", { concern: "Generalised abdominal pain (gas / gastroenteritis / IBS screen)" }, ["all over", "everywhere", "moving", "whole stomach"])
                ]
            },
            {
                id: "pattern",
                slot: "Pain pattern",
                text: "Which best describes the pain?",
                options: [
                    opt("sudden_severe", "Sudden, severe and constant", {
                        urgency: "urgent",
                        reason: "Sudden, severe, constant abdominal pain needs same-day medical examination."
                    }, ["sudden", "severe", "constant", "unbearable"]),
                    opt("recurring_meals", "Comes and goes, linked to meals or bowel habits", {
                        secondary: S.GASTRO,
                        secondaryReason: "Recurring pain linked to meals or bowel habits is worth reviewing with a Gastroenterologist."
                    }, ["comes and goes", "after eating", "meals", "bowel", "recurring"]),
                    opt("fever_vomit", "With fever or vomiting", {
                        urgency: "urgent",
                        reason: "Abdominal pain with fever or vomiting can indicate infection or inflammation and should be examined today."
                    }, ["fever", "vomiting", "vomit"]),
                    opt("mild_recent", "Mild, started in the last day or two", { concern: "Mild, recent abdominal discomfort" }, ["mild", "yesterday", "today", "since morning"])
                ]
            }
        ],
        selfCare: [
            "Sip fluids and eat light, bland food until you are examined.",
            "Avoid painkillers like ibuprofen on an empty stomach — they can worsen stomach pain.",
            "Go to an emergency room if the pain becomes severe, constant, or you cannot keep fluids down."
        ]
    },
    {
        id: "diarrhea",
        version: 1,
        reviewStatus: "draft",
        label: "Loose motions / diarrhoea",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: [
            "loose motion", "loose motions", "loose stool", "loose stools", "diarrhea", "diarrhoea", "watery stool",
            "watery stools", "dast", "frequent stools", "runny stool", "upset stomach"
        ],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "Most loose motions are infections that a General Physician can treat, including checking for dehydration."
        },
        concern: "Acute gastroenteritis",
        questions: [
            {
                id: "duration",
                slot: "Duration",
                text: "How long have you had loose motions?",
                options: [
                    opt("short", "Less than 2 days", { concern: "Acute gastroenteritis (likely infection)" }, ["today", "yesterday", "1 day", "2 days", "since morning"]),
                    opt("week", "3 to 14 days", { urgency: "soon", concern: "Persistent diarrhoea (stool tests may be needed)" }, ["3 days", "4 days", "5 days", "a week", "week"]),
                    opt("chronic", "More than 2 weeks, or keeps coming back", {
                        urgency: "soon",
                        secondary: S.GASTRO,
                        secondaryReason: "Diarrhoea lasting more than 2 weeks or recurring needs Gastroenterologist evaluation for IBS, infection or malabsorption.",
                        concern: "Chronic or recurrent diarrhoea"
                    }, ["2 weeks", "month", "months", "chronic", "keeps coming back", "always"])
                ]
            },
            {
                id: "alarm",
                slot: "Associated signs",
                text: "Do you have any of these?",
                options: [
                    opt("blood", "Blood or mucus in stool", {
                        urgency: "urgent", primary: S.GASTRO, secondary: S.GP,
                        reason: "Blood or mucus in stool needs prompt Gastroenterologist evaluation."
                    }, ["blood", "mucus"]),
                    opt("dehydration", "Dizzy, very thirsty, or passing very little urine", {
                        urgency: "urgent",
                        reason: "These are signs of dehydration — you should be seen today and start ORS now."
                    }, ["dizzy", "thirsty", "little urine", "dehydrated", "weak"]),
                    opt("fever_cramps", "Fever or severe cramps", { urgency: "soon", concern: "Infective diarrhoea (fever/cramps)" }, ["fever", "cramps", "cramping"]),
                    NONE_OPTION()
                ]
            }
        ],
        medicationHints: [
            { match: ["metformin"], note: "Metformin often causes loose stools — tell your doctor, as the dose or form can be changed." },
            { match: ["amoxicillin", "augmentin", "azithromycin", "ciprofloxacin", "antibiotic"], note: "Recent antibiotics can cause diarrhoea — mention them to your doctor." }
        ],
        selfCare: [
            "Drink ORS (oral rehydration solution) after every loose stool.",
            "Eat light foods like rice, curd, banana and khichdi.",
            "Avoid anti-diarrhoeal tablets if you have fever or blood in stool unless a doctor advises them."
        ]
    },
    {
        id: "constipation",
        version: 1,
        reviewStatus: "draft",
        label: "Constipation",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: ["constipation", "constipated", "hard stool", "hard stools", "not passing stool", "kabz", "straining", "difficulty passing stool"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can identify diet, fluid and medicine causes of constipation and start treatment."
        },
        concern: "Functional constipation",
        questions: [
            {
                id: "duration",
                slot: "Duration",
                text: "How long has this been going on?",
                options: [
                    opt("recent", "Less than 2 weeks", { concern: "Short-term constipation (diet / fluids / travel)" }, ["few days", "week", "recent"]),
                    opt("months", "Several months", {
                        secondary: S.GASTRO,
                        secondaryReason: "Long-standing constipation that does not respond to diet changes can be reviewed by a Gastroenterologist."
                    }, ["months", "years", "long time", "always"]),
                    opt("new_change", "A recent change from my usual pattern (age 40+)", {
                        urgency: "soon", secondary: S.GASTRO,
                        secondaryReason: "A new change in bowel habit after 40 should be evaluated by a Gastroenterologist."
                    }, ["change", "recently changed", "new"])
                ]
            },
            {
                id: "associated",
                slot: "Associated symptoms",
                text: "Do you have any of these?",
                options: [
                    opt("blood_pain", "Blood on stool or pain while passing", {
                        urgency: "soon", secondary: S.GASTRO,
                        secondaryReason: "Pain or bleeding when passing stool often points to piles or a fissure, which a Gastroenterologist can assess.",
                        concern: "Piles / anal fissure screen"
                    }, ["blood", "pain while passing", "piles", "bleeding"]),
                    opt("ibs", "Alternates with loose stools, bloating eases after passing stool", {
                        secondary: S.GASTRO,
                        secondaryReason: "This pattern suggests irritable bowel syndrome, which a Gastroenterologist manages.",
                        concern: "Irritable bowel syndrome (IBS) pattern"
                    }, ["alternates", "loose", "bloating"]),
                    opt("obstruction", "Severe bloating, vomiting, or cannot pass gas", {
                        urgency: "urgent",
                        reason: "Severe bloating with vomiting or no passage of gas can mean a bowel blockage and needs urgent examination."
                    }, ["cannot pass gas", "vomiting", "severe bloating"]),
                    NONE_OPTION()
                ]
            }
        ],
        medicationHints: [
            { match: ["iron", "calcium", "amlodipine", "tramadol", "codeine"], note: "Iron, calcium, some BP medicines and opioid painkillers can cause constipation — mention them to your doctor." }
        ],
        selfCare: [
            "Increase fibre: fruits, vegetables, whole grains, isabgol (psyllium).",
            "Drink 2–3 litres of water a day and stay active.",
            "Don't ignore the urge to pass stool; try a regular toilet time after breakfast."
        ]
    },
    {
        id: "bowel_after_meals",
        version: 1,
        reviewStatus: "draft",
        label: "Urge to pass stool right after eating or drinking",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: [
            "poop after eating", "pooping after eating", "poop after drinking water", "pooping after drinking water",
            "pooping just after", "poop right after", "toilet after eating", "toilet right after eating",
            "stool after meals", "urge to pass stool after eating", "pass stool right after", "stool right after",
            "motion after eating", "bowel movement after eating",
            "after drinking water poop", "pooping after drinking", "go to toilet after every meal"
        ],
        route: {
            primary: S.GP,
            secondary: S.GASTRO,
            urgency: "routine",
            reason: "A General Physician can check for common triggers such as infection, thyroid or diet, and order baseline stool and blood tests.",
            secondaryReason: "Because this happens regularly, a Gastroenterologist can assess gut motility, IBS or food intolerance in more depth."
        },
        concern: "Exaggerated gastrocolic reflex / gut motility",
        questions: [
            {
                id: "stool",
                slot: "Stool type",
                text: "What is the stool usually like?",
                options: [
                    opt("normal", "Normal, formed stool", { concern: "Exaggerated gastrocolic reflex (often benign)" }, ["normal", "formed"]),
                    opt("loose_urgent", "Loose, watery or urgent", {
                        urgency: "soon", concern: "IBS with diarrhoea / gut hypermotility screen"
                    }, ["loose", "watery", "urgent"]),
                    opt("mixed", "Mix of hard and loose, with bloating", { concern: "Irritable bowel syndrome (IBS) pattern" }, ["mixed", "hard and loose", "bloating"]),
                    opt("greasy", "Greasy, very foul-smelling, or floats", {
                        urgency: "soon", primary: S.GASTRO, secondary: S.GP,
                        reason: "Greasy, floating stools can mean food is not being absorbed properly, which a Gastroenterologist should evaluate.",
                        concern: "Malabsorption screen (e.g. celiac disease, pancreatic insufficiency)"
                    }, ["greasy", "oily", "floats", "foul"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Have you noticed any of these?",
                options: [
                    opt("alarm", "Weight loss, blood in stool, or waking at night to pass stool", {
                        urgency: "urgent", primary: S.GASTRO, secondary: S.GP,
                        reason: "These warning signs need prompt Gastroenterologist evaluation."
                    }, ["weight loss", "blood", "night"]),
                    opt("food_trigger", "Clearly triggered by milk, wheat or spicy food", { concern: "Possible food intolerance (lactose / gluten)" }, ["milk", "wheat", "spicy", "dairy"]),
                    opt("stress", "Worse with stress or anxiety", { concern: "Stress-related IBS pattern" }, ["stress", "anxiety", "tension"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Sip room-temperature water slowly instead of gulping cold water on an empty stomach.",
            "Limit tea, coffee, artificial sweeteners and very oily meals in the morning.",
            "Keep a 1-week food and stool diary to show your doctor."
        ]
    },
    {
        id: "nausea_vomiting",
        version: 1,
        reviewStatus: "draft",
        label: "Nausea / vomiting",
        bodySystem: "digestive",
        organDomain: "gi",
        synonyms: ["nausea", "nauseous", "vomiting", "vomit", "ulti", "throwing up", "feel like vomiting", "queasy", "puking"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can find the cause of nausea, check for dehydration, and prescribe safe anti-sickness medicine."
        },
        concern: "Nausea / vomiting",
        questions: [
            {
                id: "context",
                slot: "Context",
                text: "Which fits your situation best?",
                options: [
                    opt("food", "Started within a day, possibly after outside food", { concern: "Likely food poisoning / gastroenteritis" }, ["outside food", "food poisoning", "after eating", "today"]),
                    opt("ongoing", "Ongoing for more than a week", {
                        urgency: "soon", secondary: S.GASTRO,
                        secondaryReason: "Nausea for more than a week should be investigated by a Gastroenterologist."
                    }, ["week", "weeks", "ongoing", "daily"]),
                    opt("pregnancy", "I could be pregnant (missed period)", {
                        primary: S.GYNEC, secondary: S.GP,
                        reason: "Nausea with a missed period could be early pregnancy — a Gynecologist can confirm and guide safe treatment.",
                        concern: "Possible pregnancy-related nausea"
                    }, ["pregnant", "missed period", "late period"]),
                    opt("headache", "With severe headache or dizziness", {
                        urgency: "urgent", secondary: S.NEURO,
                        secondaryReason: "Vomiting with severe headache or dizziness may have a neurological cause."
                    }, ["headache", "dizzy", "dizziness"])
                ]
            },
            {
                id: "alarm",
                slot: "Warning signs",
                text: "Do you have any of these?",
                options: [
                    opt("no_fluids", "Can't keep fluids down for 12+ hours", {
                        urgency: "urgent", reason: "Being unable to keep fluids down risks dehydration — you should be seen today."
                    }, ["cant keep", "cannot keep", "fluids", "everything comes out"]),
                    opt("blood", "Blood or coffee-ground material in vomit", {
                        urgency: "emergency", primary: S.GASTRO,
                        reason: "Blood in vomit is a medical emergency."
                    }, ["blood", "coffee"]),
                    opt("belly_pain", "Severe belly pain", {
                        urgency: "urgent", reason: "Vomiting with severe abdominal pain needs same-day examination."
                    }, ["belly pain", "stomach pain", "abdominal pain"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Take small, frequent sips of ORS or water.",
            "Eat dry, bland food (toast, rice, biscuits) once vomiting settles.",
            "Avoid strong smells, oily food and lying flat right after eating."
        ]
    }
];
