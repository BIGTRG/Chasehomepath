import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSlots, CHECKLIST } from '../src/services/intake.service.js';

test('generateSlots returns future weekday slots only', () => {
  const now = new Date('2026-07-31T12:00:00Z'); // Friday
  const slots = generateSlots(now, 6);
  assert.equal(slots.length, 6);
  for (const iso of slots) {
    const d = new Date(iso);
    assert.ok(d > now, 'slot is in the future');
    assert.ok(d.getDay() !== 0 && d.getDay() !== 6, 'slot is a weekday');
  }
  // Sorted ascending
  const times = slots.map((s) => new Date(s).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('checklist covers the walkthrough items plus tax returns and W-2s (Deon, 2026-09-12)', () => {
  assert.equal(CHECKLIST.length, 10);
  const types = CHECKLIST.map((c) => c.docType);
  for (const t of ['tax_return_1', 'tax_return_2', 'w2_1', 'w2_2']) assert.ok(types.includes(t), t);
  assert.ok(types.includes('photo_id'));
  assert.ok(types.includes('bank_link'));
  assert.ok(types.includes('pay_stub_1'));
  assert.ok(types.includes('pay_stub_2'));
});
