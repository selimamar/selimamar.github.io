import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitGpuResourceModel, predictGpuResourcePrice, validateGpuResourceModel, resourceDataSignature, buildGpuResourceDataset,
  fitSingleGpuResourceComparison } from '../lib/gpu-resource-models.js';

const close = (a, b, tolerance = 2e-5) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const baseline = row => 0.25 * (row.ramGiB / 16) ** 0.3 * (row.cpuScore / 5000) ** 0.4;
function synthetic(kind) {
  const cpu = [], gpu = [];
  for (let family = 0; family < 5; family++) for (let mask = 0; mask < 32; mask++) {
    const row = { id: `g${family}:${mask}`, name: `f${family}.${mask}`, provider: family % 2 ? 'one' : 'two', modelFamily: `family${family}`,
      gpuModelGroup: `gpu${mask >> 2}`, gpuCount: 2 ** (family % 3), ramGiB: 16 * (mask & 1 ? 2 : 0.5), cpuScore: 5000 * (mask & 2 ? 3 : 0.4),
      fp32PerGpuTflops: 30 * (mask & 4 ? 2.5 : 0.4), bandwidthPerGpuGBps: 1000 * (mask & 8 ? 2 : 0.6), vramPerGpuGiB: 40 * (mask & 16 ? 1.5 : 0.3) };
    cpu.push({ ...row, id: `cpu${row.id}`, hourlyUsd: baseline(row) });
    const x = [row.fp32PerGpuTflops / 30, row.bandwidthPerGpuGBps / 1000, row.vramPerGpuGiB / 40];
    const contribution = kind === 'additive' ? 0.4 * x[0] + 0.7 * x[1] + 0.2 * x[2] : 0.8 * x[0] ** 0.3 * x[1] ** 0.5 * x[2] ** 0.2;
    gpu.push({ ...row, hourlyUsd: baseline(row) + row.gpuCount * contribution });
  }
  return { cpu, gpu };
}

for (const kind of ['additive', 'multiplicative']) test(`${kind} recovers known independent resource effects with one GPU-count factor`, () => {
  const { cpu, gpu } = synthetic(kind);
  const result = fitGpuResourceModel(cpu, gpu, kind);
  assert.equal(result.status, 'fitted');
  close(result.fit.cpuFit.A, 0.25);
  if (kind === 'additive') result.fit.coefficients.forEach((coefficient, i) => close(coefficient, [0.4, 0.7, 0.2][i]));
  else { close(result.fit.A, 0.8); result.fit.slopes.forEach((value, i) => close(value, [0.3, 0.5, 0.2][i])); }
  const row = gpu[0], one = { ...row, gpuCount: 1 }, four = { ...row, gpuCount: 4 };
  close(predictGpuResourcePrice(result.fit, four) - baseline(four), 4 * (predictGpuResourcePrice(result.fit, one) - baseline(one)));
  const heldout = validateGpuResourceModel(cpu, gpu, kind);
  assert.equal(heldout.coverage, 1);
  assert.equal(heldout.testedCount, gpu.length);
  close(heldout.mape, 0);
});

test('GPU-model holdouts remove test host families from the independently fitted CPU baseline', () => {
  const { cpu, gpu } = synthetic('multiplicative');
  // Put one hardware model exclusively in one host family so its CPU rows can
  // be changed without changing that fold's baseline or GPU training prices.
  const rows = gpu.map(row => ({ ...row, gpuModelGroup: row.modelFamily }));
  const first = validateGpuResourceModel(cpu, rows, 'multiplicative', { groupKey: 'gpuModelGroup' });
  const excluded = first.foldFits[0].excludedCpuFamilies;
  const changedCpu = cpu.map(row => ({ ...row, hourlyUsd: excluded.includes(row.modelFamily) ? row.hourlyUsd * 1000 : row.hourlyUsd }));
  const changedGpu = rows.map(row => ({ ...row, hourlyUsd: excluded.includes(row.modelFamily) ? row.hourlyUsd * 500 : row.hourlyUsd }));
  const second = validateGpuResourceModel(changedCpu, changedGpu, 'multiplicative', { groupKey: 'gpuModelGroup' });
  assert.deepEqual(second.foldFits[0].fit, first.foldFits[0].fit);
  assert.deepEqual(second.foldFits[0].fit.diagnostics.cpuExcludedFamilies, excluded);
  assert.equal(first.coverage, 1);
  assert.ok(second.mape > first.mape);
});

test('machine families receive equal fitting weight independent of their number of sizes', () => {
  const { cpu, gpu } = synthetic('multiplicative');
  const noisy = gpu.map(row => ({ ...row, hourlyUsd: row.hourlyUsd * (row.modelFamily === 'family0' ? 1.4 : 1) }));
  const duplicated = noisy.concat(...Array.from({ length: 7 }, () => noisy.filter(row => row.modelFamily === 'family0')));
  const first = fitGpuResourceModel(cpu, noisy, 'multiplicative'), second = fitGpuResourceModel(cpu, duplicated, 'multiplicative');
  assert.equal(first.status, 'fitted'); assert.equal(second.status, 'fitted');
  close(first.fit.diagnostics.loss, second.fit.diagnostics.loss, 1e-8);
  close(first.fit.A, second.fit.A);
  first.fit.slopes.forEach((value, i) => close(value, second.fit.slopes[i]));
});

test('nonnegative resource terms retain every VM priced at or below the CPU baseline', () => {
  const { cpu, gpu } = synthetic('additive');
  const below = gpu.map(row => ({ ...row, hourlyUsd: baseline(row) * 0.8 }));
  const result = fitGpuResourceModel(cpu, below, 'additive');
  assert.equal(result.status, 'fitted');
  assert.deepEqual(result.fit.coefficients, [0, 0, 0]);
  assert.equal(result.diagnostics.atOrBelowCpuBaselineCount, gpu.length);
  assert.equal(result.diagnostics.gpuTrainingCount, gpu.length);
  const validation = validateGpuResourceModel(cpu, below, 'additive');
  assert.equal(validation.coverage, 1); close(validation.mape, 0.25);
});

test('solver failures expose every failed fold and cannot improve errors by dropping rows', () => {
  const { cpu, gpu } = synthetic('multiplicative');
  const result = fitGpuResourceModel(cpu, gpu, 'multiplicative', { maxIterations: 0 });
  assert.equal(result.status, 'solver-failed'); assert.equal(result.fit, null);
  assert.equal(result.diagnostics.convergedStarts, 0);
  const validation = validateGpuResourceModel(cpu, gpu, 'multiplicative', { maxIterations: 0 });
  assert.equal(validation.coverage, 0); assert.equal(validation.mape, null);
  assert.equal(validation.failedFolds.length, 5); assert.equal(validation.skippedGroups.length, 5);
});

test('rank deficiency and boundary estimates are reported without claiming unique resource values', () => {
  const { cpu, gpu } = synthetic('additive');
  const rows = gpu.map(row => ({ ...row, bandwidthPerGpuGBps: row.fp32PerGpuTflops * 1000 / 30,
    vramPerGpuGiB: row.fp32PerGpuTflops * 40 / 30, hourlyUsd: baseline(row) + row.gpuCount * row.fp32PerGpuTflops / 30 }));
  const result = fitGpuResourceModel(cpu, rows, 'additive');
  assert.equal(result.status, 'fitted');
  assert.equal(result.diagnostics.jacobianRank, 1);
  assert.equal(result.diagnostics.parameterCount, 3);
  assert.equal(result.diagnostics.globalOptimumGuaranteed, false);
  close(result.diagnostics.loss, 0);
});

test('resource eligibility requires CPU Geekbench and per-device specs; aggregate count is divided once', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
  const catalog = read('price-catalog'), sources = ['benchmarks', 'cpu-benchmarks-expanded', 'gpu-cpu-benchmarks', 'sparecores-benchmarks'].map(read);
  const args = [catalog, sources, read('gpu-model-benchmarks'), read('gpu-fp32'), read('gpu-bandwidth')];
  const data = buildGpuResourceDataset(...args, { now: Date.parse(catalog.updatedAt) + 1000 });
  assert.ok(data.gpu.length > 0);
  assert.ok(data.gpu.every(row => row.cpuScore > 0 && row.bandwidthPerGpuGBps > 0 && row.fp32PerGpuTflops > 0 && row.vramPerGpuGiB > 0));
  for (const row of data.gpu) { close(row.fp32PerGpuTflops * row.gpuCount, row.gpuFp32Tflops); close(row.vramPerGpuGiB * row.gpuCount, row.vramGiB); }
  const unavailable = buildGpuResourceDataset(catalog, [], args[2], args[3], args[4], { now: Date.parse(catalog.updatedAt) + 1000 });
  assert.equal(unavailable.gpu.length, 0);
  const signature = resourceDataSignature(...args);
  assert.notEqual(signature, resourceDataSignature(...args.slice(0, 4), { ...args[4], version: 'changed' }));
});

test('partial GPUs and invalid resource observations fail as a whole instead of being silently discarded', () => {
  const { cpu, gpu } = synthetic('additive');
  assert.equal(fitGpuResourceModel(cpu, [{ ...gpu[0], gpuCount: 0.5 }, ...gpu.slice(1)], 'additive').status, 'invalid-data');
  assert.equal(fitGpuResourceModel(cpu, [{ ...gpu[0], fp32PerGpuTflops: null }, ...gpu.slice(1)], 'additive').status, 'invalid-data');
  assert.equal(fitGpuResourceModel([], gpu, 'additive').status, 'baseline-unidentifiable');
});

for (const [key, reference] of [['bandwidthPerGpuGBps', 1000], ['vramPerGpuGiB', 40]]) {
  test(`${key}-only models recover known linear and power effects without requiring unused metrics`, () => {
    for (const kind of ['additive', 'multiplicative']) {
      const { cpu, gpu } = synthetic(kind);
      const rows = gpu.map(original => {
        const row = { ...original, hourlyUsd: baseline(original) + original.gpuCount * 0.65 * (original[key] / reference) ** (kind === 'additive' ? 1 : 0.7) };
        for (const other of ['fp32PerGpuTflops', 'bandwidthPerGpuGBps', 'vramPerGpuGiB']) if (other !== key) delete row[other];
        return row;
      });
      const result = fitGpuResourceModel(cpu, rows, kind, { resourceKeys: [key] });
      assert.equal(result.status, 'fitted');
      assert.deepEqual(result.fit.resourceKeys, [key]);
      assert.equal(result.fit.diagnostics.parameterCount, kind === 'additive' ? 1 : 2);
      if (kind === 'additive') { close(result.fit.coefficients[0], 0.65); close(result.fit.rawCoefficients[0], 0.65 / reference); }
      else { close(result.fit.A, 0.65); close(result.fit.slopes[0], 0.7); }
      rows.forEach(row => close(predictGpuResourcePrice(result.fit, row), row.hourlyUsd));
      const validation = validateGpuResourceModel(cpu, rows, kind, { resourceKeys: [key] });
      assert.equal(validation.coverage, 1); close(validation.mape, 0);
    }
  });
}

test('unused resource changes cannot alter a single-resource fit or its predictions', () => {
  const { cpu, gpu } = synthetic('additive');
  const changed = gpu.map(row => ({ ...row, fp32PerGpuTflops: NaN, vramPerGpuGiB: 1e100 }));
  for (const kind of ['additive', 'multiplicative']) {
    const options = { resourceKeys: ['bandwidthPerGpuGBps'] };
    const first = fitGpuResourceModel(cpu, gpu, kind, options), second = fitGpuResourceModel(cpu, changed, kind, options);
    assert.equal(first.status, 'fitted'); assert.deepEqual(second, first);
    close(predictGpuResourcePrice(first.fit, changed[0]), predictGpuResourcePrice(first.fit, gpu[0]));
  }
  assert.equal(fitGpuResourceModel(cpu, gpu, 'additive', { resourceKeys: [] }).status, 'invalid-data');
  assert.equal(fitGpuResourceModel(cpu, gpu, 'additive', { resourceKeys: ['vcpus'] }).status, 'invalid-data');
  assert.equal(fitGpuResourceModel(cpu, gpu, 'additive', { resourceKeys: ['vramPerGpuGiB', 'vramPerGpuGiB'] }).status, 'invalid-data');
});

test('all four fixed single-resource models refit their exact formula on identical held-out observations', () => {
  const { cpu, gpu } = synthetic('multiplicative');
  const rows = gpu.map(row => ({ ...row, gpuModelGroup: row.modelFamily }));
  const comparison = fitSingleGpuResourceComparison(cpu, rows);
  assert.equal(comparison.variants.length, 4);
  assert.equal(comparison.commonTestedCount, rows.length);
  assert.equal(comparison.commonGpuModelTestedCount, rows.length);
  assert.equal(comparison.sampleCount, rows.length);
  const ids = rows.map(row => row.id).sort();
  for (const variant of comparison.variants) {
    assert.equal(variant.status, 'fitted');
    assert.equal(variant.fit.resourceKeys.length, 1);
    for (const metric of ['validation', 'gpuModelValidation', 'commonValidation', 'commonGpuModelValidation']) {
      assert.deepEqual(variant[metric].predictions.map(row => row.id).sort(), ids);
    }
    for (const metric of ['validation', 'gpuModelValidation']) for (const fold of variant[metric].foldFits) {
      assert.deepEqual(fold.fit.resourceKeys, variant.resourceKeys);
      assert.deepEqual(fold.fit.diagnostics.cpuExcludedFamilies, fold.excludedCpuFamilies);
      assert.equal(fold.fit.diagnostics.gpuTrainingCount + fold.testCount, rows.length);
    }
  }
});

test('default three-resource fits and previously saved predictions retain their original meaning', () => {
  for (const kind of ['additive', 'multiplicative']) {
    const { cpu, gpu } = synthetic(kind);
    const current = fitGpuResourceModel(cpu, gpu, kind);
    assert.equal(current.status, 'fitted');
    assert.deepEqual(current.fit.resourceKeys, ['fp32PerGpuTflops', 'bandwidthPerGpuGBps', 'vramPerGpuGiB']);
    assert.equal(current.diagnostics.starts, kind === 'additive' ? 5 : 6);
    const legacy = { ...current.fit }; delete legacy.resourceKeys;
    gpu.forEach(row => close(predictGpuResourcePrice(legacy, row), predictGpuResourcePrice(current.fit, row), 1e-12));
  }
});
