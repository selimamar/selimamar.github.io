import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGpuBundle, validateGpuMethods, predictPrice } from '../lib/model.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const host = row => .3 * (row.ramGiB / 16) ** .6 * (row.cpuScore / 5000) ** .4;
const increment = row => 1.1 * (row.vramGiB / 16) ** .3 * (row.gpuScore / 100000) ** .9;
function sample() {
  const cpu = [], gpu = [];
  for (let family = 0; family < 5; family++) {
    for (let mask = 0; mask < 16; mask++) {
      const row = { id: `${family}:${mask}`, name: `${family}.${mask}`, provider: 'synthetic', modelFamily: `synthetic:${family}`,
        ramGiB: 16 * Math.exp(mask & 1 ? .8 : -.8), cpuScore: 5000 * Math.exp(mask & 2 ? .7 : -.7),
        vramGiB: 16 * Math.exp(mask & 4 ? .6 : -.6), gpuScore: 100000 * Math.exp(mask & 8 ? .5 : -.5) };
      gpu.push({ ...row, hourlyUsd: host(row) + increment(row) });
      if (mask < 4) cpu.push({ ...row, id: `cpu:${row.id}`, hourlyUsd: host(row) });
    }
  }
  return { cpu, gpu };
}

test('two-stage bundle model recovers additive truth and includes both host inputs', () => {
  const { cpu, gpu } = sample();
  const model = analyzeGpuBundle(cpu, gpu, { bootstrapRepeats: 0 });
  assert.equal(model.fit.kind, 'cpu-plus-gpu');
  assert.equal(model.bootstrap.intervals, null);
  close(model.fit.cpuFit.A, .3); close(model.fit.gpuFit.A, 1.1);
  model.fit.slopes.forEach((value, i) => close(value, [.6, .4, .3, .9][i]));
  gpu.forEach(row => close(predictPrice(model.fit, row), row.hourlyUsd));
  close(model.fit.A, host(model.reference) + increment(model.reference));
  close(model.validation.mape, 0);
  assert.equal(model.validation.testedCount, gpu.length);
});

test('nested model choice and predictions cannot see the withheld CPU or GPU family prices', () => {
  const { cpu, gpu } = sample(), family = 'synthetic:0';
  const original = validateGpuMethods(cpu, gpu);
  const changed = validateGpuMethods(cpu.map(row => ({ ...row, hourlyUsd: row.hourlyUsd * (row.modelFamily === family ? 100 : 1) })), gpu.map(row => ({ ...row, hourlyUsd: row.hourlyUsd * (row.modelFamily === family ? 12 : 1) })));
  assert.deepEqual(original.foldSelections.find(row => row.family === family), changed.foldSelections.find(row => row.family === family));
  const a = original.predictions.filter(row => row.family === family), b = changed.predictions.filter(row => row.family === family);
  assert.equal(a.length, 16);
  a.forEach((row, i) => { close(row.predicted, b[i].predicted); assert.notEqual(row.actual, b[i].actual); });
});

test('a nonpositive GPU remainder invalidates the additive candidate without removing the row', () => {
  const { cpu, gpu } = sample();
  gpu[0].hourlyUsd = host(gpu[0]) / 10;
  const model = analyzeGpuBundle(cpu, gpu, { bootstrapRepeats: 0 });
  const candidate = model.selection.scores.find(row => row.id === 'cpu-plus-gpu');
  assert.equal(candidate.available, false);
  assert.equal(candidate.familyMeanLogMse, null);
  assert.notEqual(model.fit.kind, 'cpu-plus-gpu');
  assert.equal(model.rows.length, gpu.length);
  const comparison = model.validation.methodComparisons.find(row => row.id === 'cpu-plus-gpu');
  assert.equal(comparison.testedCount, 16);
  assert.equal(comparison.skippedGroups.length, 4);
  const partial = validateGpuMethods(cpu, gpu, 'cpu-plus-gpu').commonComparison;
  assert.equal(partial.testedCount, 16);
  assert.ok(Number.isFinite(partial.originalMape));
  assert.ok(Number.isFinite(partial.selectedMape));
  assert.ok(Number.isFinite(partial.nestedMape));
});
