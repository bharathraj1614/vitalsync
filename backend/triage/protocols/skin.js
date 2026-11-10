import { S, I, opt, NONE_OPTION } from "./_helpers.js";

/** Skin, hair and nail protocols */
export default [
    {
        id: "hair_loss",
        version: 1,
        reviewStatus: "draft",
        label: "Hair loss",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: [
            "hair loss", "hair fall", "hair falling", "losing hair", "hair shedding", "thinning hair", "hair thinning",
            "balding", "bald patch", "bald spot", "receding hairline", "alopecia", "baal gir", "baal jhad", "baal girna",
            "hair coming out", "hair breaking", "hair is falling"
        ],
        route: {
            primary: S.DERM,
            secondary: null,
            urgency: "routine",
            reason: "Dermatologists specialise in hair and scalp disorders and can examine your scalp to identify the exact type of hair loss."
        },
        concern: "Hair loss — type to be confirmed on scalp examination",
        questions: [
            {
                id: "pattern",
                slot: "Hair-loss pattern",
                text: "Which best describes how your hair is falling?",
                options: [
                    opt("crown_thinning", "Thinning on top/crown or a receding hairline", {
                        concern: "Pattern hair loss (androgenetic alopecia)"
                    }, ["top of my head", "top of head", "crown", "receding", "hairline", "thinning on top", "vertex"]),
                    opt("patchy", "Round, smooth bald patches", {
                        urgency: "soon",
                        concern: "Patchy hair loss (alopecia areata screen)",
                        reason: "Round bald patches are often alopecia areata, which responds best to early Dermatologist treatment."
                    }, ["patch", "patches", "round", "coin"]),
                    opt("diffuse", "Shedding all over — lots on the pillow or comb", {
                        concern: "Diffuse shedding (telogen effluvium screen)",
                        secondary: S.GP,
                        secondaryReason: "Diffuse shedding often has an internal trigger, so a General Physician can run blood tests for iron, vitamin D, B12 and thyroid."
                    }, ["all over", "pillow", "comb", "shower", "handful", "everywhere"]),
                    opt("scalp", "Broken hairs with itchy, flaky or scaly scalp", {
                        concern: "Scalp condition (dermatitis / fungal infection screen)"
                    }, ["itchy scalp", "flaky", "scaly", "dandruff", "broken"])
                ]
            },
            {
                id: "associated",
                slot: "Possible triggers",
                text: "Do any of these apply to you?",
                options: [
                    opt("systemic", "Tiredness, weight change, or feeling cold", {
                        secondary: S.GP,
                        ideal: I.ENDO,
                        secondaryReason: "Tiredness or weight change with hair loss can point to thyroid or iron problems — a General Physician can order these blood tests.",
                        concern: "Hair loss with possible thyroid / anaemia link"
                    }, ["tired", "fatigue", "weight gain", "weight loss", "feeling cold"]),
                    opt("hormonal", "Irregular periods, acne, or facial hair", {
                        secondary: S.GYNEC,
                        secondaryReason: "Hair thinning with irregular periods or acne can be a sign of PCOS, which a Gynecologist can evaluate.",
                        concern: "Hair loss with possible hormonal (PCOS) link"
                    }, ["irregular periods", "pcos", "pcod", "facial hair", "acne"]),
                    opt("trigger", "Illness, high fever, surgery, crash diet or childbirth in the last 3 months", {
                        concern: "Temporary shedding after a stressor (telogen effluvium)"
                    }, ["fever", "covid", "dengue", "typhoid", "surgery", "diet", "delivery", "childbirth", "pregnancy"]),
                    NONE_OPTION()
                ]
            }
        ],
        medicationHints: [
            { match: ["isotretinoin", "valproate", "valproic", "methotrexate", "warfarin", "lithium", "carbimazole"], note: "Some medicines you take (e.g. isotretinoin, valproate, methotrexate, warfarin, lithium) can cause hair shedding — mention them to your doctor." }
        ],
        selfCare: [
            "Use a mild shampoo and avoid tight hairstyles, harsh brushing and frequent heat styling.",
            "Eat enough protein, iron-rich foods (greens, lentils, eggs) and stay hydrated.",
            "Avoid starting oils, serums or supplements in bulk until your scalp has been examined."
        ]
    },
    {
        id: "acne",
        version: 1,
        reviewStatus: "draft",
        label: "Acne / pimples",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: ["acne", "pimple", "pimples", "breakout", "breakouts", "zits", "whiteheads", "blackheads", "daane", "muhase"],
        route: {
            primary: S.DERM,
            secondary: null,
            urgency: "routine",
            reason: "A Dermatologist can grade your acne and prescribe the right treatment to clear it and prevent scarring."
        },
        concern: "Acne vulgaris",
        questions: [
            {
                id: "severity",
                slot: "Severity",
                text: "How would you describe your acne?",
                options: [
                    opt("mild", "A few pimples or blackheads", { concern: "Mild acne" }, ["few", "mild", "some"]),
                    opt("moderate", "Many pimples on face, chest or back", { concern: "Moderate acne" }, ["many", "lots", "back", "chest"]),
                    opt("severe", "Painful deep lumps/cysts, or leaving scars or dark marks", {
                        urgency: "soon",
                        concern: "Severe nodulo-cystic acne (scarring risk)",
                        reason: "Deep, painful or scarring acne needs early Dermatologist treatment to prevent permanent scars."
                    }, ["cyst", "cysts", "painful", "lumps", "scars", "scarring", "marks"])
                ]
            },
            {
                id: "associated",
                slot: "Possible triggers",
                text: "Do any of these apply?",
                options: [
                    opt("hormonal", "Irregular periods, facial hair, or hair thinning", {
                        secondary: S.GYNEC,
                        secondaryReason: "Acne with irregular periods or facial hair can be a sign of PCOS, which a Gynecologist can evaluate.",
                        concern: "Acne with possible hormonal (PCOS) link"
                    }, ["irregular periods", "pcos", "pcod", "facial hair"]),
                    opt("drug", "Started after a new medicine or a steroid / fairness cream", {
                        concern: "Possible medicine- or steroid-cream-induced acne"
                    }, ["steroid", "cream", "new medicine", "fairness"]),
                    opt("adult_onset", "Started suddenly as an adult (25+)", { concern: "Adult-onset acne" }, ["suddenly", "adult", "never had"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Wash your face twice daily with a gentle cleanser; don't scrub hard.",
            "Don't squeeze or pick pimples — it causes scars and dark marks.",
            "Use oil-free, 'non-comedogenic' sunscreen and avoid steroid or mixed creams from the pharmacy."
        ]
    },
    {
        id: "skin_rash_itch",
        version: 1,
        reviewStatus: "draft",
        label: "Skin rash / itching",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: [
            "rash", "rashes", "itching", "itchy", "itch", "itchy skin", "hives", "red patches", "red spots", "eczema",
            "psoriasis", "khujli", "skin allergy", "bumps on skin", "urticaria", "skin irritation", "blisters"
        ],
        route: {
            primary: S.DERM,
            secondary: null,
            urgency: "routine",
            reason: "A Dermatologist can examine the rash, identify its type and treat the cause."
        },
        concern: "Skin rash / dermatitis",
        questions: [
            {
                id: "appearance",
                slot: "Rash appearance",
                text: "What does the rash look like?",
                options: [
                    opt("hives", "Raised itchy welts that come and go", { concern: "Urticaria (hives)" }, ["welts", "hives", "come and go", "raised"]),
                    opt("dry_scaly", "Dry, scaly or thickened patches", { concern: "Eczema / psoriasis screen" }, ["dry", "scaly", "thick", "flaky"]),
                    opt("ring", "Ring-shaped itchy patch (groin, armpit, waist or feet)", { concern: "Fungal infection (tinea) screen" }, ["ring", "circle", "groin", "armpit", "waist"]),
                    opt("blisters_fever", "Blisters, or rash with fever", {
                        urgency: "urgent", primary: S.GP, secondary: S.DERM,
                        reason: "A rash with fever or blisters may be an infection (like chickenpox) or a drug reaction and should be seen today.",
                        secondaryReason: "A Dermatologist can follow up on the skin findings."
                    }, ["blister", "blisters", "fever", "water filled"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do any of these apply?",
                options: [
                    opt("swelling_breathing", "Swelling of lips/eyes or trouble breathing", {
                        urgency: "emergency",
                        reason: "Swelling of the face with a rash can be a severe allergic reaction (anaphylaxis)."
                    }, ["swelling", "lips", "eyes swollen", "breathing"]),
                    opt("spreading", "Spreading fast, painful or warm to touch", {
                        urgency: "urgent",
                        concern: "Possible skin infection (cellulitis)",
                        reason: "A painful, warm, spreading rash can be a skin infection that needs same-day treatment."
                    }, ["spreading", "painful", "warm", "hot"]),
                    opt("trigger", "Started after a new food, medicine, or product", { concern: "Possible allergic / contact reaction" }, ["new food", "medicine", "product", "soap", "detergent", "after eating"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Use a fragrance-free moisturiser and mild soap; avoid hot water baths.",
            "Avoid steroid or mixed creams from the pharmacy until examined — they can worsen fungal rashes.",
            "Stop any new product you suspect and note what you ate or used before the rash."
        ]
    },
    {
        id: "pigmentation",
        version: 1,
        reviewStatus: "draft",
        label: "Pigmentation / spots / moles",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: [
            "pigmentation", "dark spots", "dark patches", "melasma", "tanning", "white patches", "white spots", "vitiligo",
            "mole", "moles", "uneven skin tone", "dark neck", "safed daag"
        ],
        route: {
            primary: S.DERM,
            secondary: null,
            urgency: "routine",
            reason: "A Dermatologist can examine the spots, often with a dermoscope, and advise the right treatment."
        },
        concern: "Skin pigmentation change",
        questions: [
            {
                id: "type",
                slot: "Type of spot",
                text: "Which best describes the change?",
                options: [
                    opt("melasma", "Dark patches on cheeks/forehead", { concern: "Melasma / hyperpigmentation" }, ["cheeks", "forehead", "face", "dark patches"]),
                    opt("white", "White or lighter patches", { urgency: "soon", concern: "Hypopigmentation (vitiligo / fungal screen)" }, ["white", "lighter", "safed"]),
                    opt("mole", "A mole that is new, changing, bleeding or irregular", {
                        urgency: "urgent",
                        concern: "Changing mole (skin cancer screen)",
                        reason: "A changing, bleeding or irregular mole should be checked by a Dermatologist promptly."
                    }, ["mole", "changing", "bleeding", "irregular"]),
                    opt("velvety", "Dark, velvety skin on neck or armpits", {
                        secondary: S.GP,
                        secondaryReason: "Dark velvety skin on the neck can be a sign of insulin resistance — a General Physician can check your sugar levels.",
                        concern: "Acanthosis nigricans (insulin resistance screen)"
                    }, ["velvety", "neck", "armpit", "dark neck"])
                ]
            },
            {
                id: "course",
                slot: "Course",
                text: "How has it changed over time?",
                options: [
                    opt("spreading", "Spreading or getting bigger over weeks", { urgency: "soon" }, ["spreading", "bigger", "growing"]),
                    opt("itchy", "Itchy or scaly", { concern: "Possible fungal infection (pityriasis / tinea)" }, ["itchy", "scaly"]),
                    opt("stable", "Stable for months", { concern: "Stable pigmentation" }, ["stable", "same", "months"])
                ]
            }
        ],
        selfCare: [
            "Use a broad-spectrum sunscreen (SPF 30+) every morning, even indoors.",
            "Avoid bleaching, fairness and steroid creams — they can worsen pigmentation.",
            "Take a dated photo of the spot to track changes."
        ]
    },
    {
        id: "fungal_infection",
        version: 1,
        reviewStatus: "draft",
        label: "Fungal infection (ringworm / nails / feet)",
        bodySystem: "skin_hair",
        organDomain: "derm",
        synonyms: ["ringworm", "fungal infection", "fungal", "nail fungus", "athletes foot", "jock itch", "daad", "tinea", "groin itch"],
        route: {
            primary: S.DERM,
            secondary: null,
            urgency: "routine",
            reason: "Fungal infections in India are increasingly hard to treat; a Dermatologist can choose the right antifungal and duration."
        },
        concern: "Superficial fungal infection (tinea)",
        questions: [
            {
                id: "site",
                slot: "Location",
                text: "Where is the infection?",
                options: [
                    opt("groin", "Groin, thighs, waist or buttocks", { concern: "Tinea cruris / corporis" }, ["groin", "thigh", "waist", "buttock"]),
                    opt("feet", "Feet or between toes", { concern: "Tinea pedis (athlete's foot)" }, ["feet", "toes", "foot"]),
                    opt("nails", "Nails — thick, yellow or crumbling", { concern: "Nail fungal infection (onychomycosis)" }, ["nail", "nails"]),
                    opt("widespread", "Many places, or keeps coming back", {
                        urgency: "soon", secondary: S.GP,
                        secondaryReason: "Recurrent or widespread fungal infection can be linked to diabetes — a General Physician can check your sugar.",
                        concern: "Recurrent / extensive tinea"
                    }, ["many places", "keeps coming back", "recurring", "again and again"])
                ]
            },
            {
                id: "history",
                slot: "Treatment history",
                text: "Do any of these apply?",
                options: [
                    opt("steroid_cream", "I've used steroid or mixed creams (e.g. Quadriderm, Panderm)", {
                        urgency: "soon", concern: "Steroid-modified fungal infection"
                    }, ["steroid", "quadriderm", "panderm", "betnovate", "mixed cream"]),
                    opt("diabetes", "I have diabetes or low immunity", {
                        secondary: S.GP,
                        secondaryReason: "Diabetes control affects fungal infections — a General Physician can help optimise it."
                    }, ["diabetes", "sugar", "immunity"]),
                    opt("family", "Family members also have it", { concern: "Household spread of tinea" }, ["family", "wife", "husband", "children", "everyone"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Keep the area dry; wear loose cotton clothes and change innerwear daily.",
            "Don't share towels; wash clothes in hot water and dry them in sunlight.",
            "Avoid steroid or mixed creams — they make fungal infections spread."
        ]
    }
];
