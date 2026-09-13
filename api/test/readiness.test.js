import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, monthlyPI, maxPriceForDti, RULES } from '../src/readiness/engine.js';

const base = {
  creditScore: 545, annualIncome: 58000, monthlyDebts: 450, savings: 1200, householdSize: 2, targetArea: 'Raleigh, NC',
  disputableItems: 3, collections: 1, revolvingBalance: 6200,
  docs: { photoId: true, payStubs: 1, w2s: 0, taxReturns: 0, bankLinked: false }, planDay: 0,
};

test('mortgage math: P&I and DTI-bounded price behave', () => {
  const pi = monthlyPI(300000, 0.0675);
  assert.ok(pi > 1900 && pi < 2000, pi);
  const price = maxPriceForDti({ monthlyIncome: 6000, monthlyDebts: 500, backDti: 0.43, downPct: 0.035, rate: 0.0675, extraAnnualPct: 0.0055 });
  assert.ok(price > 200000 && price < 320000, price);
  assert.equal(maxPriceForDti({ monthlyIncome: 1000, monthlyDebts: 900, backDti: 0.43, downPct: 0.035, rate: 0.0675 }), 0);
});

test('weak credit member: not ready, gaps named, extra training assigned, Steady recommended', () => {
  const r = assess(base);
  assert.equal(r.today.readyNow, false);
  assert.match(r.today.headline, /Not ready yet/);
  const fha = r.programs.find((p) => p.code === 'fha');
  assert.equal(fha.downPct, RULES.fha.downHigh); // 545 -> 10% down
  assert.ok(fha.gaps.some((g) => g.code === 'score_soft'));
  assert.ok(fha.gaps.some((g) => g.code === 'collections'));
  assert.ok(r.programs.find((p) => p.code === 'usda').gaps.some((g) => g.code === 'score'));
  assert.ok(r.training.some((t) => t.code === 'credit_deep_dive'));
  assert.ok(r.training.some((t) => t.code === 'rebuild_plan'));
  assert.ok(r.today.documentGaps.includes('W-2s, two years'));
  assert.ok(r.today.documentGaps.includes('Tax returns, two years'));
  assert.equal(r.horizons.length, 3);
  assert.ok(r.horizons[2].scoreRange.high > r.horizons[0].scoreRange.high);
  assert.ok(['steady', 'focused', 'express'].includes(r.recommendedPlan));
  for (const s of JSON.stringify(r).match(/"text":"[^"]+"/g)) assert.ok(!/guarantee|will approve/i.test(s), s);
});

test('strong member: programs ready on paper, but not ready before day 90 and full docs', () => {
  const r = assess({ ...base, creditScore: 700, monthlyDebts: 200, savings: 25000, disputableItems: 0, collections: 0, revolvingBalance: 800, docs: { photoId: true, payStubs: 2, w2s: 2, taxReturns: 2, bankLinked: true }, planDay: 10 });
  assert.equal(r.programs.find((p) => p.code === 'fha').ready, true);
  assert.equal(r.programs.find((p) => p.code === 'conventional').ready, true);
  assert.equal(r.today.readyNow, false); // 90-day rule
  assert.equal(r.recommendedPlan, 'express');
  const r2 = assess({ ...base, creditScore: 700, monthlyDebts: 200, savings: 25000, disputableItems: 0, collections: 0, revolvingBalance: 800, docs: { photoId: true, payStubs: 2, w2s: 2, taxReturns: 2, bankLinked: true }, planDay: 95 });
  assert.equal(r2.today.readyNow, true);
});

test('USDA income limit uses Raleigh MSA figure and hard-blocks when exceeded', () => {
  const r = assess({ ...base, annualIncome: 160000, targetArea: 'Cary, NC' });
  const usda = r.programs.find((p) => p.code === 'usda');
  assert.equal(r.assumptions.usdaIncomeLimit, RULES.usda.incomeLimit14Raleigh);
  assert.ok(usda.gaps.some((g) => g.code === 'income' && g.hard));
  const r2 = assess({ ...base, annualIncome: 130000, targetArea: 'Fayetteville, NC' });
  assert.equal(r2.assumptions.usdaIncomeLimit, RULES.usda.incomeLimit14);
  assert.ok(r2.programs.find((p) => p.code === 'usda').gaps.some((g) => g.code === 'income'));
});

test('no credit report yet: every program asks for it, price is null', () => {
  const r = assess({ ...base, creditScore: null });
  assert.equal(r.today.estimatedMaxPrice, null);
  for (const p of r.programs) assert.ok(p.gaps.some((g) => g.code === 'no_score'));
});
