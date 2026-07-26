import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEscalation, escalationMessage } from '../src/ai/escalation.js';
import { evaluateEligibility } from '../src/assistance/eligibility.js';

// ── Escalation (spec §7.2) ──

test('escalates mortgage-rate questions', () => {
  assert.equal(detectEscalation('What interest rate will I get?').escalate, true);
  assert.equal(detectEscalation('Can you lock my rate?').escalate, true);
});

test('escalates loan-term / amount / approval questions', () => {
  assert.equal(detectEscalation('How much can I borrow?').escalate, true);
  assert.equal(detectEscalation('Am I pre-approved?').escalate, true);
  assert.equal(detectEscalation('What loan terms do I qualify for?').escalate, true);
});

test('escalates legal questions', () => {
  assert.equal(detectEscalation('Is it legal to break this contract?').escalate, true);
  assert.equal(detectEscalation('Should I sign this?').escalate, true);
});

test('does NOT escalate ordinary plan/credit questions', () => {
  assert.equal(detectEscalation('What day of my plan am I on?').escalate, false);
  assert.equal(detectEscalation('How do disputes work?').escalate, false);
  assert.equal(detectEscalation('What are my savings goals?').escalate, false);
});

test('escalation message defers to the team and never answers', () => {
  const msg = escalationMessage('rate');
  assert.match(msg, /licensed|specialist|team/i);
  assert.equal(/\d+%|\d+\s*(day|point)/.test(msg), false); // no numbers/promises
});

// ── Program eligibility (spec §7.3) — rules are data ──

test('eligible when income and credit satisfy the rules', () => {
  const r = evaluateEligibility(
    { maxAnnualIncome: 120000, minCreditScore: 640, amount: 15000 },
    { annualIncome: 60000, creditScore: 680, firstTimeBuyer: true },
  );
  assert.equal(r.eligible, true);
  assert.equal(r.amount, 15000);
});

test('ineligible when income above the limit', () => {
  const r = evaluateEligibility({ maxAnnualIncome: 50000 }, { annualIncome: 90000 });
  assert.equal(r.eligible, false);
  assert.equal(r.amount, 0);
});

test('ineligible when required data is unknown', () => {
  const r = evaluateEligibility({ minCreditScore: 640 }, { creditScore: null });
  assert.equal(r.eligible, false);
});

test('first-time-buyer requirement enforced', () => {
  assert.equal(evaluateEligibility({ firstTimeBuyerRequired: true }, { firstTimeBuyer: false }).eligible, false);
  assert.equal(evaluateEligibility({ firstTimeBuyerRequired: true }, { firstTimeBuyer: true }).eligible, true);
});

test('amountPctOfPrice adds a percentage of purchase price', () => {
  const r = evaluateEligibility({ amountPctOfPrice: 0.03 }, { purchasePrice: 200000, firstTimeBuyer: true });
  assert.equal(r.amount, 6000);
});
