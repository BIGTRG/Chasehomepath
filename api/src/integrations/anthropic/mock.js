/**
 * Mock Anthropic adapter. Produces a grounded, non-promissory answer from the member's
 * own context so the agent flow works without calling the real API. Swap for a real
 * adapter (Anthropic Messages API) behind the same interface (spec §10, §11.4).
 */
export function createMockAnthropicAdapter() {
  return {
    name: 'mock',
    /** complete({ system, context, question }) -> { text } */
    async complete({ context, question }) {
      const parts = [];
      parts.push(`You're on day ${context.planDay} of your plan.`);
      if (context.placementEligible) parts.push("You've passed the 90-day minimum for placement.");
      else parts.push(`Placement opens on day 90 — ${context.daysToPlacement} to go.`);

      if (context.credit) {
        parts.push(
          `On credit, I see ${context.credit.disputable} item(s) worth a closer look and ` +
            `${context.credit.accurate} reporting accurately.`,
        );
      }
      if (context.openDisputes > 0) parts.push(`You have ${context.openDisputes} dispute(s) in progress.`);
      if (context.savingsGoals > 0) parts.push(`You're tracking ${context.savingsGoals} savings goal(s).`);

      parts.push(
        `About "${String(question).slice(0, 120)}": here's what your file shows — for anything ` +
          `specific to your situation, your team is the best next step.`,
      );
      return { text: parts.join(' ') };
    },
  };
}
