// Reproducible, prespecified feature ablations. Validation holds complete machine
// families together; the primary feature choice is repeated inside each holdout.
import { buildModelDataset, fitPowerLaw, predictPrice, rSquared, quantile } from './model.js';
import { attachFP32 } from './fp32.js';

export const EXPERIMENT_VERSION = '1.2.0';
const positive = x => Number.isFinite(x) && x > 0;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const unique = xs => [...new Set(xs)];
const refs = { ramGiB: 16, vcpus: 8, cpuScore: 5000, vramGiB: 16, gpuScore: 100000, gpuFp32Tflops: 30, gpuCount: 1 };
const spec = (id, label, keys, type) => ({ id, label, keys, reference: Object.fromEntries(keys.map(key => [key, key === 'ramGiB' && type === 'gpu' ? 32 : refs[key]])) });
export const CPU_EXPERIMENTS = [
  spec('cpu-geekbench', 'RAM + CPU Geekbench', ['ramGiB', 'cpuScore'], 'cpu'),
  spec('cpu-capacity', 'RAM + vCPU count', ['ramGiB', 'vcpus'], 'cpu'),
  spec('cpu-ram-only', 'RAM only', ['ramGiB'], 'cpu'),
  spec('cpu-geekbench-only', 'CPU Geekbench only', ['cpuScore'], 'cpu'),
  spec('cpu-vcpu-only', 'vCPU count only', ['vcpus'], 'cpu'),
];
export const GPU_EXPERIMENTS = [
  spec('gpu-geekbench', 'Host RAM + CPU Geekbench + VRAM + GPU Geekbench', ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore'], 'gpu'),
  spec('gpu-add-fp32', 'All four original variables + FP32', ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-replace-geekbench', 'Host RAM + CPU Geekbench + VRAM + FP32', ['ramGiB', 'cpuScore', 'vramGiB', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-capacity', 'Host RAM + vCPU count + VRAM + FP32', ['ramGiB', 'vcpus', 'vramGiB', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-no-vram', 'Host RAM + vCPU count + FP32', ['ramGiB', 'vcpus', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-no-cpu-benchmark', 'Host RAM + VRAM + FP32', ['ramGiB', 'vramGiB', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-host-fp32', 'Host vCPU count + FP32', ['vcpus', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-host-fp32-count', 'Host vCPU count + FP32 + GPU count', ['vcpus', 'gpuFp32Tflops', 'gpuCount'], 'gpu'),
  spec('gpu-vram-fp32', 'VRAM + FP32', ['vramGiB', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-vram-only', 'VRAM only', ['vramGiB'], 'gpu'),
  spec('gpu-fp32-only', 'FP32 only', ['gpuFp32Tflops'], 'gpu'),
  spec('gpu-geekbench-only', 'GPU Geekbench only', ['gpuScore'], 'gpu'),
];
const CPU_POOL = ['cpu-capacity', 'cpu-ram-only', 'cpu-vcpu-only'];
const GPU_POOL = ['gpu-host-fp32', 'gpu-host-fp32-count', 'gpu-fp32-only'];

function hash(value) {
  let code = 2166136261;
  for (let i = 0; i < value.length; i++) code = Math.imul(code ^ value.charCodeAt(i), 16777619);
  return (code >>> 0).toString(16).padStart(8, '0');
}
export function experimentDataSignature(catalog, cpuSources, gpuModels, fp32Dataset) {
  // Hash all fitting inputs, including provider timestamps and benchmark changes.
  return hash(JSON.stringify([EXPERIMENT_VERSION, catalog.updatedAt, catalog.instances,
    cpuSources.map(source => source?.records), gpuModels, fp32Dataset]));
}
function knownMemory(row, key) {
  const stem = key === 'ramGiB' ? 'ram' : 'vram';
  // Preserve the existing sourced conversion policies, without treating an
  // arbitrary nominal GB label as a verified byte count.
  const capacity = row[`${stem}Capacity`];
  if (!positive(row[key]) || row[`${stem}Unit`] === 'GB' || capacity?.byteConvention === 'unspecified') return null;
  if (capacity?.unit === 'GB') {
    const googlePolicy = row.provider === 'gcp' && /^https:\/\/(?:docs\.)?cloud\.google\.com\//.test(capacity.sourceUrl ?? '')
      && Math.abs(row[key] - capacity.value) < 1e-9;
    const azureConversion = row.provider === 'azure' && /^https:\/\/learn\.microsoft\.com\//.test(capacity.sourceUrl ?? '')
      && Math.abs(row[key] - capacity.value * 1e9 / 2 ** 30) < 1e-9;
    if (!googlePolicy && !azureConversion) return null;
  }
  return row[key];
}
function sharedCpu(row) {
  return /shared|burstable/i.test(row.cpuTenancy ?? '')
    || row.provider === 'aws' && /^t[234][a-z]*\./i.test(row.name)
    || row.provider === 'azure' && /^Standard_B\d/i.test(row.name)
    || row.provider === 'gcp' && /^e2-(micro|small|medium)$/.test(row.name);
}
export function buildExperimentDataset(catalog, cpuSources, gpuModels, fp32Dataset, { now = Date.now() } = {}) {
  const annotated = buildModelDataset(catalog, cpuSources, gpuModels, { now }).annotated;
  const cpu = [], gpu = [], excluded = { stale: 0, sharedCpu: 0, otherAccelerator: 0, fractionalOrUnknownGpu: 0 };
  for (const original of annotated) {
    const time = Date.parse(original.observedAt);
    if (!Number.isFinite(time) || now - time > 36 * 3600000) { excluded.stale++; continue; }
    const row = { ...original, ramGiB: knownMemory(original, 'ramGiB'), vramGiB: knownMemory(original, 'vramGiB') };
    const accelerated = row.acceleratorKind || row.gpu || positive(original.vramGiB);
    if (!accelerated) {
      if (sharedCpu(row)) { excluded.sharedCpu++; continue; }
      cpu.push(row);
      continue;
    }
    if (!row.gpu || row.acceleratorKind && row.acceleratorKind !== 'gpu') { excluded.otherAccelerator++; continue; }
    if (!Number.isInteger(row.gpuCount) || row.gpuCount < 1 || /fraction|partition|shared/i.test(row.gpuAllocation ?? '')) {
      excluded.fractionalOrUnknownGpu++; continue;
    }
    const fp32 = attachFP32(original, fp32Dataset);
    row.gpuFp32Tflops = positive(fp32?.gpuFp32Tflops) ? fp32.gpuFp32Tflops : null;
    row.fp32Provenance = fp32;
    // Hold every variant of the same physical GPU model out together, even
    // when providers publish different peak clocks or memory variants.
    row.gpuModelGroup = ['aws-rtx-pro-6000', 'gcp-rtx-pro-6000'].includes(fp32?.fp32Provenance?.recordId)
      ? 'rtx pro 6000 blackwell server edition'
      : String(row.gpu).toLowerCase().replace(/\b(nvidia|tesla)\b/g, '').replace(/\b\d+\s*g(?:i)?b\b/g, '').replace(/\b(sxm\d*|pcie)\b/g, '').replace(/\s+/g, ' ').trim();
    gpu.push(row);
  }
  const coverage = {
    excluded,
    cpu: { baseCount: cpu.length, knownRamCount: cpu.filter(row => positive(row.ramGiB)).length,
      withCpuBenchmarkCount: cpu.filter(row => positive(row.cpuScore)).length, providers: unique(cpu.map(row => row.provider)) },
    gpu: { baseCount: gpu.length, withFP32Count: gpu.filter(row => positive(row.gpuFp32Tflops)).length,
      withGpuBenchmarkCount: gpu.filter(row => positive(row.gpuScore)).length,
      withCpuBenchmarkCount: gpu.filter(row => positive(row.cpuScore)).length, providers: unique(gpu.map(row => row.provider)) },
  };
  return { cpu, gpu, coverage };
}
export const eligibleRows = (rows, keys) => rows.filter(row => positive(row.hourlyUsd) && keys.every(key => positive(row[key])));
export function experimentFolds(rows, type, groupKey = 'modelFamily') {
  const groups = unique(rows.map(row => row[groupKey])).filter(Boolean).sort();
  if (type !== 'cpu' || groupKey !== 'modelFamily' || groups.length <= 5) return groups.map(group => [group]);
  // Stable assignment uses only group names, never the observed prices.
  const ordered = groups.slice().sort((a, b) => hash(a).localeCompare(hash(b)) || a.localeCompare(b));
  const folds = Array.from({ length: 5 }, () => []);
  ordered.forEach((group, i) => folds[i % 5].push(group));
  return folds;
}
function fit(rows, candidate) {
  return rows.length > candidate.keys.length + 1 ? fitPowerLaw(rows, candidate.keys, candidate.reference) : null;
}
function compactFit(result) {
  if (!result) return null;
  return { A: result.A, logA: result.logA, slopes: result.slopes, keys: result.keys, reference: result.reference,
    logR2: result.logR2, maxVif: result.maxVif };
}
export function validationMetrics(predictions, rows, groups, skippedGroups = [], method = '') {
  const errors = predictions.map(row => Math.abs(row.predicted / row.actual - 1));
  const families = unique(predictions.map(row => row.family));
  const groupMean = fn => mean(families.map(family => mean(predictions.filter(row => row.family === family).map(fn))));
  const completed = unique(predictions.map(row => row.validationGroup));
  return { method, groups, completedGroups: completed.length, skippedGroups,
    testedCount: predictions.length, coverage: rows.length ? predictions.length / rows.length : 0,
    mape: mean(errors), medianApe: quantile(errors, 0.5), familyMape: groupMean(row => Math.abs(row.predicted / row.actual - 1)),
    familyLogMse: groupMean(row => Math.log(row.predicted / row.actual) ** 2),
    rmsle: predictions.length ? Math.sqrt(mean(predictions.map(row => Math.log(row.predicted / row.actual) ** 2))) : null,
    logR2: rSquared(predictions.map(row => Math.log(row.actual)), predictions.map(row => Math.log(row.predicted))),
    priceR2: rSquared(predictions.map(row => row.actual), predictions.map(row => row.predicted)),
    within20: errors.length ? errors.filter(value => value <= 0.2).length / errors.length : null,
    predictions };
}
const methodText = (type, groupKey = 'modelFamily') => groupKey === 'provider'
  ? 'Leave one entire provider out; diagnostic conditional on the feature set selected using all data.'
  : groupKey === 'gpuModelGroup'
    ? 'Leave one entire GPU model out; diagnostic conditional on the feature set selected using all data.'
    : type === 'cpu' ? 'Five deterministic folds of whole provider × machine families; no family appears in its training and test data.'
      : 'Leave one entire provider × machine family out, holding every size and GPU configuration in that family together.';
export function validateExperiment(rows, candidate, type, { groupKey = 'modelFamily', folds = experimentFolds(rows, type, groupKey), fitter = null } = {}) {
  const predictions = [], skipped = [];
  const groupCount = unique(rows.map(row => row[groupKey])).length;
  for (const groups of folds) {
    const withheld = new Set(groups);
    const train = rows.filter(row => !withheld.has(row[groupKey]));
    const test = rows.filter(row => withheld.has(row[groupKey]));
    const result = fitter ? fitter(train, candidate, groups) : fit(train, candidate);
    if (!result) { skipped.push(...groups); continue; }
    const values = test.map(row => predictPrice(result, row));
    // A failure never earns a better error by silently omitting inconvenient rows.
    if (values.some(value => !positive(value))) { skipped.push(...groups); continue; }
    test.forEach((row, i) => predictions.push({ id: row.id, family: row.modelFamily, validationGroup: row[groupKey],
      provider: row.provider, name: row.name, actual: row.hourlyUsd, predicted: values[i] }));
  }
  return validationMetrics(predictions, rows, groupCount, skipped, methodText(type, groupKey));
}
function chooseCandidate(rows, candidates, type) {
  const folds = experimentFolds(rows, type);
  const comparisons = candidates.map(candidate => {
    const validation = validateExperiment(rows, candidate, type, { folds });
    const selectionLoss = validation.coverage === 1 && positive(rows.length) && Number.isFinite(validation.familyLogMse)
      ? validation.familyLogMse : Infinity;
    return { id: candidate.id, label: candidate.label, featureCount: candidate.keys.length, selectionLoss, validation };
  });
  const ordered = comparisons.slice().sort((a, b) => a.selectionLoss - b.selectionLoss || a.featureCount - b.featureCount || a.id.localeCompare(b.id));
  return { chosen: Number.isFinite(ordered[0]?.selectionLoss) ? candidates.find(candidate => candidate.id === ordered[0].id) : null, comparisons };
}
export function nestedExperimentValidation(rows, candidates, type) {
  const predictions = [], skipped = [], foldSelections = [];
  for (const groups of experimentFolds(rows, type)) {
    const withheld = new Set(groups);
    const train = rows.filter(row => !withheld.has(row.modelFamily));
    const test = rows.filter(row => withheld.has(row.modelFamily));
    const selection = chooseCandidate(train, candidates, type);
    const selected = selection.chosen;
    const result = selected ? fit(train, selected) : null;
    const values = result ? test.map(row => predictPrice(result, row)) : [];
    const valid = result && values.every(positive);
    foldSelections.push({ heldOutGroups: groups, trainingRows: train.length, testRows: test.length,
      candidateId: selected?.id ?? null, innerFamilyLogMse: selection.comparisons.find(item => item.id === selected?.id)?.selectionLoss ?? null,
      fit: valid ? compactFit(result) : null });
    if (!valid) { skipped.push(...groups); continue; }
    test.forEach((row, i) => predictions.push({ id: row.id, family: row.modelFamily, validationGroup: row.modelFamily,
      provider: row.provider, name: row.name, actual: row.hourlyUsd, predicted: values[i] }));
  }
  return { ...validationMetrics(predictions, rows, unique(rows.map(row => row.modelFamily)).length, skipped,
    `Nested feature selection: ${methodText(type)} Within each training split, inner family folds select the feature set by equal-family mean squared log error. The outer test prices never select or fit their model.`), foldSelections };
}
export function experimentQuality(validation) {
  if (!validation || validation.testedCount < 10 || validation.completedGroups < 4 || validation.coverage < 0.8) return 'Exploratory fit';
  if (validation.mape <= 0.15 && validation.logR2 >= 0.8) return 'Good predictive fit';
  if (validation.mape <= 0.35 && validation.logR2 >= 0.5) return 'Approximate predictive fit';
  return 'Poor generalization';
}
const compactValidation = ({ predictions, ...rest }) => rest;
function analyze(rows, candidate, type, { includePredictions = false } = {}) {
  const result = fit(rows, candidate);
  const validation = validateExperiment(rows, candidate, type);
  return { id: candidate.id, label: candidate.label, featureKeys: candidate.keys,
    sampleCount: rows.length, familyCount: unique(rows.map(row => row.modelFamily)).length,
    providers: unique(rows.map(row => row.provider)).sort(), gpuModels: type === 'gpu' ? unique(rows.map(row => row.gpuModelGroup)).sort() : [],
    status: result ? 'fitted' : 'not-identifiable', fit: compactFit(result),
    parameters: result ? [{ key: 'A', symbol: 'A', value: result.A }, ...candidate.keys.map((key, i) => ({ key, symbol: ['α', 'β', 'γ', 'δ', 'ε'][i], value: result.slopes[i] }))] : [],
    validation: includePredictions ? validation : compactValidation(validation), quality: experimentQuality(validation),
    warnings: [!result ? 'The feature set cannot be separately identified from this sample.' : null,
      result?.maxVif > 10 ? 'Correlated features make individual exponents unstable; they are not causal resource prices.' : null,
      result?.slopes.some(value => value < 0) ? 'Negative exponents are conditional associations in this sample, not causal discounts.' : null,
      validation.coverage < 1 ? 'Some families could not be predicted; the reported error covers only the explicitly reported test rows.' : null].filter(Boolean) };
}
function pairedComparison(baseRows, candidates, type, id, label) {
  const keys = unique(candidates.flatMap(candidate => candidate.keys));
  const rows = eligibleRows(baseRows, keys);
  const variants = candidates.map(candidate => analyze(rows, candidate, type, { includePredictions: true }));
  const commonIds = rows.map(row => row.id).filter(id => variants.every(variant => variant.validation.predictions.some(row => row.id === id)));
  const commonSet = new Set(commonIds), commonRows = rows.filter(row => commonSet.has(row.id));
  for (const variant of variants) {
    const shared = variant.validation.predictions.filter(row => commonSet.has(row.id));
    variant.commonValidation = compactValidation(validationMetrics(shared, commonRows,
      unique(commonRows.map(row => row.modelFamily)).length, [], 'Identical held-out configurations shared by every candidate in this comparison.'));
    variant.validation = compactValidation(variant.validation);
  }
  return { id, label, sampleCount: rows.length, familyCount: unique(rows.map(row => row.modelFamily)).length,
    variantIds: candidates.map(candidate => candidate.id), commonTestedCount: commonIds.length, commonTestedIds: commonIds, variants,
    note: 'Every candidate is fitted and tested on the same eligible configurations with the same family boundaries. Compare commonValidation errors on the shared tested rows; no row is imputed. These are fixed-feature comparisons, not independent validation of choosing the lowest-error feature set after seeing this table. Memory keeps the established source conventions: Google pricing GB are JEDEC binary, while Azure explicitly decimal GB are converted to GiB. These nominal conventions do not establish equal usable device bytes.' };
}
// This secondary experiment preserves the previously selected additive model.
// It is deliberately outside the prespecified broad-coverage selection pool.
export const GPU_ADDITIVE_EXPERIMENTS = [
  spec('gpu-additive-geekbench', 'Existing CPU baseline + (VRAM × GPU Geekbench) increment', ['vramGiB', 'gpuScore'], 'gpu'),
  spec('gpu-additive-add-fp32', 'Existing additive model + FP32 in GPU increment', ['vramGiB', 'gpuScore', 'gpuFp32Tflops'], 'gpu'),
  spec('gpu-additive-replace-geekbench', 'CPU baseline + (VRAM × FP32) increment', ['vramGiB', 'gpuFp32Tflops'], 'gpu'),
];
export function fitAdditiveExperiment(cpuRows, rows, candidate, excludedFamilies = []) {
  const cpuSpec = CPU_EXPERIMENTS.find(item => item.id === 'cpu-geekbench');
  const cpuFit = fit(eligibleRows(cpuRows, cpuSpec.keys).filter(row => !excludedFamilies.includes(row.modelFamily)), cpuSpec);
  if (!cpuFit) return null;
  const residuals = rows.map(row => ({ ...row, hourlyUsd: row.hourlyUsd - predictPrice(cpuFit, row) }));
  // A negative estimated GPU increment invalidates the entire fit, never just
  // the difficult row. Both price components are estimated, not provider fees.
  if (residuals.some(row => !positive(row.hourlyUsd))) return null;
  const gpuFit = fit(residuals, candidate);
  if (!gpuFit) return null;
  const keys = [...cpuSpec.keys, ...candidate.keys];
  const reference = { ...cpuSpec.reference, ...candidate.reference, ramGiB: 32 };
  const predictions = rows.map(row => predictPrice(cpuFit, row) + predictPrice(gpuFit, row));
  const A = predictPrice(cpuFit, reference) + predictPrice(gpuFit, reference);
  return { kind: 'cpu-plus-gpu', A, logA: Math.log(A), keys, reference,
    slopes: [...cpuFit.slopes, ...gpuFit.slopes], cpuFit: compactFit(cpuFit), gpuFit: compactFit(gpuFit),
    logR2: rSquared(rows.map(row => Math.log(row.hourlyUsd)), predictions.map(Math.log)),
    maxVif: Math.max(cpuFit.maxVif, gpuFit.maxVif) };
}
function additiveComparison(cpuRows, gpuRows) {
  const rows = eligibleRows(gpuRows, ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore', 'gpuFp32Tflops']);
  const variants = GPU_ADDITIVE_EXPERIMENTS.map(candidate => {
    const result = fitAdditiveExperiment(cpuRows, rows, candidate);
    const validation = validateExperiment(rows, candidate, 'gpu', {
      fitter: (train, selected, excluded) => fitAdditiveExperiment(cpuRows, train, selected, excluded),
    });
    validation.method = 'Leave one complete provider × GPU machine family out. Refit the CPU baseline without that family’s CPU-only VMs; refit the GPU increment on remaining GPU families. No nonpositive residuals are dropped.';
    return { id: candidate.id, label: candidate.label, featureKeys: ['ramGiB', 'cpuScore', ...candidate.keys],
      sampleCount: rows.length, familyCount: unique(rows.map(row => row.modelFamily)).length,
      providers: unique(rows.map(row => row.provider)).sort(), fit: result,
      parameters: result ? [
        { key: 'cpuA', symbol: 'A', value: result.cpuFit.A },
        ...result.cpuFit.keys.map((key, i) => ({ key, symbol: ['α', 'β'][i], value: result.cpuFit.slopes[i] })),
        { key: 'gpuB', symbol: 'B', value: result.gpuFit.A },
        ...result.gpuFit.keys.map((key, i) => ({ key, symbol: ['γ', 'δ', 'ε'][i], value: result.gpuFit.slopes[i] })),
      ] : [], validation, quality: experimentQuality(validation) };
  });
  const ids = rows.map(row => row.id).filter(id => variants.every(variant => variant.validation.predictions.some(row => row.id === id)));
  const shared = new Set(ids), commonRows = rows.filter(row => shared.has(row.id));
  for (const variant of variants) {
    variant.commonValidation = compactValidation(validationMetrics(variant.validation.predictions.filter(row => shared.has(row.id)),
      commonRows, unique(commonRows.map(row => row.modelFamily)).length, [], 'Identical additive-method held-out configurations.'));
    variant.validation = compactValidation(variant.validation);
  }
  return { id: 'gpu-existing-additive-fp32', label: 'Add FP32 to the previously selected CPU-baseline + GPU-increment model',
    sampleCount: rows.length, familyCount: unique(rows.map(row => row.modelFamily)).length,
    variantIds: GPU_ADDITIVE_EXPERIMENTS.map(candidate => candidate.id), commonTestedCount: ids.length, commonTestedIds: ids, variants,
    note: 'Exploratory fixed-method comparison on the same configurations: retain the previous CPU-baseline + GPU-increment structure, then add FP32 to or replace GPU Geekbench in its multiplicative increment. Every outer fold excludes its entire family from both stages, including the CPU-only baseline data. Nonpositive residual prices reject the whole fold; no difficult rows are silently dropped. This follow-up does not change the prespecified broad-model selection pool or its nested headline error. Its errors condition on this fixed method; they are not the previous nested method-selection error.' };
}

function predictionRows(rows, result, validation) {
  const predictionMap = new Map(validation.predictions.map(row => [row.id, row.predicted]));
  const compactRow = row => Object.fromEntries(['id', 'provider', 'name', 'modelFamily', 'gpu', 'gpuModelGroup', 'hourlyUsd', 'ramGiB', 'vcpus', 'cpuScore', 'vramGiB', 'gpuScore', 'gpuFp32Tflops', 'gpuCount'].map(key => [key, row[key] ?? null]));
  return rows.map(row => ({ ...compactRow(row), fittedPrice: result ? predictPrice(result, row) : null,
    heldOutPrice: predictionMap.get(row.id) ?? null }));
}
function displayBenchmarkCpu(rows) {
  const candidate = CPU_EXPERIMENTS.find(item => item.id === 'cpu-geekbench');
  const eligible = eligibleRows(rows, candidate.keys);
  const result = analyze(eligible, candidate, 'cpu', { includePredictions: true });
  const providerHoldout = validateExperiment(eligible, candidate, 'cpu', { groupKey: 'provider' });
  providerHoldout.method = 'Leave one entire provider out; diagnostic for the fixed RAM + CPU Geekbench feature set.';
  return { ...result,
    displayReason: 'The displayed CPU model uses RAM and measured CPU Geekbench performance by user preference. Its feature set is fixed; its validation holds whole machine families out without feature selection. The broader vCPU capacity model is saved separately as cpu.selected.',
    rows: predictionRows(eligible, result.fit, result.validation),
    diagnostics: { providerHoldout: compactValidation(providerHoldout) } };
}
function selectPrimary(rows, candidates, type) {
  const selected = chooseCandidate(rows, candidates, type);
  if (!selected.chosen) return { id: null, label: 'No identifiable model', status: 'not-identifiable', sampleCount: rows.length,
    familyCount: unique(rows.map(row => row.modelFamily)).length, providers: unique(rows.map(row => row.provider)), fit: null,
    featureKeys: [], parameters: [], validation: null, quality: 'Exploratory fit', rows: [], selection: { chosenId: null, candidates: [] } };
  const result = analyze(rows, selected.chosen, type);
  const validation = nestedExperimentValidation(rows, candidates, type);
  return { ...result, fixedValidation: result.validation, validation, quality: experimentQuality(validation),
    selection: { chosenId: selected.chosen.id,
      criterion: 'Prespecified feature sets on one shared eligible cohort; choose complete inner family-fold coverage and the lowest mean of each family’s squared log errors. Ties prefer fewer variables. Ordinary log least squares; no tuned regularization.',
      candidates: selected.comparisons.map(candidate => ({ ...candidate, selectionLoss: Number.isFinite(candidate.selectionLoss) ? candidate.selectionLoss : null,
        validation: compactValidation(candidate.validation) })) },
    rows: predictionRows(rows, result.fit, validation),
    diagnostics: { providerHoldout: compactValidation(validateExperiment(rows, selected.chosen, type, { groupKey: 'provider' })),
      ...(type === 'gpu' ? { gpuModelHoldout: compactValidation(validateExperiment(rows, selected.chosen, type, { groupKey: 'gpuModelGroup' })) } : {}) } };
}
export function fitExperiments(catalog, cpuSources, gpuModels, fp32Dataset, options = {}) {
  const data = buildExperimentDataset(catalog, cpuSources, gpuModels, fp32Dataset, options);
  const cpuCandidates = CPU_EXPERIMENTS.filter(candidate => CPU_POOL.includes(candidate.id));
  const gpuCandidates = GPU_EXPERIMENTS.filter(candidate => GPU_POOL.includes(candidate.id));
  const cpu = { variants: CPU_EXPERIMENTS.map(candidate => analyze(eligibleRows(data.cpu, candidate.keys), candidate, 'cpu')),
    comparisons: [pairedComparison(data.cpu, CPU_EXPERIMENTS, 'cpu', 'cpu-benchmark-ablation', 'Does CPU Geekbench improve the same configurations?')],
    displayed: displayBenchmarkCpu(data.cpu),
    selected: selectPrimary(eligibleRows(data.cpu, ['ramGiB', 'vcpus']), cpuCandidates, 'cpu') };
  const byId = id => GPU_EXPERIMENTS.find(candidate => candidate.id === id);
  const gpu = { variants: GPU_EXPERIMENTS.map(candidate => analyze(eligibleRows(data.gpu, candidate.keys), candidate, 'gpu')),
    comparisons: [
      additiveComparison(data.cpu, data.gpu),
      pairedComparison(data.gpu, ['gpu-geekbench', 'gpu-add-fp32', 'gpu-replace-geekbench'].map(byId), 'gpu', 'gpu-add-replace-fp32', 'Add FP32 or replace GPU Geekbench on the same configurations'),
      pairedComparison(data.gpu, ['gpu-replace-geekbench', 'gpu-capacity', 'gpu-no-cpu-benchmark', 'gpu-no-vram', 'gpu-host-fp32', 'gpu-fp32-only'].map(byId), 'gpu', 'gpu-benchmark-ablation', 'Drop CPU Geekbench and memory variables on the same configurations'),
      pairedComparison(data.gpu, ['gpu-capacity', 'gpu-no-vram', 'gpu-host-fp32', 'gpu-vram-fp32', 'gpu-fp32-only'].map(byId), 'gpu', 'gpu-memory-ablation', 'Does memory add value when no Geekbench score is required?'),
    ], selected: selectPrimary(eligibleRows(data.gpu, ['vcpus', 'gpuFp32Tflops', 'gpuCount']), gpuCandidates, 'gpu') };
  const now = options.now ?? Date.now();
  return { experimentVersion: EXPERIMENT_VERSION, generatedAt: new Date(now).toISOString(), priceUpdatedAt: catalog.updatedAt,
    catalogCount: catalog.instances?.length ?? 0, fp32Version: fp32Dataset?.version ?? null,
    sourceDataSignature: experimentDataSignature(catalog, cpuSources, gpuModels, fp32Dataset), coverage: data.coverage,
    methodology: {
      equation: 'Primary and joint models: hourly whole-machine price = A × ∏(feature/reference)^exponent. Ordinary least squares on natural logarithms; predictions estimate the geometric price center. The separately labeled existing-method comparison retains a CPU baseline plus a multiplicative GPU increment, refitting both stages for each holdout.',
      cpuValidation: methodText('cpu'), gpuValidation: methodText('gpu'),
      displayedCpu: 'The website displays the fixed RAM + CPU Geekbench model to retain a measured performance variable. Five whole-family folds validate that fixed formula; no nested feature selection is claimed. The broader RAM/vCPU capacity model and its nested selection results remain saved separately in cpu.selected for comparison.',
      primarySelection: 'CPU candidates share the full source-normalized RAM/vCPU cohort; GPU candidates share the full whole-GPU FP32/vCPU/GPU-count cohort. Sparse Geekbench and memory variants are evaluated separately. Missingness is never allowed to give one competing primary candidate an easier test set.',
      uncertainty: 'Reported errors use nested family holdouts for primary selection, not independent prospective data. Provider/GPU-model holdouts are additional fixed-feature diagnostics. No parameter confidence intervals are estimated for these feature-selection experiments.',
      memory: 'RAM and VRAM use source-normalized nominal GiB under the existing documented conventions: Google pricing GB are JEDEC binary; Azure explicitly decimal GB are converted using 10^9/2^30. These provider conventions do not establish identical usable device memory. Unspecified GB stay missing only for models requiring that variable, and do not block vCPU/FP32-only models. Google convention: https://cloud.google.com/products/compute/gpus-pricing; Azure convention: https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nca100v4-series.',
      fp32: 'Dense conventional FP32 theoretical peak TFLOPS, excluding tensor TF32, reduced precision and sparse modes. Whole identical GPU allocations sum device peaks; this is aggregate arithmetic capacity, not a claim of measured application or multi-GPU scaling.',
      cpu: 'vCPU count is advertised capacity, not a cross-architecture performance benchmark. CPU Geekbench remains measured exact-shape Geekbench 6 Linux without SME; GPU Geekbench is a single-device Geekbench 7 OpenCL model proxy.',
      scope: 'Positive public hourly whole-machine prices observed within 36 hours. Shared/burstable CPU plans, unsupported accelerators and fractional/unknown GPU allocations are excluded. Storage/network bundles, power limits, provider margins and historical benchmark-region differences remain uncontrolled.',
      interpretation: 'Good fit means held-out MAPE ≤15% and log R² ≥0.8; approximate means ≤35% and ≥0.5, with at least 80% test coverage, 10 tested rows and four held-out groups. These descriptive thresholds are not guarantees. Exponents are associations, not marginal provider charges.',
    }, cpu, gpu };
}
