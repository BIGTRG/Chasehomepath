import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyItem, RULES, FCRA_RIGHTS } from '../src/credit/rulesEngine.js';

const NOW = new Date('2026-07-01T00:00:00Z').getTime();

test('accurate, recognized account with matching balance -> accurate', () => {
  const r = classifyItem(
    { creditor: 'Summit Card', type: 'revolving', balance: 1000, member_recorded_balance: 1000, recognized: true },
    { now: NOW },
  );
  assert.equal(r.classification, 'accurate');
  assert.equal(r.reasons.length, 0);
});

test('material balance mismatch -> disputable (FCRA §611)', () => {
  const r = classifyItem(
    { creditor: 'Metro', type: 'revolving', balance: 940, member_recorded_balance: 300, recognized: true },
    { now: NOW },
  );
  assert.equal(r.classification, 'disputable');
  assert.ok(r.reasons.some((x) => x.id === 'balance_mismatch'));
});

test('unrecognized account -> disputable', () => {
  const r = classifyItem({ creditor: 'Unknown LLC', type: 'collection', balance: 500, recognized: false }, { now: NOW });
  assert.equal(r.classification, 'disputable');
  assert.ok(r.reasons.some((x) => x.id === 'not_recognized'));
});

test('item older than 7 years -> disputable as obsolete (FCRA §605)', () => {
  const r = classifyItem(
    { creditor: 'Old', type: 'collection', balance: 200, member_recorded_balance: 200, recognized: true, first_delinquency_date: '2016-01-01' },
    { now: NOW },
  );
  assert.equal(r.classification, 'disputable');
  assert.ok(r.reasons.some((x) => x.id === 'obsolete'));
});

test('accuracy-first: small balance difference is NOT disputable', () => {
  const r = classifyItem(
    { creditor: 'X', type: 'revolving', balance: 1000, member_recorded_balance: 1010, recognized: true },
    { now: NOW },
  );
  // $10 diff on $1000 is under both the $50 and 5% thresholds.
  assert.equal(r.classification, 'accurate');
});

test('classification is deterministic (same input -> same output)', () => {
  const item = { creditor: 'Metro', type: 'revolving', balance: 940, member_recorded_balance: 300, recognized: true };
  assert.deepEqual(classifyItem(item, { now: NOW }), classifyItem(item, { now: NOW }));
});

test('engine never pre-selects a dispute (output has no filed/selected flag)', () => {
  const r = classifyItem({ creditor: 'Metro', type: 'revolving', balance: 940, member_recorded_balance: 300, recognized: true }, { now: NOW });
  assert.equal('selected' in r, false);
  assert.equal('filed' in r, false);
  assert.equal('dispute' in r, false);
});

test('every item carries the FCRA rights and non-promissory guidance', () => {
  const r = classifyItem({ creditor: 'Summit', type: 'revolving', balance: 1000, member_recorded_balance: 1000, recognized: true }, { now: NOW });
  assert.deepEqual(r.rights, FCRA_RIGHTS);
  // guidance passed the copy gate during classify() (would have thrown otherwise).
  assert.ok(r.guidance_text.length > 0);
});

test('rule set is non-empty and every rule has FCRA grounding', () => {
  assert.ok(RULES.length >= 4);
  for (const rule of RULES) assert.ok(rule.fcra && rule.id);
});
