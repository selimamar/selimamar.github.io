// Log-linear least squares, with machine-family holdouts and cluster-bootstrap intervals.
// Shared by the browser and the reproducible offline report; no synthetic benchmark scores.
import { fitLogModel } from './regression.js';

export const MODEL_VERSION = '4.1.0';
export const MODEL_SPECS = {
  cpu: { label: 'CPU instances', keys: ['ramGiB', 'cpuScore'], symbols: ['α', 'β'], reference: { ramGiB: 16, cpuScore: 5000 } },
  gpu: { label: 'Single-GPU instances', keys: ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore'], symbols: ['α', 'β', 'γ', 'δ'], reference: { ramGiB: 32, cpuScore: 5000, vramGiB: 16, gpuScore: 100000 } },
};
const positive = value => Number.isFinite(value) && value > 0;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const dot = (a, b) => a.reduce((total, value, i) => total + value * b[i], 0);
export function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * q, lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

// Reorthogonalized modified Gram-Schmidt QR. A rank-deficient fit is refused, not regularized silently.
function qrSolve(matrix, target) {
  const n = matrix.length, p = matrix[0].length;
  if (n < p) return null;
  const q = [], r = Array.from({ length: p }, () => Array(p).fill(0));
  for (let j = 0; j < p; j++) {
    const v = matrix.map(row => row[j]);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < j; i++) {
        const projection = dot(q[i], v);
        r[i][j] += projection;
        for (let k = 0; k < n; k++) v[k] -= projection * q[i][k];
      }
    }
    r[j][j] = Math.sqrt(dot(v, v));
    if (!Number.isFinite(r[j][j]) || r[j][j] < 1e-8 * Math.sqrt(n)) return null;
    q.push(v.map(value => value / r[j][j]));
  }
  const coefficients = q.map(col => dot(col, target));
  for (let i = p - 1; i >= 0; i--) {
    for (let j = i + 1; j < p; j++) coefficients[i] -= r[i][j] * coefficients[j];
    coefficients[i] /= r[i][i];
  }
  const inverseR = Array.from({ length: p }, () => Array(p).fill(0));
  for (let col = 0; col < p; col++) {
    for (let i = p - 1; i >= 0; i--) {
      let value = i === col ? 1 : 0;
      for (let k = i + 1; k < p; k++) value -= r[i][k] * inverseR[k][col];
      inverseR[i][col] = value / r[i][i];
    }
  }
  return { coefficients, inverseDiagonal: inverseR.map(row => dot(row, row)) };
}

export function fitPowerLaw(rows, keys, reference) {
  const p = keys.length + 1;
  if (rows.length < p || rows.some(row => !positive(row.hourlyUsd) || keys.some(key => !positive(row[key])))) return null;
  const x = rows.map(row => keys.map(key => Math.log(row[key] / reference[key])));
  const centers = keys.map((_, j) => mean(x.map(row => row[j])));
  const scales = keys.map((_, j) => Math.sqrt(mean(x.map(row => (row[j] - centers[j]) ** 2))));
  if (scales.some(value => value < 1e-10)) return null;
  const matrix = x.map(row => [1, ...row.map((v, j) => (v - centers[j]) / scales[j])]);
  const solved = qrSolve(matrix, rows.map(row => Math.log(row.hourlyUsd)));
  if (!solved) return null;
  const slopes = solved.coefficients.slice(1).map((v, j) => v / scales[j]);
  const logA = solved.coefficients[0] - dot(slopes, centers);
  const coefficientValues = [logA, ...slopes];
  const predictions = rows.map((row, i) => Math.exp(logA + dot(slopes, x[i])));
  if (!positive(Math.exp(logA)) || predictions.some(value => !positive(value))) return null;
  return { A: Math.exp(logA), logA, slopes, coefficientValues, keys, reference, predictions,
    maxVif: Math.max(...solved.inverseDiagonal.slice(1).map(value => value * rows.length)),
    logR2: rSquared(rows.map(row => Math.log(row.hourlyUsd)), predictions.map(Math.log)) };
}

export function predictPrice(fit, row) {
  if (!fit || fit.keys.some(key => !positive(row[key]))) return null;
  if (fit.kind === 'cpu-plus-gpu') return predictPrice(fit.cpuFit, row) + predictPrice(fit.gpuFit, row);
  return Math.exp(fit.logA + fit.keys.reduce((sum, key, i) => sum + fit.slopes[i] * Math.log(row[key] / fit.reference[key]), 0));
}

export function rSquared(actual, predicted) {
  if (!actual.length || actual.length !== predicted.length) return null;
  const average = mean(actual);
  const total = actual.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return total > 0 ? 1 - actual.reduce((sum, value, i) => sum + (value - predicted[i]) ** 2, 0) / total : null;
}

export function machineFamily(instance) {
  if (instance.provider === 'aws') return `aws:${instance.name.split('.')[0]}`;
  if (instance.provider === 'azure') return `azure:${instance.name.replace(/^Standard_/i, '').replace(/^([a-z]+)\d+/i, '$1')}`;
  if (instance.provider === 'gcp') return `gcp:${instance.name.split('-')[0]}`;
  return `${instance.provider}:${instance.family || instance.name.replace(/\d+/g, '#')}`;
}

export function crossValidate(rows, spec) {
  const families = [...new Set(rows.map(row => row.modelFamily))].sort();
  const predictions = [], skipped = [];
  for (const family of families) {
    const train = rows.filter(row => row.modelFamily !== family);
    const test = rows.filter(row => row.modelFamily === family);
    const fit = fitPowerLaw(train, spec.keys, spec.reference);
    if (!fit || train.length <= spec.keys.length + 1) { skipped.push(family); continue; }
    const baselineKey = spec.keys[0];
    const baseline = fitPowerLaw(train, [baselineKey], { [baselineKey]: spec.reference[baselineKey] });
    for (const row of test) {
      const predicted = predictPrice(fit, row);
      if (!positive(predicted)) continue;
      predictions.push({ id: row.id, family, provider: row.provider, name: row.name,
        actual: row.hourlyUsd, predicted, baseline: predictPrice(baseline, row),
        errorPercent: 100 * (predicted / row.hourlyUsd - 1) });
    }
  }
  const errors = predictions.map(row => Math.abs(row.predicted / row.actual - 1));
  const baselineErrors = predictions.filter(row => positive(row.baseline)).map(row => Math.abs(row.baseline / row.actual - 1));
  return { method: 'Leave one entire provider × machine family out; every size in that family is withheld together.',
    groups: families.length, completedGroups: families.length - skipped.length, skippedGroups: skipped,
    testedCount: predictions.length, coverage: rows.length ? predictions.length / rows.length : 0,
    logR2: rSquared(predictions.map(row => Math.log(row.actual)), predictions.map(row => Math.log(row.predicted))),
    priceR2: rSquared(predictions.map(row => row.actual), predictions.map(row => row.predicted)),
    mape: errors.length ? mean(errors) : null, medianApe: quantile(errors, 0.5),
    rmsle: predictions.length ? Math.sqrt(mean(predictions.map(row => Math.log(row.predicted / row.actual) ** 2))) : null,
    within20: errors.length ? errors.filter(error => error <= 0.2).length / errors.length : null,
    baselineKey: spec.keys[0], baselineTestedCount: baselineErrors.length,
    baselineMape: baselineErrors.length ? mean(baselineErrors) : null, predictions };
}

function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function bootstrap(rows, spec, repeats) {
  if (repeats <= 0) return { repeats, successful: 0, intervals: null, reason: 'Bootstrap disabled.' };
  const groups = [...new Set(rows.map(row => row.modelFamily))].map(family => rows.filter(row => row.modelFamily === family));
  if (groups.length < 4) return { repeats, successful: 0, intervals: null, reason: 'Fewer than four independent machine families.' };
  const rng = random(20260929), draws = [];
  for (let b = 0; b < repeats; b++) {
    const sample = groups.flatMap(() => groups[Math.floor(rng() * groups.length)]);
    const fit = fitPowerLaw(sample, spec.keys, spec.reference);
    if (fit && sample.length > spec.keys.length + 1) draws.push([fit.A, ...fit.slopes]);
  }
  if (draws.length < repeats * 0.8) return { repeats, successful: draws.length, intervals: null, reason: 'Too many bootstrap samples were not identifiable.' };
  return { repeats, successful: draws.length, intervals: [0, ...spec.keys].map((_, j) => [quantile(draws.map(row => row[j]), 0.025), quantile(draws.map(row => row[j]), 0.975)]), reason: null };
}

export function analyzeModel(rows, type, { bootstrapRepeats = 400 } = {}) {
  const spec = MODEL_SPECS[type];
  const base = { type, label: spec.label, sampleCount: rows.length, familyCount: new Set(rows.map(row => row.modelFamily)).size,
    providers: [...new Set(rows.map(row => row.provider))], reference: spec.reference, featureKeys: spec.keys,
    gpuModels: [...new Set(rows.map(row => row.gpuBenchmark?.gpu ?? row.gpu).filter(Boolean))],
    rows: rows.map(row => ({ ...row })) };
  const fit = rows.length > spec.keys.length + 1 ? fitPowerLaw(rows, spec.keys, spec.reference) : null;
  if (!fit) return { ...base, status: 'not-identifiable', quality: 'Not enough independent variation',
    explanation: rows.length < spec.keys.length + 2 ? `This model needs more than ${spec.keys.length + 1} fully benchmarked configurations to estimate its ${spec.keys.length + 1} parameters and a residual error.` : 'The available predictors are constant or collinear. Separate coefficients cannot be identified.',
    parameters: [], validation: null, fit: null, bootstrap: null };
  const validation = crossValidate(rows, spec), uncertainty = bootstrap(rows, spec, bootstrapRepeats);
  const warnings = [];
  if (base.sampleCount < 20) warnings.push('Small fitting sample: these estimates are exploratory.');
  if (base.providers.length === 1) warnings.push(`The fitted sample covers only ${base.providers[0]}; this is not a cross-provider market estimate.`);
  if (fit.maxVif > 10) warnings.push('Resources are strongly correlated; individual exponents are unstable and are not causal component prices.');
  if (fit.slopes.some(value => value < 0)) warnings.push('At least one fitted exponent is negative. It reflects correlations in the sample, not a claim that adding that resource makes a machine cheaper.');
  if (validation.coverage < 1) warnings.push('Some held-out families could not be predicted because the remaining training data had too few observations or too little independent variation.');
  if (uncertainty.reason) warnings.push(uncertainty.reason);
  if (type === 'gpu') {
    warnings.push('GPU scores are hardware-model chart proxies, not measurements of each rented VM.');
    warnings.push('This model predicts the full GPU-equipped VM rental, including host CPU and system RAM. It is not a standalone GPU component price.');
    warnings.push('Several configurations share the same GPU model and score. Validation withholds VM families, not necessarily unseen GPU models.');
  }
  let quality = 'Poor generalization';
  if (validation.mape !== null && validation.coverage >= 0.8) {
    if (validation.mape <= 0.15 && validation.logR2 >= 0.8) quality = 'Good predictive fit';
    else if (validation.mape <= 0.35 && validation.logR2 >= 0.5) quality = 'Approximate predictive fit';
  }
  if (rows.length < 12 || validation.testedCount < 10) quality = validation.mape > 0.35 ? 'Unreliable exploratory fit' : 'Exploratory fit';
  const parameters = [{ key: type === 'gpu' ? 'B' : 'A', symbol: type === 'gpu' ? 'B' : 'A', value: fit.A, interval: uncertainty.intervals?.[0] ?? null },
    ...spec.keys.map((key, i) => ({ key, symbol: spec.symbols[i], value: fit.slopes[i], interval: uncertainty.intervals?.[i + 1] ?? null }))];
  const marginalPrices = Object.fromEntries(spec.keys.map((key, i) => [key, fit.slopes[i] * fit.A / spec.reference[key] * (key.endsWith('Score') ? 1000 : 1)]));
  return { ...base, status: 'fitted', quality, explanation: 'Ordinary least squares on natural logarithms. Predictions describe the geometric center of prices, not the arithmetic mean.',
    parameters, fit: { A: fit.A, logA: fit.logA, slopes: fit.slopes, keys: fit.keys, reference: fit.reference, logR2: fit.logR2, maxVif: fit.maxVif },
    validation, bootstrap: uncertainty, warnings, marginalPrices,
    rawScaleA: Math.exp(fit.logA - spec.keys.reduce((sum, key, i) => sum + fit.slopes[i] * Math.log(spec.reference[key]), 0)),
    rows: rows.map((row, i) => ({ ...row, fittedPrice: fit.predictions[i], heldOutPrice: validation.predictions.find(pred => pred.id === row.id)?.predicted ?? null })) };
}

// GPU methods retain the host contribution. Method/penalty selection uses only
// inner training-family folds; the outer withheld family never tunes its fit.
export const GPU_CANDIDATES = [
  { id: 'joint-ols', kind: 'joint', label: 'Joint multiplicative model', lambda: 0, nonnegative: false },
  ...[0.001, 0.01, 0.1, 1, 10].flatMap(lambda => [false, true].map(nonnegative => ({
    id: `joint-ridge-${lambda}-${nonnegative ? 'positive' : 'free'}`, kind: 'joint',
    label: `${nonnegative ? 'Nonnegative ridge' : 'Ridge'} · λ ${lambda}`, lambda, nonnegative,
  }))),
  { id: 'cpu-plus-gpu', kind: 'cpu-plus-gpu', label: 'CPU baseline + GPU increment', lambda: 0, nonnegative: false },
];
const GPU_INCREMENT_SPEC = { keys: ['vramGiB', 'gpuScore'], reference: { vramGiB: 16, gpuScore: 100000 } };

function gpuCandidateFitter(cpuRows) {
  const cpuFits = new Map();
  return (rows, candidate, excludedFamilies = []) => {
    const spec = MODEL_SPECS.gpu;
    if (candidate.kind === 'joint') {
      const fit = candidate.lambda === 0
        ? (rows.length > spec.keys.length + 1 ? fitPowerLaw(rows, spec.keys, spec.reference) : null)
        : fitLogModel(rows, spec.keys, spec.reference, candidate);
      return fit ? { ...fit, kind: 'joint', methodId: candidate.id, methodLabel: candidate.label } : null;
    }
    const cacheKey = excludedFamilies.slice().sort().join('|');
    if (!cpuFits.has(cacheKey)) cpuFits.set(cacheKey, fitPowerLaw(cpuRows.filter(row => !excludedFamilies.includes(row.modelFamily)), MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference));
    const cpuFit = cpuFits.get(cacheKey);
    if (!cpuFit || rows.length <= 3) return null;
    const residualRows = rows.map(row => ({ ...row, hourlyUsd: row.hourlyUsd - predictPrice(cpuFit, row) }));
    // Never turn an impossible decomposition into a better fit by dropping rows.
    if (residualRows.some(row => !positive(row.hourlyUsd))) return null;
    const gpuFit = fitPowerLaw(residualRows, GPU_INCREMENT_SPEC.keys, GPU_INCREMENT_SPEC.reference);
    if (!gpuFit) return null;
    const predictions = rows.map(row => predictPrice(cpuFit, row) + predictPrice(gpuFit, row));
    const A = predictPrice(cpuFit, spec.reference) + predictPrice(gpuFit, spec.reference);
    return { kind: 'cpu-plus-gpu', methodId: candidate.id, methodLabel: candidate.label,
      keys: spec.keys, reference: spec.reference, A, logA: Math.log(A),
      slopes: [...cpuFit.slopes, ...gpuFit.slopes], cpuFit, gpuFit, predictions,
      logR2: rSquared(rows.map(row => Math.log(row.hourlyUsd)), predictions.map(Math.log)),
      maxVif: Math.max(cpuFit.maxVif, gpuFit.maxVif) };
  };
}

function selectGpuCandidate(rows, fitCandidate, excludedFamilies = [], candidates = GPU_CANDIDATES) {
  const groups = [...new Set(rows.map(row => row.modelFamily))].sort();
  const scores = candidates.map(candidate => {
    const losses = []; let testedCount = 0;
    for (const family of groups) {
      const fit = fitCandidate(rows.filter(row => row.modelFamily !== family), candidate, [...excludedFamilies, family]);
      const test = rows.filter(row => row.modelFamily === family);
      if (!fit) continue;
      const errors = test.map(row => Math.log(predictPrice(fit, row) / row.hourlyUsd) ** 2);
      if (errors.some(value => !Number.isFinite(value))) continue;
      losses.push(mean(errors)); testedCount += test.length;
    }
    const fit = fitCandidate(rows, candidate, excludedFamilies);
    return { ...candidate, familyMeanLogMse: losses.length === groups.length && groups.length >= 3 && fit ? mean(losses) : null,
      completedFamilies: losses.length, totalFamilies: groups.length, testedCount, available: Boolean(fit) };
  });
  const valid = scores.filter(score => Number.isFinite(score.familyMeanLogMse)).sort((a, b) => a.familyMeanLogMse - b.familyMeanLogMse || a.id.localeCompare(b.id));
  const chosen = valid[0] ?? null;
  return { chosen, scores, groups: groups.length,
    criterion: 'Mean squared log-price error, averaged equally over inner held-out machine families. Only candidates with complete inner validation are eligible.' };
}

function predictionMetrics(predictions, rows, groups, skippedGroups = []) {
  const errors = predictions.map(row => Math.abs(row.predicted / row.actual - 1));
  const familyErrors = [...new Set(predictions.map(row => row.family))].map(family => mean(predictions.filter(row => row.family === family).map(row => Math.abs(row.predicted / row.actual - 1))));
  return { groups: groups.length, completedGroups: groups.length - skippedGroups.length, skippedGroups,
    testedCount: predictions.length, coverage: rows.length ? predictions.length / rows.length : 0,
    mape: errors.length ? mean(errors) : null, familyMape: familyErrors.length ? mean(familyErrors) : null,
    medianApe: quantile(errors, 0.5), within20: errors.length ? errors.filter(error => error <= 0.2).length / errors.length : null,
    logR2: rSquared(predictions.map(row => Math.log(row.actual)), predictions.map(row => Math.log(row.predicted))),
    priceR2: rSquared(predictions.map(row => row.actual), predictions.map(row => row.predicted)),
    rmsle: predictions.length ? Math.sqrt(mean(predictions.map(row => Math.log(row.predicted / row.actual) ** 2))) : null,
    predictions };
}

export function validateGpuMethods(cpuRows, rows, selectedMethodId = null) {
  const groups = [...new Set(rows.map(row => row.modelFamily))].sort();
  const fitCandidate = gpuCandidateFitter(cpuRows);
  const predictions = [], foldSelections = [], skipped = [];
  const comparisonPredictions = new Map(GPU_CANDIDATES.map(candidate => [candidate.id, []]));
  for (const family of groups) {
    const train = rows.filter(row => row.modelFamily !== family), test = rows.filter(row => row.modelFamily === family);
    const selection = selectGpuCandidate(train, fitCandidate, [family]);
    const selectedFit = selection.chosen ? fitCandidate(train, selection.chosen, [family]) : null;
    foldSelections.push({ family, trainingRows: train.length, testRows: test.length,
      methodId: selection.chosen?.id ?? null, innerFamilyLogMse: selection.chosen?.familyMeanLogMse ?? null });
    if (!selectedFit) skipped.push(family);
    for (const candidate of GPU_CANDIDATES) {
      const fit = fitCandidate(train, candidate, [family]);
      if (!fit) continue;
      for (const row of test) comparisonPredictions.get(candidate.id).push({ id: row.id, family, provider: row.provider, name: row.name, actual: row.hourlyUsd, predicted: predictPrice(fit, row) });
    }
    if (selectedFit) for (const row of test) predictions.push({ id: row.id, family, provider: row.provider, name: row.name, actual: row.hourlyUsd, predicted: predictPrice(selectedFit, row), methodId: selection.chosen.id });
  }
  const methodComparisons = GPU_CANDIDATES.map(candidate => {
    const pred = comparisonPredictions.get(candidate.id), completed = new Set(pred.map(row => row.family));
    const metrics = predictionMetrics(pred, rows, groups, groups.filter(group => !completed.has(group)));
    const { predictions: unused, ...summary } = metrics;
    return { id: candidate.id, label: candidate.label, kind: candidate.kind, lambda: candidate.lambda, nonnegative: candidate.nonnegative, ...summary };
  });
  // Improvement claims must compare the same configurations, even when one
  // method cannot fit a sparse family and therefore has lower total coverage.
  const validById = input => new Map(input.filter(row => positive(row.actual) && positive(row.predicted)).map(row => [row.id, row]));
  const nestedById = validById(predictions);
  const originalById = validById(comparisonPredictions.get('joint-ols') ?? []);
  const selectedById = validById(comparisonPredictions.get(selectedMethodId) ?? []);
  const commonIds = [...nestedById.keys()].filter(id => originalById.has(id) && selectedById.has(id));
  const commonMape = byId => commonIds.length ? mean(commonIds.map(id => Math.abs(byId.get(id).predicted / byId.get(id).actual - 1))) : null;
  const commonComparison = selectedMethodId ? {
    selectedMethodId, testedCount: commonIds.length,
    originalMape: commonMape(originalById), selectedMape: commonMape(selectedById), nestedMape: commonMape(nestedById),
  } : null;
  return { ...predictionMetrics(predictions, rows, groups, skipped),
    method: 'Nested provider × machine-family holdouts: choose the model form and ridge penalty on inner training-family folds, then predict the untouched outer family. CPU-baseline training excludes both inner and outer withheld families.',
    foldSelections, methodComparisons, commonComparison,
    baselineMape: methodComparisons.find(row => row.id === 'joint-ols')?.mape ?? null,
    baselineTestedCount: methodComparisons.find(row => row.id === 'joint-ols')?.testedCount ?? 0,
    baselineLabel: 'Original joint multiplicative model', baselineKey: null };
}

function bundleParameterValues(fit) {
  return fit.kind === 'cpu-plus-gpu' ? [fit.cpuFit.A, ...fit.cpuFit.slopes, fit.gpuFit.A, ...fit.gpuFit.slopes] : [fit.A, ...fit.slopes];
}

function bootstrapGpu(cpuRows, rows, candidate, repeats) {
  const resamplingMethod = candidate.kind === 'cpu-plus-gpu'
    ? 'Stratified family bootstrap: resample GPU families with replacement and use the same multiplicities for their CPU rows; independently resample the remaining CPU-only families. The selected method is held fixed.'
    : 'Resample entire GPU machine families with replacement. The selected method and penalty are held fixed.';
  const metadata = { conditionalOnSelectedMethod: true, resamplingMethod };
  if (repeats <= 0) return { repeats, successful: 0, intervals: null, reason: 'Bootstrap disabled.', ...metadata };
  const groupRows = input => new Map([...new Set(input.map(row => row.modelFamily))].map(family => [family, input.filter(row => row.modelFamily === family)]));
  const cpuGroups = groupRows(cpuRows), gpuGroups = groupRows(rows);
  const gpuFamilies = [...gpuGroups.keys()];
  const cpuOnlyFamilies = [...cpuGroups.keys()].filter(family => !gpuGroups.has(family));
  if (gpuFamilies.length < 4) return { repeats, successful: 0, intervals: null, reason: 'Fewer than four independent GPU machine families.', ...metadata };
  const rng = random(20261001), draws = [];
  const sampleFamilies = families => families.map(() => families[Math.floor(rng() * families.length)]);
  for (let index = 0; index < repeats; index++) {
    const drawnGpuFamilies = sampleFamilies(gpuFamilies);
    const sampledGpu = drawnGpuFamilies.flatMap(family => gpuGroups.get(family));
    const sampledCpu = candidate.kind === 'cpu-plus-gpu'
      ? [...drawnGpuFamilies.flatMap(family => cpuGroups.get(family) ?? []), ...sampleFamilies(cpuOnlyFamilies).flatMap(family => cpuGroups.get(family))]
      : cpuRows;
    const fit = gpuCandidateFitter(sampledCpu)(sampledGpu, candidate);
    if (fit) draws.push(bundleParameterValues(fit));
  }
  const sufficient = draws.length >= 0.8 * repeats;
  return { repeats, successful: draws.length, intervals: sufficient ? draws[0].map((_, j) => [quantile(draws.map(row => row[j]), 0.025), quantile(draws.map(row => row[j]), 0.975)]) : null,
    reason: sufficient ? null : 'Too many family-bootstrap samples could not identify a valid model.',
    ...metadata };
}

export function analyzeGpuBundle(cpuRows, rows, { bootstrapRepeats = 400 } = {}) {
  const base = analyzeModel(rows, 'gpu', { bootstrapRepeats: 0 });
  const fitter = gpuCandidateFitter(cpuRows), selection = selectGpuCandidate(rows, fitter);
  if (!selection.chosen) return { ...base, selection, warnings: [...(base.warnings ?? []), 'Too few independent families to validate method selection; showing the original multiplicative fit.'] };
  const fit = fitter(rows, selection.chosen), validation = validateGpuMethods(cpuRows, rows, selection.chosen.id);
  const uncertainty = bootstrapGpu(cpuRows, rows, selection.chosen, bootstrapRepeats);
  const values = bundleParameterValues(fit);
  const definitions = fit.kind === 'cpu-plus-gpu'
    ? [['A', 'A', 'CPU baseline USD/hour'], ['ramGiB', 'α', 'RAM'], ['cpuScore', 'β', 'CPU performance'], ['B', 'B', 'GPU increment USD/hour'], ['vramGiB', 'γ', 'VRAM'], ['gpuScore', 'δ', 'GPU performance']]
    : [['B', 'B', 'Reference USD/hour'], ...MODEL_SPECS.gpu.keys.map((key, i) => [key, MODEL_SPECS.gpu.symbols[i], null])];
  const parameters = definitions.map(([key, symbol, label], i) => ({ key, symbol, label, value: values[i], interval: uncertainty.intervals?.[i] ?? null }));
  const featureVif = fit.kind === 'cpu-plus-gpu' ? fit.maxVif : (base.fit?.maxVif ?? null);
  const warnings = [
    'GPU scores are hardware-model proxies. The fitted response is the whole VM rental, including CPU and system RAM.',
    `${base.familyCount} GPU machine families cover ${rows.length} configurations; repeated GPU models and related sizes are not independent hardware measurements.`,
    'This is nested cross-validation on the observed sample, not a separate prospective test. Future pricing and new GPU generations can differ.',
  ];
  if (fit.kind === 'cpu-plus-gpu') warnings.push('The CPU baseline and GPU increment are estimated contributions, not provider component charges. Both stages are refitted without each withheld family.');
  if (fit.slopes.some(value => value < 0)) warnings.push('A negative exponent describes correlations in this sample, not a claim that adding that resource causes a discount.');
  if (featureVif > 10) warnings.push('Some resource predictors are strongly correlated; individual exponents remain uncertain.');
  if (validation.coverage < 1) warnings.push('Some families lacked sufficient training data for nested method selection and could not be tested.');
  if (uncertainty.reason) warnings.push(uncertainty.reason);
  let quality = 'Poor generalization';
  if (Number.isFinite(validation.mape) && Number.isFinite(validation.logR2) && validation.coverage >= 0.8 && validation.mape <= 0.35 && validation.logR2 >= 0.5) quality = 'Approximate predictive fit';
  if (Number.isFinite(validation.mape) && Number.isFinite(validation.logR2) && validation.coverage >= 0.8 && validation.mape <= 0.15 && validation.logR2 >= 0.8) quality = 'Good predictive fit';
  if (rows.length < 12 || validation.testedCount < 10) quality = 'Exploratory fit';
  const compactFit = model => ({ A: model.A, logA: model.logA, slopes: model.slopes, keys: model.keys, reference: model.reference, logR2: model.logR2, maxVif: model.maxVif });
  const resultFit = { ...compactFit(fit), maxVif: featureVif, kind: fit.kind, methodId: fit.methodId, methodLabel: fit.methodLabel, lambda: selection.chosen.lambda, nonnegative: selection.chosen.nonnegative,
    ...(fit.kind === 'cpu-plus-gpu' ? { cpuFit: compactFit(fit.cpuFit), gpuFit: compactFit(fit.gpuFit) } : {}) };
  return { ...base, status: 'fitted', quality, fit: resultFit, selection, validation, bootstrap: uncertainty, parameters, warnings,
    modelKind: fit.kind, explanation: fit.kind === 'cpu-plus-gpu'
      ? 'Estimate a CPU-and-RAM baseline from CPU-only VMs, then fit a multiplicative GPU increment to the positive remaining price. Add the two fitted contributions. Nonpositive residuals cause a fit to be rejected; they are never discarded.'
      : `Joint multiplicative model with ${selection.chosen.lambda ? 'ridge regularization' : 'ordinary log least squares'}; method and penalty selected inside training-family folds.`,
    marginalPrices: null,
    rawScaleA: fit.kind === 'cpu-plus-gpu' ? null : Math.exp(fit.logA - fit.keys.reduce((sum, key, i) => sum + fit.slopes[i] * Math.log(fit.reference[key]), 0)),
    rawScaleCoefficients: fit.kind === 'cpu-plus-gpu' ? Object.fromEntries([['cpuA', fit.cpuFit], ['gpuB', fit.gpuFit]].map(([key, part]) => [key, Math.exp(part.logA - part.keys.reduce((sum, feature, i) => sum + part.slopes[i] * Math.log(part.reference[feature]), 0))])) : null,
    rows: rows.map((row, i) => ({ ...row, fittedPrice: fit.predictions[i], heldOutPrice: validation.predictions.find(pred => pred.id === row.id)?.predicted ?? null })) };
}

const canonical = value => String(value).toLowerCase().replace(/^standard_/, '');
const gpuKey = value => String(value).toLowerCase().replace(/^nvidia\s+|^tesla\s+/g, '').replace(/\s+/g, ' ').trim();
function compatibleCpu(benchmark, instance) {
  if (!benchmark || !positive(benchmark.score) || !/^6\.[1-7]\.\d+$/.test(benchmark.version)
    || /\bSME\b/i.test(`${benchmark.edition ?? ''} ${benchmark.instructionSets ?? ''}`)
    || benchmark.vcpus !== instance.vcpus || benchmark.ramGiB !== instance.ramGiB) return false;
  if (/^https:\/\/browser\.geekbench\.com\/v6\/cpu\/\d+$/.test(benchmark.url ?? '')) return /Linux/i.test(benchmark.edition ?? '');
  const source = (benchmark.url ?? '').match(/^https:\/\/raw\.githubusercontent\.com\/SpareCores\/sc-inspector-data\/[0-9a-f]{40}\/data\/(aws|azure|gcp)\/([^/]+)\/geekbench\/stdout$/);
  return Boolean(source && benchmark.sourceType === 'sparecores-original-measured-output'
    && benchmark.nominalSpecsVerified === true && /^Linux\s/.test(benchmark.kernel ?? '')
    && source[1] === instance.provider && canonical(decodeURIComponent(source[2])) === canonical(instance.name));
}
export function buildModelDataset(catalog, cpuSources, gpuModels, { now = Date.now() } = {}) {
  const records = cpuSources.flatMap(source => source?.records ?? []);
  const cpu = [], gpu = [], excluded = {}, annotated = [];
  const reject = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  const seen = new Set();
  for (const instance of catalog.instances ?? []) {
    const id = `${instance.provider}:${canonical(instance.name)}`;
    if (seen.has(id)) { reject('Duplicate configuration'); continue; }
    seen.add(id);
    if (!positive(instance.hourlyUsd)) { reject('Invalid price'); continue; }
    const observed = Date.parse(instance.observedAt);
    const stalePrice = !Number.isFinite(observed) || now - observed > 36 * 3600000;
    // For separately billed Google GPU add-ons, the provider's unchanged underlying
    // N1 host shape is the CPU benchmark target; no score is scaled or imputed.
    const pairedHost = instance.provider === 'gcp' && instance.gpuCount === 1
      && /^n1-(standard|highmem|highcpu)-\d+$/.test(instance.cpuBenchmarkName ?? '')
      && instance.name.startsWith(`${instance.cpuBenchmarkName} + 1× `)
      && instance.cpuBenchmarkBasis === 'exact-underlying-host-shape';
    const cpuTarget = pairedHost ? { ...instance, name: instance.cpuBenchmarkName } : instance;
    const matches = records.filter(record => record.provider === instance.provider && canonical(record.name) === canonical(cpuTarget.name));
    const benchmarks = matches.map(record => record.geekbench6Multi).filter(benchmark => compatibleCpu(benchmark, cpuTarget));
    const unique = [...new Map(benchmarks.map(row => [row.browserUrl ?? row.url, row])).values()];
    const cpuScore = quantile(unique.map(row => row.score), 0.5);
    let proxy = null;
    if (instance.gpuCount === 1 && gpuModels?.methodology?.versionMajor === 7 && gpuModels.methodology.api === 'OpenCL') {
      const mapping = gpuModels.cloudMappings?.find(record => record.provider === instance.provider && canonical(record.name) === canonical(instance.name) && record.gpuCount === 1 && (!record.catalogGpu || gpuKey(record.catalogGpu) === gpuKey(instance.gpu)));
      const modelName = mapping?.gpu ?? instance.gpu;
      proxy = gpuModels.records?.find(record => [record.gpu, record.device, ...(record.aliases ?? [])].filter(Boolean).some(alias => gpuKey(alias) === gpuKey(modelName))
        && positive(record.score) && (record.versionMajor ?? 7) === 7 && (record.api ?? 'OpenCL') === 'OpenCL') ?? null;
    }
    const row = { ...instance, id, modelFamily: machineFamily(instance), cpuScore, cpuBenchmarkBasis: pairedHost ? 'Paired exact underlying VM host; GPU attachment not benchmarked' : 'Exact VM shape',
      cpuBenchmarks: unique, gpuScore: proxy?.score ?? null, gpuBenchmark: proxy ? { ...proxy, basis: 'GPU-model proxy', url: proxy.sourceUrl ?? proxy.url ?? gpuModels.methodology.sourceUrl } : null };
    annotated.push(row);
    if (stalePrice) { reject('Price older than 36 hours'); continue; }
    if (instance.ramUnit === 'GB' || instance.vramUnit === 'GB') {
      reject('Memory byte convention not verified'); continue;
    }
    const accelerated = instance.acceleratorKind || instance.gpu || instance.vramGiB > 0;
    if (accelerated) {
      if (!instance.gpu || instance.gpuCount !== 1 || !positive(instance.vramGiB)) { reject('Not a verified single-GPU configuration'); continue; }
      if (!positive(row.gpuScore)) { reject('No matching Geekbench 7 GPU-model score'); continue; }
      if (!positive(instance.ramGiB) || !positive(cpuScore)) { reject('No compatible exact-host CPU benchmark for GPU bundle'); continue; }
      gpu.push(row);
    } else {
      if (!positive(instance.ramGiB)) { reject('Invalid RAM'); continue; }
      if (!positive(cpuScore)) { reject('No compatible exact-VM CPU benchmark'); continue; }
      cpu.push(row);
    }
  }
  return { cpu, gpu, annotated, excluded, catalogCount: catalog.instances?.length ?? 0 };
}

export function fitModels(catalog, cpuSources, gpuModels, options = {}) {
  const dataset = buildModelDataset(catalog, cpuSources, gpuModels, options);
  return { modelVersion: MODEL_VERSION, generatedAt: new Date(options.now ?? Date.now()).toISOString(), priceUpdatedAt: catalog.updatedAt,
    catalogCount: dataset.catalogCount, catalogProviders: catalog.providers, eligibleCount: dataset.cpu.length + dataset.gpu.length,
    exclusions: dataset.excluded, sourceAttributions: cpuSources.map(source => source?.attribution).filter(Boolean),
    benchmarkBasis: { cpu: 'Geekbench 6.1–6.7 multi-core, Linux without SME, exact VM shape and full vCPU count; no score scaling', gpu: 'Geekbench 7 OpenCL hardware-model reference; a labeled proxy for a single allocated GPU' },
    cpu: analyzeModel(dataset.cpu, 'cpu', options), gpu: analyzeGpuBundle(dataset.cpu, dataset.gpu, options) };
}
