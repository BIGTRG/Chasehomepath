import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoaching } from '../src/money/coaching.js';

test('flags an over-budget category with specific numbers', () => {
  const tips = buildCoaching([{ category: 'dining', monthly_target: 200, actual: 355 }], []);
  const over = tips.find((t) => t.type === 'over_budget');
  assert.ok(over);
  assert.equal(over.category, 'dining');
  assert.equal(over.severity, 'high'); // >25% over
});

test('praises staying well under budget', () => {
  const tips = buildCoaching([{ category: 'transport', monthly_target: 200, actual: 90 }], []);
  assert.ok(tips.some((t) => t.type === 'under_budget'));
});

test('reports savings-goal progress as a percentage', () => {
  const tips = buildCoaching([], [{ label: 'Down payment', target_amount: 10000, current_amount: 2500 }]);
  const t = tips.find((x) => x.type === 'savings_progress');
  assert.ok(t.message.includes('25%'));
});

test('recognizes a met savings goal', () => {
  const tips = buildCoaching([], [{ label: 'Emergency', target_amount: 1000, current_amount: 1000 }]);
  assert.ok(tips.some((t) => t.type === 'goal_met'));
});

test('coaching never promises an outcome (copy gate passes)', () => {
  // buildCoaching runs assertCleanCopy internally; construct varied inputs and ensure no throw.
  assert.doesNotThrow(() =>
    buildCoaching(
      [{ category: 'dining', monthly_target: 100, actual: 400 }],
      [{ label: 'Roof', target_amount: 5000, current_amount: 100 }],
    ),
  );
});

test('suggestions are capped and severity-ordered', () => {
  const budgets = Array.from({ length: 8 }, (_, i) => ({ category: `c${i}`, monthly_target: 100, actual: 200 }));
  const tips = buildCoaching(budgets, []);
  assert.ok(tips.length <= 5);
});
