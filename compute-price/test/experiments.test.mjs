import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CPU_EXPERIMENTS, GPU_EXPERIMENTS, buildExperimentDataset, eligibleRows, experimentDataSignature,
  experimentFolds, validateExperiment, nestedExperimentValidation, experimentQuality, GPU_ADDITIVE_EXPERIMENTS, fitAdditiveExperiment } from '../lib/experiments.js';

const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const now = Date.parse('2026-09-29T06:00:00Z');
const base = { observedAt: '2026-09-29T05:30:00Z', hourlyUsd: 1, vcpus: 8, ramGiB: 32, cpuTenancy: 'dedicated-vCPU' };
const fp32 = JSON.parse(readFileSync(new URL('../data/gpu-fp32.json', import.meta.url)));
const syntheticRows = (groups = 8) => Array.from({ length: groups }, (_, family) => Array.from({ length: 8 }, (_, mask) => {
  const vcpus = 8 * Math.exp(mask & 1 ? 0.8 : -0.6);
  const ramGiB = 16 * Math.exp(mask & 2 ? 1 : -0.7);
  const gpuFp32Tflops = 30 * Math.exp(mask & 4 ? 1.1 : -0.5);
  return { id: `${family}-${mask}`, name: `f${family}.${mask}`, provider: family % 2 ? 'a' : 'b',
    modelFamily: `family-${family}`, ramGiB, vcpus, gpuFp32Tflops,
    hourlyUsd: 0.35 * (ramGiB / 16) ** 0.4 * (vcpus / 8) ** 0.7 };
})).flat();

test('feature-specific missing memory preserves CPU and GPU capacity-only eligibility', () => {
  const catalog = { instances: [
    { ...base, id: 'oracle:cpu', provider: 'oracle', name: 'VM.Standard.E4.Flex', ramUnit: 'GB', ramCapacity: { value: 32, unit: 'GB', byteConvention: 'unspecified' } },
    { ...base, provider: 'ibm', name: 'gx3-16x80x1l4', gpu: 'NVIDIA L4', gpuCount: 1, acceleratorKind: 'gpu', vramGiB: 24,
      vramCapacity: { value: 24, unit: 'GB', byteConvention: 'unspecified' } },
  ] };
  const data = buildExperimentDataset(catalog, [], null, fp32, { now });
  assert.equal(data.cpu.length, 1);
  assert.equal(data.cpu[0].ramGiB, null);
  assert.equal(eligibleRows(data.cpu, ['vcpus']).length, 1);
  assert.equal(eligibleRows(data.cpu, ['vcpus', 'ramGiB']).length, 0);
  assert.equal(data.gpu[0].vramGiB, null);
  assert.equal(eligibleRows(data.gpu, ['vcpus', 'gpuFp32Tflops']).length, 1);
  assert.equal(eligibleRows(data.gpu, ['vcpus', 'vramGiB', 'gpuFp32Tflops']).length, 0);
});

test('nominal GB are accepted only under the documented Google or Azure conversion policy', () => {
  const gpu = { ...base, gpu: 'NVIDIA T4', gpuCount: 1, acceleratorKind: 'gpu' };
  const instances = [
    { ...gpu, provider: 'gcp', name: 'n1-standard-8 + 1× T4', vramGiB: 16,
      vramCapacity: { value: 16, unit: 'GB', sourceUrl: 'https://docs.cloud.google.com/compute/docs/gpus' } },
    { ...gpu, provider: 'azure', name: 'Standard_NC8as_T4_v3', vramGiB: 16e9 / 2 ** 30,
      vramCapacity: { value: 16, unit: 'GB', sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/ncast4v3-series' } },
    { ...gpu, provider: 'ibm', name: 'gx3-8x40x1t4', vramGiB: 16,
      vramCapacity: { value: 16, unit: 'GB', sourceUrl: 'https://cloud.ibm.com/docs/vpc' } },
    { ...gpu, provider: 'azure', name: 'Standard_bad_conversion', vramGiB: 16,
      vramCapacity: { value: 16, unit: 'GB', sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/ncast4v3-series' } },
  ];
  const data = buildExperimentDataset({ instances }, [], null, fp32, { now });
  assert.equal(data.gpu[0].vramGiB, 16);
  close(data.gpu[1].vramGiB, 16e9 / 2 ** 30);
  assert.equal(data.gpu[2].vramGiB, null);
  assert.equal(data.gpu[3].vramGiB, null);
});

test('stale prices, partial GPUs, burstable CPUs and non-GPU accelerators cannot enter broad experiments', () => {
  const instances = [
    { ...base, provider: 'aws', name: 'm6i.large', observedAt: '2026-09-26T00:00:00Z' },
    { ...base, provider: 'aws', name: 't3.large' },
    { ...base, provider: 'alibaba', name: 'ecs.entry.large', cpuTenancy: 'shared-vCPU' },
    { ...base, provider: 'azure', name: 'Standard_B4ms' },
    { ...base, provider: 'gcp', name: 'e2-medium' },
    { ...base, provider: 'alibaba', name: 'ecs.partial', gpu: 'NVIDIA T4', gpuCount: 1, gpuAllocation: 'fractional' },
    { ...base, provider: 'aws', name: 'inf2.xlarge', acceleratorKind: 'inferentia' },
  ];
  const data = buildExperimentDataset({ instances }, [], null, fp32, { now });
  assert.equal(data.cpu.length, 0);
  assert.equal(data.gpu.length, 0);
  assert.deepEqual(data.coverage.excluded, { stale: 1, sharedCpu: 4, otherAccelerator: 1, fractionalOrUnknownGpu: 1 });
});

test('GPU-model holdouts unify cross-provider RTX aliases and A10 prefixes without merging A10G', () => {
  const rows = [
    { provider: 'aws', name: 'g7e.2xlarge', gpu: 'NVIDIA RTX PRO Server 6000', gpuCount: 1 },
    { provider: 'gcp', name: 'g4-standard-48', gpu: 'NVIDIA RTX PRO 6000 Blackwell Server Edition', gpuCount: 1 },
    { provider: 'azure', name: 'Standard_NV36ads_A10_v5', gpu: 'A10', gpuCount: 1 },
    { provider: 'oracle', name: 'VM.GPU.A10.1', gpu: 'NVIDIA A10', gpuCount: 1 },
    { provider: 'aws', name: 'g5.xlarge', gpu: 'NVIDIA A10G', gpuCount: 1 },
  ];
  const data = buildExperimentDataset({ instances: rows.map(row => ({ ...base, ...row, acceleratorKind: 'gpu' })) }, [], null, fp32, { now });
  assert.equal(data.gpu[0].gpuModelGroup, data.gpu[1].gpuModelGroup);
  assert.equal(data.gpu[2].gpuModelGroup, data.gpu[3].gpuModelGroup);
  assert.notEqual(data.gpu[3].gpuModelGroup, data.gpu[4].gpuModelGroup);
  const folds = experimentFolds(data.gpu, 'gpu', 'gpuModelGroup');
  assert.equal(folds.length, 3);
});

test('family-held-out predictions recover a known power law and never split sizes across training and test', () => {
  const rows = syntheticRows();
  const candidate = CPU_EXPERIMENTS.find(row => row.id === 'cpu-capacity');
  const validation = validateExperiment(rows, candidate, 'cpu');
  assert.equal(validation.coverage, 1);
  assert.equal(validation.testedCount, rows.length);
  close(validation.mape, 0);
  close(validation.logR2, 1);
  const folds = experimentFolds(rows, 'cpu');
  assert.equal(folds.length, 5);
  assert.equal(new Set(folds.flat()).size, 8);
  assert.equal(folds.flat().length, 8);
});

test('nested feature choice and coefficients do not see the outer-held-out prices', () => {
  const rows = syntheticRows();
  const candidates = CPU_EXPERIMENTS.filter(row => ['cpu-capacity', 'cpu-ram-only', 'cpu-vcpu-only'].includes(row.id));
  const first = nestedExperimentValidation(rows, candidates, 'cpu');
  const targetGroups = first.foldSelections[0].heldOutGroups;
  const changed = rows.map(row => ({ ...row, hourlyUsd: targetGroups.includes(row.modelFamily) ? row.hourlyUsd * 1000 : row.hourlyUsd }));
  const second = nestedExperimentValidation(changed, candidates, 'cpu');
  assert.deepEqual(second.foldSelections[0].heldOutGroups, targetGroups);
  assert.equal(second.foldSelections[0].candidateId, first.foldSelections[0].candidateId);
  assert.deepEqual(second.foldSelections[0].fit, first.foldSelections[0].fit);
  assert.equal(first.coverage, 1);
  close(first.mape, 0);
  assert.ok(second.mape > first.mape);
});

test('rank-deficient candidates cannot win by omitting hard validation groups', () => {
  const rows = syntheticRows().map(row => ({ ...row, ramGiB: row.vcpus * 2, hourlyUsd: row.vcpus * 0.1 }));
  const capacity = CPU_EXPERIMENTS.find(row => row.id === 'cpu-capacity');
  const rejected = validateExperiment(rows, capacity, 'cpu');
  assert.equal(rejected.coverage, 0);
  assert.equal(rejected.testedCount, 0);
  assert.equal(rejected.mape, null);
  const result = nestedExperimentValidation(rows, [capacity, CPU_EXPERIMENTS.find(row => row.id === 'cpu-vcpu-only')], 'cpu');
  assert.equal(result.coverage, 1);
  assert.ok(result.foldSelections.every(row => row.candidateId === 'cpu-vcpu-only'));
  close(result.mape, 0);
});

test('the FP32 addition compares all five original-plus-new predictors without dropping a coefficient', () => {
  const candidate = GPU_EXPERIMENTS.find(row => row.id === 'gpu-add-fp32');
  assert.equal(candidate.keys.length, 5);
  const slopes = [0.2, 0.3, 0.4, 0.5, 0.6];
  const rows = Array.from({ length: 4 }, (_, g) => Array.from({ length: 32 }, (_, mask) => {
    const row = { id: `${g}-${mask}`, provider: 'test', name: `${g}-${mask}`, modelFamily: `f${g}` };
    candidate.keys.forEach((key, i) => { row[key] = candidate.reference[key] * Math.exp(mask & (1 << i) ? 0.8 : -0.4); });
    row.hourlyUsd = 2 * candidate.keys.reduce((product, key, i) => product * (row[key] / candidate.reference[key]) ** slopes[i], 1);
    return row;
  })).flat();
  const validation = validateExperiment(rows, candidate, 'gpu');
  assert.equal(validation.testedCount, 128);
  close(validation.mape, 0);
  close(validation.logR2, 1);
});

test('model quality requires held-out accuracy, coverage and independent groups', () => {
  const valid = { testedCount: 30, completedGroups: 5, coverage: 1, mape: 0.12, logR2: 0.91 };
  assert.equal(experimentQuality(valid), 'Good predictive fit');
  assert.equal(experimentQuality({ ...valid, mape: 0.3 }), 'Approximate predictive fit');
  assert.equal(experimentQuality({ ...valid, mape: 0.45 }), 'Poor generalization');
  assert.equal(experimentQuality({ ...valid, completedGroups: 3 }), 'Exploratory fit');
  assert.equal(experimentQuality({ ...valid, coverage: 0.5 }), 'Exploratory fit');
});

test('cached reports become invalid after a price, benchmark or FP32 source edit', () => {
  const catalog = { updatedAt: '2026-09-29', instances: [{ ...base, provider: 'aws', name: 'm6i.xlarge' }] };
  const sources = [{ records: [{ name: 'm6i.xlarge', score: 1234 }] }];
  const before = experimentDataSignature(catalog, sources, null, fp32);
  assert.equal(experimentDataSignature(catalog, sources, null, fp32), before);
  assert.notEqual(experimentDataSignature({ ...catalog, instances: [{ ...catalog.instances[0], hourlyUsd: 2 }] }, sources, null, fp32), before);
  assert.notEqual(experimentDataSignature(catalog, [{ records: [{ name: 'm6i.xlarge', score: 9999 }] }], null, fp32), before);
  assert.notEqual(experimentDataSignature(catalog, sources, null, { ...fp32, version: 'changed' }), before);
});

test('additive FP32 comparison recovers known components and excludes withheld CPU families from both stages', () => {
  const cpuRows = [], gpuRows = [];
  const baseline = row => 0.2 * (row.ramGiB / 16) ** 0.3 * (row.cpuScore / 5000) ** 0.4;
  for (let g = 0; g < 4; g++) {
    for (let mask = 0; mask < 32; mask++) {
      const row = { id: `${g}:${mask}`, provider: 'test', name: `${g}:${mask}`, modelFamily: `f${g}`,
        ramGiB: 16 * Math.exp(mask & 1 ? 0.7 : -0.5), cpuScore: 5000 * Math.exp(mask & 2 ? 0.8 : -0.3),
        vramGiB: 16 * Math.exp(mask & 4 ? 0.9 : -0.6), gpuScore: 100000 * Math.exp(mask & 8 ? 0.5 : -0.4),
        gpuFp32Tflops: 30 * Math.exp(mask & 16 ? 0.6 : -0.7) };
      cpuRows.push({ ...row, id: `cpu:${row.id}`, hourlyUsd: baseline(row) });
      gpuRows.push({ ...row, hourlyUsd: baseline(row) + 0.7 * (row.vramGiB / 16) ** 0.5 * (row.gpuScore / 100000) ** 0.6 * (row.gpuFp32Tflops / 30) ** 0.7 });
    }
  }
  const candidate = GPU_ADDITIVE_EXPERIMENTS.find(row => row.id === 'gpu-additive-add-fp32');
  const result = fitAdditiveExperiment(cpuRows, gpuRows, candidate);
  close(result.cpuFit.A, 0.2);
  close(result.gpuFit.A, 0.7);
  result.gpuFit.slopes.forEach((value, i) => close(value, [0.5, 0.6, 0.7][i]));
  const validation = validateExperiment(gpuRows, candidate, 'gpu', {
    fitter: (train, chosen, excluded) => fitAdditiveExperiment(cpuRows, train, chosen, excluded),
  });
  close(validation.mape, 0);
  assert.equal(validation.coverage, 1);
  const trainingGpu = gpuRows.filter(row => row.modelFamily !== 'f0');
  const before = fitAdditiveExperiment(cpuRows, trainingGpu, candidate, ['f0']);
  const corrupted = cpuRows.map(row => ({ ...row, hourlyUsd: row.modelFamily === 'f0' ? row.hourlyUsd * 1000 : row.hourlyUsd }));
  const after = fitAdditiveExperiment(corrupted, trainingGpu, candidate, ['f0']);
  assert.deepEqual(after, before);
  assert.equal(fitAdditiveExperiment(cpuRows, gpuRows.map(row => ({ ...row, hourlyUsd: 0.001 })), candidate), null);
});
