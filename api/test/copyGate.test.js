import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCopy, assertCleanCopy } from '../src/compliance/copyGate.js';
import { ComplianceError } from '../src/lib/errors.js';

test('flags score-raise promises with a number', () => {
  assert.equal(checkCopy('We will raise your score by 40 points').ok, false);
  assert.equal(checkCopy('Boost your FICO 50 points fast').ok, false);
});

test('flags approval-timeline promises', () => {
  assert.equal(checkCopy('You will be approved in 30 days').ok, false);
});

test('flags guarantee language tied to outcomes', () => {
  assert.equal(checkCopy('Guaranteed approval for everyone').ok, false);
  assert.equal(checkCopy('100% removal of collections').ok, false);
});

test('allows honest, non-promissory guidance', () => {
  assert.equal(
    checkCopy('Paying this balance down over time generally helps your credit profile.').ok,
    true,
  );
  assert.equal(checkCopy('You have the right to dispute inaccurate items under the FCRA.').ok, true);
});

test('assertCleanCopy throws ComplianceError on violation', () => {
  assert.throws(() => assertCleanCopy('Raise your score by 100 points'), ComplianceError);
});

test('assertCleanCopy passes clean copy', () => {
  assert.doesNotThrow(() => assertCleanCopy('Here is how disputes work.'));
});
