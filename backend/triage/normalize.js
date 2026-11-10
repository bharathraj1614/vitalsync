/**
 * Text normalization & tolerant phrase matching.
 *
 * Patients type with typos ("headche"), compound words ("hairfall" vs "hair fall"),
 * Hinglish ("baal gir rahe") and punctuation noise. Matching here is:
 *   1. word-boundary based (so "fits" never matches inside "benefits"),
 *   2. compound-tolerant for multi-word phrases ("hair fall" == "hairfall"),
 *   3. typo-tolerant for single long words (Levenshtein distance 1, or 2 for 8+ chars),
 *   4. negation-aware ("no fever", "without blood" do not count as positive mentions).
 */

const NEGATORS = new Set([
    "no", "not", "without", "never", "denies", "deny", "dont", "don't", "didnt", "didn't",
    "doesnt", "doesn't", "isnt", "isn't", "nahi", "nhi", "none", "neither", "nor"
]);

export function normalizeText(text = "") {
    return String(text)
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9\u0900-\u097f\s+]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function tokenize(text = "") {
    const n = normalizeText(text);
    return n ? n.split(" ") : [];
}

export function levenshtein(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
        }
    }
    return prev[b.length];
}

function tokenMatches(token, target) {
    if (token === target) return true;
    // Simple plural / verb-form tolerance
    if (token === `${target}s` || token === `${target}es` || `${token}s` === target) return true;
    // Fuzzy matching only for long, specific words and only when the first letter agrees.
    // (Short words like "fever"/"never" are 1 edit apart, so they must match exactly.)
    if (target.length < 6 || token.length < 5 || token[0] !== target[0]) return false;
    const allowed = target.length >= 9 ? 2 : 1;
    return levenshtein(token, target) <= allowed;
}

const VERB_BOUND_NEGATION = new Set([
    "helping", "working", "improving", "stopping", "coming", "moving",
    "feeding", "eating", "drinking", "waking", "passing", "able", "keeping"
]);

function isNegated(tokens, startIdx) {
    for (let k = Math.max(0, startIdx - 3); k < startIdx; k++) {
        if (NEGATORS.has(tokens[k])) {
            // If "not" is part of the target phrase itself or bound to a verb before startIdx ("not helping despite..."),
            // do not treat later tokens after that verb as negated.
            if (k + 1 < startIdx && VERB_BOUND_NEGATION.has(tokens[k + 1])) {
                continue;
            }
            return true;
        }
    }
    return false;
}

/**
 * Finds a phrase in tokenized text. Returns { found, negated }.
 * Multi-word phrases also match their space-less compound form within a single token
 * (e.g. phrase "hair fall" matches token "hairfall").
 */
export function findPhrase(tokens, phrase) {
    const pTokens = tokenize(phrase);
    if (pTokens.length === 0) return { found: false, negated: false, index: -1 };

    // Sliding window token match (with per-token typo tolerance)
    for (let i = 0; i <= tokens.length - pTokens.length; i++) {
        let ok = true;
        for (let j = 0; j < pTokens.length; j++) {
            if (!tokenMatches(tokens[i + j], pTokens[j])) {
                ok = false;
                break;
            }
        }
        if (ok) return { found: true, negated: isNegated(tokens, i), index: i };
    }

    // Compound-word match: "hair fall" ~ "hairfall", "head ache" ~ "headache"
    if (pTokens.length > 1) {
        const compound = pTokens.join("");
        for (let i = 0; i < tokens.length; i++) {
            if (compound.length >= 6 && tokenMatches(tokens[i], compound)) {
                return { found: true, negated: isNegated(tokens, i), index: i };
            }
            if (i < tokens.length - 1 && tokenMatches(tokens[i] + tokens[i + 1], compound)) {
                return { found: true, negated: isNegated(tokens, i), index: i };
            }
        }
    } else if (pTokens[0].length >= 6) {
        // Phrase is a single compound word; text may have split it ("head ache").
        for (let i = 0; i < tokens.length - 1; i++) {
            if (tokenMatches(tokens[i] + tokens[i + 1], pTokens[0])) {
                return { found: true, negated: isNegated(tokens, i), index: i };
            }
        }
    }
    return { found: false, negated: false, index: -1 };
}

/** True if any phrase is mentioned positively (not negated). */
export function mentionsAny(tokensOrText, phrases = []) {
    const tokens = Array.isArray(tokensOrText) ? tokensOrText : tokenize(tokensOrText);
    return phrases.some((p) => {
        const r = findPhrase(tokens, p);
        return r.found && !r.negated;
    });
}

/** Returns the list of phrases mentioned positively. */
export function positiveMentions(tokensOrText, phrases = []) {
    const tokens = Array.isArray(tokensOrText) ? tokensOrText : tokenize(tokensOrText);
    return phrases.filter((p) => {
        const r = findPhrase(tokens, p);
        return r.found && !r.negated;
    });
}
