import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnlocked, defaultConditionForPhase } from '../src/education/unlock.js';

const ctx = (over = {}) => ({ planDay: 0, planStatus: 'active', trackProgress: {}, ...over });

test('empty/absent condition is unlocked', () => {
  assert.equal(isUnlocked(null, ctx()), true);
  assert.equal(isUnlocked({}, ctx()), true);
});

test('minPlanDay gates until the day is reached', () => {
  assert.equal(isUnlocked({ minPlanDay: 45 }, ctx({ planDay: 10 })), false);
  assert.equal(isUnlocked({ minPlanDay: 45 }, ctx({ planDay: 45 })), true);
});

test('requiresPlanStatus gates on plan status ("after you own it")', () => {
  assert.equal(isUnlocked({ requiresPlanStatus: 'completed' }, ctx({ planStatus: 'active' })), false);
  assert.equal(isUnlocked({ requiresPlanStatus: 'completed' }, ctx({ planStatus: 'completed' })), true);
});

test('requiresTrack gates on track progress', () => {
  const cond = { requiresTrack: { track: 'credit', minPct: 50 } };
  assert.equal(isUnlocked(cond, ctx({ trackProgress: { credit: 20 } })), false);
  assert.equal(isUnlocked(cond, ctx({ trackProgress: { credit: 80 } })), true);
});

test('all conditions must pass together', () => {
  const cond = { minPlanDay: 30, requiresTrack: { track: 'budget', minPct: 25 } };
  assert.equal(isUnlocked(cond, ctx({ planDay: 40, trackProgress: { budget: 10 } })), false);
  assert.equal(isUnlocked(cond, ctx({ planDay: 40, trackProgress: { budget: 40 } })), true);
});

test('phase defaults: before open, during day-gated, after status-gated', () => {
  assert.deepEqual(defaultConditionForPhase('before'), { minPlanDay: 0 });
  assert.equal(defaultConditionForPhase('during').minPlanDay > 0, true);
  assert.equal(defaultConditionForPhase('after').requiresPlanStatus, 'completed');
});
