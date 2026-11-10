import digestive from "./digestive.js";
import skin from "./skin.js";
import neuro from "./neuro.js";
import general from "./general.js";
import womenChild from "./womenChild.js";
import generic, { SYSTEM_PICKER } from "./generic.js";
import { BOOKABLE_LIST, IDEAL_SPECIALTIES, URGENCY_ORDER } from "../specialties.js";

/** Specific complaint protocols (matched from free text). */
export const COMPLAINT_PROTOCOLS = [...digestive, ...skin, ...neuro, ...general, ...womenChild];

/** Fallback protocols reachable from the body-system picker. */
export const GENERIC_PROTOCOLS = generic;

export const ALL_PROTOCOLS = [...COMPLAINT_PROTOCOLS, ...GENERIC_PROTOCOLS];

const BY_ID = new Map(ALL_PROTOCOLS.map((p) => [p.id, p]));

export const getProtocol = (id) => BY_ID.get(id) || null;

export { SYSTEM_PICKER };

/**
 * Validates the protocol library at startup so authoring mistakes fail loudly
 * instead of silently routing patients to the wrong doctor.
 */
export function validateProtocols() {
    const errors = [];
    const idealValues = Object.values(IDEAL_SPECIALTIES);
    const checkEffects = (where, e = {}) => {
        if (e.primary && !BOOKABLE_LIST.includes(e.primary)) errors.push(`${where}: primary "${e.primary}" is not bookable`);
        if (e.secondary && !BOOKABLE_LIST.includes(e.secondary)) errors.push(`${where}: secondary "${e.secondary}" is not bookable`);
        if (e.ideal && !idealValues.includes(e.ideal)) errors.push(`${where}: ideal "${e.ideal}" is unknown`);
        if (e.urgency && !URGENCY_ORDER.includes(e.urgency)) errors.push(`${where}: urgency "${e.urgency}" is invalid`);
    };

    const seen = new Set();
    for (const p of ALL_PROTOCOLS) {
        if (seen.has(p.id)) errors.push(`duplicate protocol id ${p.id}`);
        seen.add(p.id);
        checkEffects(`${p.id}.route`, p.route);
        if (!p.route?.primary) errors.push(`${p.id}: missing route.primary`);
        (p.questions || []).forEach((q) => {
            if (!q.options || q.options.length < 2) errors.push(`${p.id}.${q.id}: needs at least 2 options`);
            const values = new Set();
            q.options.forEach((o) => {
                if (values.has(o.value)) errors.push(`${p.id}.${q.id}: duplicate option ${o.value}`);
                values.add(o.value);
                checkEffects(`${p.id}.${q.id}.${o.value}`, o.effects);
            });
        });
        (p.profileRules || []).forEach((r, i) => checkEffects(`${p.id}.profileRules[${i}]`, r.effects));
    }
    for (const s of SYSTEM_PICKER) {
        if (!BY_ID.has(s.protocolId)) errors.push(`system picker → unknown protocol ${s.protocolId}`);
    }
    return errors;
}
