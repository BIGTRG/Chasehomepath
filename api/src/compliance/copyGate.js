import { ComplianceError } from '../lib/errors.js';

/**
 * Copy review gate (spec §8 "No outcome promises").
 *
 * No member-facing string may attach a number or guarantee to an outcome —
 * e.g. "raise your score by 40 points", "approved in 30 days", "guaranteed approval".
 * This gate runs on member-facing copy (guidance_text, messages, AI responses, notifications).
 *
 * It is intentionally conservative: it flags likely-violating phrasing so a human/author
 * fixes it. It is a backstop, not a substitute for careful writing.
 */

// Patterns that pair an outcome with a promise/number.
const OUTCOME_PATTERNS = [
  // "raise/increase/boost your score by 40", "+40 points"
  /\b(raise|increase|boost|improve|add|gain)\b[^.]{0,40}\b(score|points?|fico)\b[^.]{0,20}\b(by\s+)?\d+/i,
  /\b\d+\s*(\+|point|points|pts)\b[^.]{0,20}\b(score|fico|credit)\b/i,
  // "approved in 30 days", "approval in 2 weeks"
  /\bapprov\w*\b[^.]{0,25}\bin\s+\d+\s*(day|days|week|weeks|month|months)\b/i,
  // guarantees tied to outcomes
  /\bguarantee(d|s)?\b[^.]{0,40}\b(approv\w*|score|qualif\w*|result|outcome|removal|delet\w*)\b/i,
  /\b(will|we'?ll)\s+(get you|make you|have you)\b[^.]{0,30}\b(approved|qualified)\b/i,
  // "remove/delete ... guaranteed" or "100% removal" (100% ends in a non-word char,
  // so no trailing \b after it).
  /(\b100\s*%|\bguaranteed\b)[^.]{0,25}\b(remov\w*|delet\w*|approv\w*)\b/i,
  // score-change promises with numbers before the noun: "40 point increase"
  /\b\d+\s*(point|points|pts)\b[^.]{0,20}\b(increase|boost|jump|rise)\b/i,
];

/**
 * Inspect a string. Returns { ok, violations: [{ pattern, match }] }.
 * Never throws — use assertCleanCopy() when you want it to block.
 */
export function checkCopy(text) {
  if (!text || typeof text !== 'string') return { ok: true, violations: [] };
  const violations = [];
  for (const pattern of OUTCOME_PATTERNS) {
    const m = text.match(pattern);
    if (m) violations.push({ pattern: pattern.source, match: m[0] });
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Block on violation. Use before persisting/sending member-facing copy.
 * Throws ComplianceError (403) with the offending fragment.
 */
export function assertCleanCopy(text, context = 'member-facing copy') {
  const { ok, violations } = checkCopy(text);
  if (!ok) {
    throw new ComplianceError(
      `Copy for ${context} appears to promise an outcome (§8 "No outcome promises"): ` +
        `"${violations[0].match}"`,
      'no_outcome_promises',
    );
  }
}

export default { checkCopy, assertCleanCopy };
