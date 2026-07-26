/**
 * Escalation classifier for the member AI agent (spec §7.2) — deterministic, runs BEFORE
 * any model call. The agent must escalate any question about mortgage rates, loan terms,
 * or legal advice to a licensed human, state it can't answer, and offer to connect the
 * assigned specialist. Keyword/pattern based so it's auditable and can't be talked around.
 */

const PATTERNS = [
  // Rates
  { topic: 'rate', re: /\b(interest\s+rates?|apr|my\s+rate|what\s+rate|points?\b|rate\s+lock|lock\s+my\s+rate)\b/i },
  // Loan terms / amounts / approval
  { topic: 'term', re: /\b(loan\s+terms?|how\s+much\s+(can|could)\s+i\s+(borrow|afford|get)|pre[-\s]?approv\w*|qualif\w*\s+for\s+(a\s+)?(loan|mortgage|amount)|down\s*payment\s+required|dti|debt[-\s]to[-\s]income|amortiz\w*|which\s+loan\s+(should|is\s+best))\b/i },
  // Legal advice
  { topic: 'legal', re: /\b(is\s+(it|this)\s+legal|legal\s+advice|sue|lawsuit|attorney|lawyer|contract\s+terms?|liabilit\w*|should\s+i\s+sign|statute|my\s+rights\s+in\s+court)\b/i },
];

/**
 * @returns {{ escalate: boolean, topic: string|null }}
 */
export function detectEscalation(question) {
  if (!question || typeof question !== 'string') return { escalate: false, topic: null };
  for (const p of PATTERNS) {
    if (p.re.test(question)) return { escalate: true, topic: p.topic };
  }
  return { escalate: false, topic: null };
}

/** Fixed, non-promissory escalation message. Never answers the underlying question. */
export function escalationMessage(topic) {
  const subject =
    topic === 'rate' ? 'mortgage rates'
      : topic === 'term' ? 'loan terms or amounts'
        : 'legal questions';
  return (
    `That's a question about ${subject}, which needs a licensed member of your team. ` +
    `I can't answer it here, but I can connect you with your assigned specialist — ` +
    `want me to let them know you have a question?`
  );
}
