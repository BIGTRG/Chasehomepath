import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  principalAndInterest,
  estimatedMonthly,
  evaluateFit,
  allInCost,
} from '../src/marketplace/estimate.js';

test('principal & interest is positive and lower with assistance', () => {
  const pi = principalAndInterest(200000);
  assert.ok(pi > 0);
  // 30yr @6.5% on 200k ≈ $1264/mo
  assert.ok(pi > 1200 && pi < 1320);
});

test('estimatedMonthly drops when assistance is applied', () => {
  const base = estimatedMonthly(200000, { assistance: 0 });
  const withHelp = estimatedMonthly(200000, { assistance: 20000 });
  assert.ok(withHelp < base);
});

test('estimatedMonthly returns null for non-positive price', () => {
  assert.equal(estimatedMonthly(0), null);
  assert.equal(estimatedMonthly(null), null);
});

test('fit: adequate lot fits; tight lot does not', () => {
  const plan = { sqft: 1200, foundation: 'slab' };
  assert.equal(evaluateFit({ sqft: 6000, foundation: 'slab' }, plan).fits, true);
  assert.equal(evaluateFit({ sqft: 2600, foundation: 'slab' }, plan).fits, false);
});

test('fit: foundation mismatch fails even on a big lot', () => {
  const plan = { sqft: 1200, foundation: 'crawlspace' };
  const res = evaluateFit({ sqft: 9000, foundation: 'slab' }, plan);
  assert.equal(res.fits, false);
  assert.match(res.reason, /[Ff]oundation/);
});

test('all-in cost = lot price + midpoint build estimate', () => {
  const total = allInCost({ price: 40000 }, { est_build_low: 180000, est_build_high: 220000 });
  assert.equal(total, 40000 + 200000);
});
