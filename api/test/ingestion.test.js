import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMlsRecord, qualityCheck } from '../src/ingestion/normalize.js';

test('normalizes a RESO residential record to a house listing', () => {
  const n = normalizeMlsRecord({
    ListingKey: 'MLS-1', StandardStatus: 'Active', PropertyType: 'Residential',
    ListPrice: 250000, UnparsedAddress: '1 Main St', Latitude: 35.9, Longitude: -78.9,
    BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1300,
  });
  assert.equal(n.type, 'house');
  assert.equal(n.source, 'mls');
  assert.equal(n.status, 'active');
  assert.equal(n.mls_ref, 'MLS-1');
  assert.deepEqual(n.geo, { lat: 35.9, lng: -78.9 });
});

test('maps Land to a lot with null beds/baths', () => {
  const n = normalizeMlsRecord({ ListingKey: 'MLS-2', PropertyType: 'Land', ListPrice: 50000, UnparsedAddress: 'Lot 1', StandardStatus: 'Active' });
  assert.equal(n.type, 'lot');
  assert.equal(n.beds, null);
});

test('quality gate passes a complete house record', () => {
  const n = normalizeMlsRecord({ ListingKey: 'MLS-3', PropertyType: 'Residential', ListPrice: 200000, UnparsedAddress: '2 Oak', StandardStatus: 'Active', BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1200 });
  assert.equal(qualityCheck(n).ok, true);
});

test('quality gate rejects missing price / address', () => {
  const n = normalizeMlsRecord({ ListingKey: 'MLS-4', PropertyType: 'Residential', ListPrice: 0, UnparsedAddress: '', StandardStatus: 'Active', BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1200 });
  const q = qualityCheck(n);
  assert.equal(q.ok, false);
  assert.ok(q.issues.includes('missing or non-positive price'));
  assert.ok(q.issues.includes('missing address'));
});

test('quality gate rejects a record without an mls_ref', () => {
  const n = normalizeMlsRecord({ PropertyType: 'Residential', ListPrice: 200000, UnparsedAddress: '3 Elm', StandardStatus: 'Active', BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1200 });
  assert.equal(qualityCheck(n).ok, false);
});
