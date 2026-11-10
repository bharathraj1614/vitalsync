import { S, I, opt, NONE_OPTION } from "./_helpers.js";

/** Head, nerves and balance protocols */
export default [
    {
        id: "headache",
        version: 1,
        reviewStatus: "draft",
        label: "Headache",
        bodySystem: "head_nerves",
        organDomain: "neuro",
        synonyms: ["headache", "head ache", "headche", "migraine", "sar dard", "sir dard", "head pain", "head is paining", "head hurts", "throbbing head"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "Most headaches are tension-type or migraine and are well managed by a General Physician, who can also check your blood pressure and eyes."
        },
        concern: "Primary headache",
        questions: [
            {
                id: "pattern",
                slot: "Headache pattern",
                text: "Which best describes your headache?",
                options: [
                    opt("migraine", "Throbbing on one side, with nausea or light sensitivity", {
                        secondary: S.NEURO,
                        secondaryReason: "If migraines are frequent or not controlled, a Neurologist can start preventive treatment.",
                        concern: "Migraine pattern"
                    }, ["throbbing", "one side", "light", "nausea", "migraine"]),
                    opt("tension", "Tight band or pressure on both sides, worse with stress or screens", {
                        concern: "Tension-type headache"
                    }, ["band", "pressure", "both sides", "stress", "screen"]),
                    opt("progressive", "New and getting worse every day, or worse on waking / lying down", {
                        urgency: "urgent", primary: S.NEURO, secondary: S.GP,
                        reason: "A new, progressively worsening headache, or one worse on waking, is a red flag that a Neurologist should assess promptly.",
                        concern: "Progressive headache (secondary cause must be excluded)"
                    }, ["getting worse", "worse every day", "worse on waking", "morning", "lying down"]),
                    opt("cluster", "Severe pain around one eye with watering, in bouts", {
                        urgency: "soon", primary: S.NEURO, secondary: S.GP,
                        reason: "Severe one-sided pain around the eye in bouts suggests cluster headache, which is treated by a Neurologist.",
                        concern: "Cluster headache pattern"
                    }, ["around eye", "behind eye", "watering", "bouts"])
                ]
            },
            {
                id: "frequency",
                slot: "Frequency & triggers",
                text: "Which of these applies?",
                options: [
                    opt("occasional", "Occasional — a few times a month", { concern: undefined }, ["occasional", "few times", "sometimes"]),
                    opt("chronic", "15+ days a month, or I take painkillers most days", {
                        secondary: S.NEURO,
                        secondaryReason: "Frequent headaches or daily painkiller use can cause 'medication-overuse headache', which a Neurologist can help break.",
                        concern: "Chronic daily headache / medication-overuse screen"
                    }, ["daily", "every day", "15 days", "painkillers", "most days"]),
                    opt("injury_fever", "After a head injury, or with fever", {
                        urgency: "urgent",
                        reason: "Headache after a head injury or with fever should be examined today."
                    }, ["injury", "fell", "hit my head", "fever"]),
                    opt("over50", "First severe headache and I'm over 50", {
                        urgency: "urgent", primary: S.NEURO, secondary: S.GP,
                        reason: "A first severe headache after 50 needs prompt evaluation."
                    }, ["over 50", "first time"])
                ]
            }
        ],
        medicationHints: [
            { match: ["nitrate", "sildenafil", "nifedipine"], note: "Some heart and BP medicines can trigger headaches — mention them to your doctor." }
        ],
        selfCare: [
            "Drink enough water, keep regular meals and sleep, and take screen breaks every 30 minutes.",
            "Avoid taking painkillers more than 2–3 days a week — overuse makes headaches worse.",
            "Keep a headache diary (time, food, sleep, stress) for your doctor."
        ]
    },
    {
        id: "dizziness",
        version: 1,
        reviewStatus: "draft",
        label: "Dizziness / vertigo",
        bodySystem: "head_nerves",
        organDomain: "neuro",
        synonyms: ["dizzy", "dizziness", "vertigo", "chakkar", "chakkar aana", "lightheaded", "light headed", "room spinning", "head spinning", "giddiness", "giddy", "imbalance"],
        route: {
            primary: S.GP,
            secondary: null,
            urgency: "routine",
            reason: "A General Physician can check blood pressure, sugar, hydration and ears, which explain most dizziness."
        },
        concern: "Dizziness",
        questions: [
            {
                id: "type",
                slot: "Type of dizziness",
                text: "What does the dizziness feel like?",
                options: [
                    opt("vertigo", "The room spins, worse when turning my head or lying down", {
                        secondary: S.NEURO, ideal: I.ENT,
                        secondaryReason: "If spinning episodes keep returning, a Neurologist (or ENT specialist) can perform positional tests.",
                        concern: "Vertigo (BPPV / inner-ear screen)"
                    }, ["spin", "spinning", "turning", "rotating"]),
                    opt("orthostatic", "Light-headed when I stand up", {
                        concern: "Postural dizziness (BP / dehydration / anaemia screen)"
                    }, ["stand up", "standing", "get up", "lightheaded"]),
                    opt("unsteady", "Unsteady walking or losing balance", {
                        urgency: "soon", primary: S.NEURO, secondary: S.GP,
                        reason: "Ongoing imbalance while walking should be assessed by a Neurologist.",
                        concern: "Imbalance (neurological screen)"
                    }, ["unsteady", "balance", "walking", "falling"]),
                    opt("palpitations", "Feel faint with a racing or irregular heartbeat", {
                        urgency: "urgent", ideal: I.CARDIO,
                        reason: "Faintness with palpitations needs a same-day ECG and heart check.",
                        concern: "Possible heart-rhythm-related dizziness"
                    }, ["palpitations", "racing", "heartbeat", "heart"])
                ]
            },
            {
                id: "associated",
                slot: "Associated signs",
                text: "Do you have any of these?",
                options: [
                    opt("ear", "Hearing loss, ringing, or fullness in one ear", { ideal: I.ENT, concern: "Inner-ear cause (e.g. Meniere's) screen" }, ["hearing", "ringing", "ear"]),
                    opt("neuro", "Double vision, slurred speech, or weakness", {
                        urgency: "emergency", primary: S.NEURO,
                        reason: "These signs with dizziness can indicate a stroke."
                    }, ["double vision", "slurred", "weakness"]),
                    opt("meds", "I take BP or diabetes medicines", { concern: "Possible medicine-related low BP / low sugar" }, ["bp medicine", "diabetes", "sugar"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Sit or lie down immediately when dizzy; get up slowly from lying or sitting.",
            "Drink enough fluids and don't skip meals.",
            "Avoid driving or heights until you have been assessed."
        ]
    },
    {
        id: "numbness_tingling",
        version: 1,
        reviewStatus: "draft",
        label: "Numbness / tingling",
        bodySystem: "head_nerves",
        organDomain: "neuro",
        synonyms: ["numbness", "numb", "tingling", "pins and needles", "burning feet", "jhunjhuni", "sunn", "hands falling asleep", "nerve pain"],
        route: {
            primary: S.GP,
            secondary: S.NEURO,
            urgency: "routine",
            reason: "A General Physician can test for common causes such as diabetes, vitamin B12 deficiency and thyroid problems.",
            secondaryReason: "A Neurologist can perform nerve tests if symptoms persist."
        },
        concern: "Peripheral nerve symptoms",
        questions: [
            {
                id: "distribution",
                slot: "Where",
                text: "Where do you feel the numbness or tingling?",
                options: [
                    opt("glove_stocking", "Both feet/hands, came on gradually", { concern: "Peripheral neuropathy (diabetes / B12 screen)" }, ["both feet", "both hands", "gradually", "feet"]),
                    opt("hand_night", "Hand and fingers, worse at night", { ideal: I.ORTHO, concern: "Carpal tunnel syndrome screen" }, ["fingers", "hand", "night", "wrist"]),
                    opt("sciatica", "Shooting down one leg with back pain", { ideal: I.ORTHO, concern: "Nerve root compression (sciatica) screen" }, ["leg", "back pain", "shooting", "sciatica"]),
                    opt("sudden_one_side", "Sudden, on one side of the body or face", {
                        urgency: "emergency", primary: S.NEURO,
                        reason: "Sudden one-sided numbness can be a stroke."
                    }, ["sudden", "one side", "face"])
                ]
            },
            {
                id: "associated",
                slot: "Associated factors",
                text: "Do any of these apply?",
                options: [
                    opt("weakness", "Weakness or dropping things", {
                        urgency: "soon", primary: S.NEURO, secondary: S.GP,
                        reason: "Numbness with weakness needs Neurologist assessment."
                    }, ["weakness", "dropping", "weak"]),
                    opt("diabetes", "I have diabetes or thyroid problems", { concern: "Metabolic neuropathy (diabetes / thyroid)" }, ["diabetes", "sugar", "thyroid"]),
                    opt("b12", "Vegetarian diet, or long-term metformin / acidity medicines", { concern: "Possible vitamin B12 deficiency" }, ["vegetarian", "vegan", "metformin", "pantoprazole", "omeprazole"]),
                    NONE_OPTION()
                ]
            }
        ],
        selfCare: [
            "Check your feet daily for cuts if they feel numb, and wear comfortable footwear.",
            "Avoid long periods with wrists bent or legs crossed.",
            "If you have diabetes, keep a log of your sugar readings for your doctor."
        ]
    }
];
