import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canBePlacementReady,
  assertPlacementReady,
  canRenderScore,
  isOnboardingComplete,
  assertMemberInitiated,
  MIN_PLAN_DAY_FOR_PLACEMENT,
} from '../src/compliance/rules.js';
import { ComplianceError } from '../src/lib/errors.js';

test('90-day minimum blocks placement before day 90', () => {
  assert.equal(canBePlacementReady(89), false);
  assert.equal(canBePlacementReady(90), true);
  assert.equal(MIN_PLAN_DAY_FOR_PLACEMENT, 90);
  assert.throws(() => assertPlacementReady(10), ComplianceError);
  assert.doesNotThrow(() => assertPlacementReady(90));
});

test('score is withheld until first consultation is complete', () => {
  assert.equal(canRenderScore({ firstConsultationCompleted: false }), false);
  assert.equal(canRenderScore({ firstConsultationCompleted: true }), true);
});

test('onboarding gate requires complete stage and verified licenses', () => {
  assert.equal(isOnboardingComplete({ stage: 'training', licenses: [] }), false);
  assert.equal(
    isOnboardingComplete({
      stage: 'complete',
      licenses: [{ status: 'active', verified_at: '2026-01-01' }],
    }),
    true,
  );
  assert.equal(
    isOnboardingComplete({
      stage: 'complete',
      licenses: [{ status: 'expired', verified_at: '2026-01-01' }],
    }),
    false,
  );
});

test('disputes must be member-initiated (non-null actor)', () => {
  assert.throws(() => assertMemberInitiated(null), ComplianceError);
  assert.doesNotThrow(() => assertMemberInitiated('some-user-uuid'));
});
