/**
 * Complaint classification & answer mapping (deterministic layer).
 * The LLM layer (llm.js) is only consulted when this layer is not confident.
 */
import { tokenize, findPhrase, normalizeText } from "./normalize.js";
import { COMPLAINT_PROTOCOLS, GENERIC_PROTOCOLS, SYSTEM_PICKER } from "./protocols/index.js";

const CHILD_PHRASES = [
    "my child", "my baby", "my son", "my daughter", "my kid", "my kids", "my toddler", "my infant",
    "newborn", "infant", "toddler", "baby has", "beta ko", "beti ko", "bacche ko", "baccha"
];

/** Detects that the patient is describing a child's symptoms. */
export function detectChildContext(text = "") {
    const tokens = tokenize(text);
    if (CHILD_PHRASES.some((p) => findPhrase(tokens, p).found)) return true;
    const ageMatch = normalizeText(text).match(/\b(\d{1,2})\s*(year|years|yr|yrs|month|months)\s*old\b/);
    if (ageMatch) {
        const n = Number(ageMatch[1]);
        if (/month/.test(ageMatch[2])) return true;
        if (n < 16) return true;
    }
    return false;
}

function scoreProtocol(tokens, protocol) {
    // Sort synonyms longest-first so a specific phrase ("irregular periods") claims its words
    // before a shorter synonym ("periods" / "period") can double-count the same words.
    const sortedSynonyms = [...(protocol.synonyms || [])].sort((a, b) => b.length - a.length);
    const consumedStems = new Set();
    const withIdx = tokens.indexOf("with");
    let score = 0;
    let earliestIdx = Infinity;
    const hits = [];

    const stem = (w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

    for (const phrase of sortedSynonyms) {
        const r = findPhrase(tokens, phrase);
        if (!r.found || r.negated) continue;
        const pStems = tokenize(phrase).map(stem);
        if (pStems.every((s) => consumedStems.has(s))) continue;
        pStems.forEach((s) => consumedStems.add(s));

        const baseWeight = Math.min(2.5, 1 + 0.5 * (pStems.length - 1) + (phrase.length >= 8 ? 0.3 : 0));
        // Synonyms occurring after "with" carry modifier weight (0.5x) compared to the primary complaint before "with"
        const positionFactor = withIdx !== -1 && r.index > withIdx ? 0.5 : 1.0;
        score += baseWeight * positionFactor;
        hits.push(phrase);

        if (r.index >= 0 && r.index < earliestIdx) earliestIdx = r.index;
    }

    if (score === 0) return { score: 0, hits: [], earliestIdx: Infinity };

    // Lead-complaint & "X with Y" structure: in "<chief complaint> with <associated symptoms>",
    // a protocol matched BEFORE "with" is the primary complaint; a protocol matched only AFTER "with"
    // is an associated symptom.
    const isBeforeWith = withIdx === -1 ? earliestIdx <= 1 : earliestIdx < withIdx;

    if (earliestIdx < Infinity) {
        const leadBonus = isBeforeWith ? 2.0 - earliestIdx * 0.2 : Math.max(0, 0.5 - earliestIdx * 0.1);
        score += leadBonus;
    }

    // Clinical coherence bonus: if this protocol matched as the lead complaint AND
    // its follow-up question options match associated symptoms mentioned later in the sentence,
    // this protocol explains both the chief complaint and those associated symptoms.
    if (isBeforeWith) {
        let followUpHits = 0;
        for (const q of protocol.questions || []) {
            for (const opt of q.options || []) {
                if (opt.value === "none") continue;
                for (const m of opt.match || []) {
                    const r = findPhrase(tokens, m);
                    if (r.found && !r.negated && !consumedStems.has(stem(tokenize(m)[0] || ""))) {
                        followUpHits++;
                    }
                }
            }
        }
        if (followUpHits > 0) {
            score += Math.min(4.0, followUpHits * 1.4);
        }
    }

    return { score, hits, earliestIdx };
}

/**
 * Ranks complaint protocols for a free-text description.
 * @returns {{ protocolId, score, hits }[]} sorted best-first (only positive scores)
 */
export function rankComplaints(text = "") {
    const tokens = tokenize(text);
    return COMPLAINT_PROTOCOLS
        .filter((p) => p.id !== "child_illness")
        .map((p) => ({ protocolId: p.id, ...scoreProtocol(tokens, p) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.earliestIdx - b.earliestIdx);
}

/** Lexicon-only classification. Returns null when nothing matched. */
export function classifyByLexicon(text = "") {
    const ranked = rankComplaints(text);
    if (ranked.length > 0) {
        const [top, second] = ranked;
        const margin = second ? top.score - second.score : top.score;
        return {
            protocolId: top.protocolId,
            source: "lexicon",
            confidence: Math.min(0.95, 0.6 + 0.1 * top.score + (margin > 0 ? 0.1 : -0.1)),
            hits: top.hits,
            alternatives: ranked.slice(1, 3).map((r) => r.protocolId)
        };
    }
    // Second tier: body-system level words ("my nails", "stomach issue")
    const tokens = tokenize(text);
    const generic = GENERIC_PROTOCOLS
        .map((p) => ({ protocolId: p.id, ...scoreProtocol(tokens, p) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)[0];
    if (generic) {
        return { protocolId: generic.protocolId, source: "lexicon_system", confidence: 0.55, hits: generic.hits, alternatives: [] };
    }
    return null;
}

const isNoneOption = (o) => o.value === "none";

/**
 * Pre-fills answers the patient already gave in their description, so we never ask
 * a question they've already answered. Picks the option with the highest match score.
 */
export function prefillAnswers(protocol, text = "") {
    const tokens = tokenize(text);
    const answers = {};
    for (const q of protocol.questions || []) {
        const scored = q.options
            .filter((o) => !isNoneOption(o))
            .map((o) => {
                let score = 0;
                for (const m of o.match || []) {
                    const r = findPhrase(tokens, m);
                    if (r.found && !r.negated) {
                        score += tokenize(m).length + (m.length >= 10 ? 1 : 0);
                    }
                }
                return { value: o.value, score };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
            answers[q.id] = scored[0].value;
        }
    }
    return answers;
}

/**
 * Maps a patient's reply (chip tap or typed text) to one option of a question.
 * @returns option or null
 */
export function mapAnswerToOption(question, text = "") {
    const clean = normalizeText(text);
    if (!clean) return null;

    // 1. Exact chip label
    const exact = question.options.find((o) => normalizeText(o.label) === clean);
    if (exact) return exact;

    const tokens = tokenize(text);

    // 2. Pure negative reply ("no", "none", "nothing like that")
    if (/^(no|nope|none|nothing|na|nahi|not really|none of these|no nothing)( like that| of these| of them)?$/.test(clean)) {
        return question.options.find(isNoneOption) || null;
    }

    // 3. Match phrases + label token overlap
    const scored = question.options
        .map((o) => {
            let score = 0;
            for (const m of o.match || []) {
                const r = findPhrase(tokens, m);
                if (r.found && !r.negated) score += 2 * tokenize(m).length;
            }
            const labelTokens = tokenize(o.label).filter((t) => t.length > 3);
            const overlap = labelTokens.filter((t) => tokens.includes(t)).length;
            score += overlap;
            return { o, score };
        })
        .filter((s) => s.score > 0 && !isNoneOption(s.o))
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].score >= 2 ? scored[0].o : null;
}

/** Maps a body-system picker reply. */
export function mapSystemPick(text = "") {
    const clean = normalizeText(text);
    return SYSTEM_PICKER.find((s) => normalizeText(s.label) === clean || s.value === clean) || null;
}

/** Lightweight symptom-language heuristics for intent detection. */
const SYMPTOM_CUES = [
    "i have", "i am having", "im having", "i feel", "feel", "feeling", "suffering",
    "pain", "hurts", "hurting", "ache", "aching", "sore", "discomfort", "unwell", "sick",
    "since yesterday", "since morning", "for 2 days", "for 3 days", "happens daily",
    "problem with", "issue with", "wrong with", "something strange", "strange in my body",
    "swelling", "swollen", "bleeding", "burning", "itching", "itchy", "rash", "fever",
    "cough", "vomiting", "nausea", "dizzy", "dizziness", "weakness", "tired", "fatigue",
    "headache", "stomach", "chest", "throat", "skin", "hair", "hairfall", "dard", "bukhar", "khansi"
];

export function hasSymptomCues(text = "") {
    const tokens = tokenize(text);
    return SYMPTOM_CUES.some((c) => {
        const r = findPhrase(tokens, c);
        return r.found;
    });
}

const CANCEL_OR_RESET_REGEX =
    /^(cancel|stop|exit|quit|reset|start\s*over|restart|clear|never\s*mind|nevermind|abort|start\s+a\s+new\s+symptom\s+check|check\s+my\s+symptoms\s+instead|new\s+symptom\s+check)[!.,?\s]*$/i;

const GREETING_OR_PLEASANTRY_REGEX =
    /^(hi|hello|hey|good\s*(morning|afternoon|evening|night)|howdy|greetings|namaste|hola|sup|yo|thanks|thank\s*you|thx|ty|ok|okay|k|cool|great|awesome|got\s*it|understood|alright|bye|goodbye|see\s*ya|nice)(\s+there|\s+doctor|\s+dr\.?\s*pulse|\s+bot|\s+assistant|\s+so\s+much|\s+a\s+lot)?[!.,?\s]*$/i;

const META_OR_NAVIGATION_PHRASES = [
    "open medicine safety",
    "medicine safety checker",
    "check medicine safety",
    "drug safety checker",
    "open drug checker",
    "show general physician",
    "show available doctors",
    "show me doctors",
    "show doctors",
    "find a doctor",
    "list doctors",
    "browse doctors",
    "start a new symptom check",
    "check my symptoms instead",
    "how do video consultations work",
    "how does video consultation",
    "how do i book",
    "how to book",
    "cancel appointment",
    "reschedule appointment",
    "prescription download",
    "download prescription",
    "verify prescription",
    "view my appointments",
    "open my appointments",
    "open my profile",
    "edit my profile",
    "open health hub",
    "who are you",
    "what are you",
    "what is vitalsync",
    "who is vitalsync",
    "about vitalsync",
    "what can you do",
    "what can i do with you",
    "how can you help",
    "how do you work",
    "what is your name"
];

/**
 * Returns true if the message is an explicit session reset / abort command.
 */
export function isCancelOrResetCommand(text = "") {
    const raw = String(text || "").trim();
    return CANCEL_OR_RESET_REGEX.test(raw);
}

/**
 * Returns true if the message is a UI action pill, navigation request, greeting,
 * pleasantry, or platform meta-question that must NEVER be ingested as a medical
 * chief complaint or triage answer.
 */
export function isNonSymptomMetaInput(text = "") {
    const raw = String(text || "").trim();
    if (!raw) return false;
    if (CANCEL_OR_RESET_REGEX.test(raw)) return true;
    if (GREETING_OR_PLEASANTRY_REGEX.test(raw)) return true;

    const lower = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (META_OR_NAVIGATION_PHRASES.some((phrase) => lower.includes(phrase))) {
        return true;
    }
    return false;
}
