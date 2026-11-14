// Prespecified GPU resource models. Both minimize the same whole-VM log loss;
// neither sees held-out prices when estimating its CPU baseline or GPU terms.
import { EXPERIMENT_VERSION, buildExperimentDataset, eligibleRows, experimentFolds, validationMetrics, experimentQuality, GPU_EXPERIMENTS, validateExperiment } from './experiments.js';
import { fitPowerLaw, predictPrice } from './model.js';
import { attachBandwidth } from './bandwidth.js';

export const GPU_RESOURCE_MODEL_VERSION = '1.1.0';
export const GPU_RESOURCE_REFERENCE = { fp32PerGpuTflops: 30, bandwidthPerGpuGBps: 1000, vramPerGpuGiB: 40 };
export const GPU_RESOURCE_MODELS = [
  { id: 'gpu-resource-additive', kind: 'additive', label: 'CPU baseline + additive GPU resources' },
  { id: 'gpu-resource-multiplicative', kind: 'multiplicative', label: 'CPU baseline + multiplicative GPU resources' },
];
export const GPU_SINGLE_RESOURCE_MODELS = [
  { id: 'gpu-bandwidth-linear', kind: 'additive', label: 'Bandwidth only · linear', resourceKeys: ['bandwidthPerGpuGBps'] },
  { id: 'gpu-vram-linear', kind: 'additive', label: 'VRAM only · linear', resourceKeys: ['vramPerGpuGiB'] },
  { id: 'gpu-bandwidth-power', kind: 'multiplicative', label: 'Bandwidth only · power law', resourceKeys: ['bandwidthPerGpuGBps'] },
  { id: 'gpu-vram-power', kind: 'multiplicative', label: 'VRAM only · power law', resourceKeys: ['vramPerGpuGiB'] },
];
const CPU_KEYS = ['ramGiB', 'cpuScore'];
const CPU_REFERENCE = { ramGiB: 16, cpuScore: 5000 };
const RESOURCE_KEYS = Object.keys(GPU_RESOURCE_REFERENCE);
const positive = value => Number.isFinite(value) && value > 0;
const unique = values => [...new Set(values)].sort();
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const compactCpuFit = fit => fit ? ({ A: fit.A, logA: fit.logA, slopes: fit.slopes, keys: fit.keys, reference: fit.reference, maxVif: fit.maxVif }) : null;

export function resourceDataSignature(catalog, cpuSources, gpuModels, fp32Dataset, bandwidthDataset) {
  const source = JSON.stringify([GPU_RESOURCE_MODEL_VERSION, EXPERIMENT_VERSION, catalog.updatedAt, catalog.instances,
    cpuSources.map(source => source?.records), gpuModels, fp32Dataset, bandwidthDataset]);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildGpuResourceDataset(catalog, cpuSources, gpuModels, fp32Dataset, bandwidthDataset, options = {}) {
  const data = buildExperimentDataset(catalog, cpuSources, gpuModels, fp32Dataset, options);
  const cpu = eligibleRows(data.cpu, CPU_KEYS);
  const candidates = data.gpu.map(row => {
    const bandwidth = attachBandwidth(row, bandwidthDataset);
    return { ...row, bandwidthPerGpuGBps: bandwidth?.bandwidthPerGpuGBps ?? null,
      bandwidthProvenance: bandwidth, fp32PerGpuTflops: positive(row.gpuFp32Tflops) ? row.gpuFp32Tflops / row.gpuCount : null,
      vramPerGpuGiB: positive(row.vramGiB) ? row.vramGiB / row.gpuCount : null };
  });
  const required = [...CPU_KEYS, ...RESOURCE_KEYS, 'gpuCount'];
  const gpu = eligibleRows(candidates, required);
  return { cpu, gpu, coverage: {
    catalogCount: catalog.instances.length, catalogGpuCount: data.gpu.length, eligibleCount: gpu.length,
    cpuBaselineCount: cpu.length, missingMetrics: Object.fromEntries(required.map(key => [key, candidates.filter(row => !positive(row[key])).length])),
    familyCount: unique(gpu.map(row => row.modelFamily)).length, gpuModelCount: unique(gpu.map(row => row.gpuModelGroup)).length,
    providers: unique(gpu.map(row => row.provider)), exclusions: data.coverage.excluded,
    note: 'Missing-metric counts overlap. Every candidate uses the same complete observations; no performance or price is imputed.' } };
}

function familyWeights(rows) {
  const counts = new Map();
  rows.forEach(row => counts.set(row.modelFamily, (counts.get(row.modelFamily) ?? 0) + 1));
  return rows.map(row => 1 / (counts.size * counts.get(row.modelFamily)));
}

// Small dense positive-definite systems. Damping is a solver step size only:
// it is not a penalty in the objective and is not selected from validation data.
function solve(matrix, target) {
  const n = target.length, a = matrix.map((row, i) => [...row, target[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (!Number.isFinite(a[pivot][col]) || Math.abs(a[pivot][col]) < 1e-18) return null;
    [a[pivot], a[col]] = [a[col], a[pivot]];
    const scale = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= scale;
    for (let row = 0; row < n; row++) if (row !== col) {
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  const values = a.map(row => row[n]);
  return values.every(Number.isFinite) ? values : null;
}

function matrixRank(matrix) {
  if (!matrix.length) return 0;
  const columns = matrix[0].map((_, j) => matrix.map(row => row[j]));
  const norms = columns.map(column => Math.sqrt(dot(column, column)));
  const normalized = columns.map((column, j) => column.map(value => norms[j] > 0 ? value / norms[j] : 0));
  const basis = [];
  for (const original of normalized) {
    const column = original.slice();
    for (let pass = 0; pass < 2; pass++) for (const q of basis) {
      const projection = dot(column, q);
      column.forEach((_, i) => { column[i] -= projection * q[i]; });
    }
    const norm = Math.sqrt(dot(column, column));
    if (norm > 1e-8) basis.push(column.map(value => value / norm));
  }
  return basis.length;
}

function evaluation(parameters, observations, kind) {
  const size = parameters.length;
  const gradient = Array(size).fill(0), gram = Array.from({ length: size }, () => Array(size).fill(0));
  let loss = 0;
  const predictions = [], jacobian = [];
  for (const row of observations) {
    const gpu = kind === 'additive' ? row.count * dot(parameters, row.x)
      : row.count * Math.exp(parameters[0] + dot(parameters.slice(1), row.logX));
    const price = row.host + gpu;
    if (!positive(price) || !Number.isFinite(gpu)) return null;
    const residual = Math.log(price / row.actual);
    if (!Number.isFinite(residual)) return null;
    const derivative = kind === 'additive' ? row.x.map(value => row.count * value / price)
      : [1, ...row.logX].map(value => gpu / price * value);
    loss += row.weight * residual ** 2;
    for (let j = 0; j < size; j++) {
      gradient[j] += 2 * row.weight * residual * derivative[j];
      for (let k = 0; k < size; k++) gram[j][k] += 2 * row.weight * derivative[j] * derivative[k];
    }
    predictions.push(price); jacobian.push(derivative);
  }
  return Number.isFinite(loss) ? { loss, gradient, gram, predictions, jacobian } : null;
}

function projectedGradient(parameters, gradient, kind) {
  return gradient.map((value, i) => (kind === 'additive' || i > 0) && parameters[i] <= 1e-12 ? Math.min(value, 0) : value);
}

function optimize(start, observations, kind, maxIterations) {
  let parameters = start.slice(), current = evaluation(parameters, observations, kind), damping = 1e-3;
  if (!current) return { converged: false, reason: 'nonfinite-initial-objective', iterations: 0 };
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const projected = projectedGradient(parameters, current.gradient, kind);
    const optimality = Math.max(...projected.map(Math.abs));
    if (optimality <= 1e-7) return { ...current, parameters, converged: true, reason: 'projected-gradient', iterations: iteration, optimality };
    const free = parameters.map((_, i) => i).filter(i => !((kind === 'additive' || i > 0) && parameters[i] <= 1e-12 && current.gradient[i] > 0));
    let accepted = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      const matrix = free.map(j => free.map(k => current.gram[j][k] + (j === k ? damping * Math.max(current.gram[j][j], 1e-4) : 0)));
      const direction = solve(matrix, free.map(j => -current.gradient[j]));
      if (!direction) { damping *= 10; continue; }
      for (let step = 1; step >= 1 / 1024; step /= 2) {
        const next = parameters.slice();
        free.forEach((j, i) => { next[j] = kind === 'additive' || j > 0 ? Math.max(0, parameters[j] + step * direction[i]) : parameters[j] + step * direction[i]; });
        const candidate = evaluation(next, observations, kind);
        if (candidate && candidate.loss < current.loss) {
          parameters = next; current = candidate; damping = Math.max(1e-12, damping / 3); accepted = true; break;
        }
      }
      if (accepted) break;
      damping *= 10;
    }
    if (!accepted) return { ...current, parameters, converged: false, reason: 'no-descent-step', iterations: iteration + 1, optimality };
  }
  const optimality = Math.max(...projectedGradient(parameters, current.gradient, kind).map(Math.abs));
  return { ...current, parameters, converged: optimality <= 1e-7, reason: 'iteration-limit', iterations: maxIterations, optimality };
}

/** Explicit outcomes retain solver failures rather than silently omitting rows. */
export function fitGpuResourceModel(cpuRows, gpuRows, kind, { excludedFamilies = [], maxIterations = 500, resourceKeys = RESOURCE_KEYS } = {}) {
  if (!['additive', 'multiplicative'].includes(kind) || !Number.isInteger(maxIterations) || maxIterations < 0
    || !Array.isArray(resourceKeys) || !resourceKeys.length || new Set(resourceKeys).size !== resourceKeys.length || resourceKeys.some(key => !RESOURCE_KEYS.includes(key))
    || gpuRows.length < 5 || gpuRows.some(row => !positive(row.hourlyUsd) || !Number.isInteger(row.gpuCount) || row.gpuCount < 1
      || [...CPU_KEYS, ...resourceKeys].some(key => !positive(row[key])))) return { status: 'invalid-data', fit: null, diagnostics: { reason: 'At least five full-GPU configurations complete for the specified resource keys are required.' } };
  const excluded = new Set(excludedFamilies);
  const cpuTraining = eligibleRows(cpuRows, CPU_KEYS).filter(row => !excluded.has(row.modelFamily));
  const cpuFit = fitPowerLaw(cpuTraining, CPU_KEYS, CPU_REFERENCE);
  if (!cpuFit) return { status: 'baseline-unidentifiable', fit: null, diagnostics: { reason: 'CPU baseline is not identifiable in this training split.', cpuTrainingCount: cpuTraining.length } };
  const weights = familyWeights(gpuRows);
  const observations = gpuRows.map((row, i) => {
    const x = resourceKeys.map(key => row[key] / GPU_RESOURCE_REFERENCE[key]);
    return { host: predictPrice(cpuFit, row), actual: row.hourlyUsd, count: row.gpuCount, x, logX: x.map(Math.log), weight: weights[i] };
  });
  if (observations.some(row => !positive(row.host))) return { status: 'invalid-baseline-prediction', fit: null, diagnostics: { reason: 'CPU baseline produced a nonfinite training prediction.' } };
  // Initialization uses prices only from this training split. Below-host prices
  // remain in every objective evaluation, even when their residual is negative.
  const seed = Math.max(0.01, mean(observations.map(row => Math.max(0, row.actual - row.host) / row.count)));
  const dimensions = resourceKeys.length;
  const constant = value => Array(dimensions).fill(value);
  const axes = value => resourceKeys.map((_, j) => resourceKeys.map((_, i) => i === j ? value : 0));
  const starts = kind === 'additive'
    ? [constant(seed / dimensions), ...axes(seed), constant(0)]
    : [constant(0), constant(0.5), constant(1), ...axes(1)].map(slopes => [Math.log(seed) - mean(observations.map(row => dot(slopes, row.logX))), ...slopes]);
  const solutions = starts.map(start => optimize(start, observations, kind, maxIterations));
  const successful = solutions.filter(result => result.converged && result.parameters.every(Number.isFinite)).sort((a, b) => a.loss - b.loss);
  const diagnostics = { solver: 'Deterministic multistart projected damped Gauss–Newton', objective: 'Equal-family mean squared log error of complete VM hourly prices',
    starts: starts.length, convergedStarts: successful.length, maxIterations, cpuTrainingCount: cpuTraining.length,
    cpuExcludedFamilies: unique(excludedFamilies), gpuTrainingCount: gpuRows.length,
    atOrBelowCpuBaselineCount: observations.filter(row => row.actual <= row.host).length,
    attempts: solutions.map(result => ({ converged: result.converged, reason: result.reason, iterations: result.iterations, loss: result.loss ?? null, optimality: result.optimality ?? null })) };
  if (!successful.length) return { status: 'solver-failed', fit: null, diagnostics };
  const best = successful[0];
  const fit = { kind, resourceKeys: resourceKeys.slice(), cpuFit: compactCpuFit(cpuFit), reference: Object.fromEntries(resourceKeys.map(key => [key, GPU_RESOURCE_REFERENCE[key]])),
    ...(kind === 'additive' ? { coefficients: best.parameters, rawCoefficients: best.parameters.map((value, i) => value / GPU_RESOURCE_REFERENCE[resourceKeys[i]]) }
      : { A: Math.exp(best.parameters[0]), logA: best.parameters[0], slopes: best.parameters.slice(1) }),
    diagnostics: { ...diagnostics, loss: best.loss, projectedGradientMax: best.optimality,
      iterations: best.iterations, jacobianRank: matrixRank(best.jacobian), parameterCount: best.parameters.length,
      boundParameters: best.parameters.map((value, i) => ({ value, i })).filter(({ value, i }) => (kind === 'additive' || i > 0) && value === 0).map(({ i }) => i),
      convergedLossRange: [successful[0].loss, successful.at(-1).loss], globalOptimumGuaranteed: false } };
  return { status: 'fitted', fit, diagnostics: fit.diagnostics };
}

export function predictGpuResourcePrice(fit, row) {
  const resourceKeys = fit?.resourceKeys ?? RESOURCE_KEYS;
  if (!fit || !Number.isInteger(row.gpuCount) || row.gpuCount < 1 || resourceKeys.some(key => !positive(row[key]))) return null;
  const host = predictPrice(fit.cpuFit, row);
  if (!positive(host)) return null;
  const x = resourceKeys.map(key => row[key] / fit.reference[key]);
  const gpu = fit.kind === 'additive' ? row.gpuCount * dot(fit.coefficients, x)
    : row.gpuCount * Math.exp(fit.logA + dot(fit.slopes, x.map(Math.log)));
  const price = host + gpu;
  return positive(price) ? price : null;
}

export function validateGpuResourceModel(cpuRows, rows, kind, { groupKey = 'modelFamily', maxIterations = 500, resourceKeys = RESOURCE_KEYS } = {}) {
  const predictions = [], skippedGroups = [], foldFits = [], failedFolds = [];
  for (const groups of experimentFolds(rows, 'gpu', groupKey)) {
    const withheld = new Set(groups), training = rows.filter(row => !withheld.has(row[groupKey])), test = rows.filter(row => withheld.has(row[groupKey]));
    const excludedFamilies = unique(test.map(row => row.modelFamily));
    const outcome = fitGpuResourceModel(cpuRows, training, kind, { excludedFamilies, maxIterations, resourceKeys });
    const values = outcome.fit ? test.map(row => predictGpuResourcePrice(outcome.fit, row)) : [];
    const complete = outcome.fit && values.every(positive);
    const record = { heldOutGroups: groups, excludedCpuFamilies: excludedFamilies, trainingCount: training.length, testCount: test.length,
      status: complete ? 'fitted' : outcome.fit ? 'nonfinite-test-prediction' : outcome.status, fit: outcome.fit, diagnostics: outcome.diagnostics };
    foldFits.push(record);
    if (!complete) { skippedGroups.push(...groups); failedFolds.push({ ...record, fit: null }); continue; }
    test.forEach((row, i) => predictions.push({ id: row.id, family: row.modelFamily, validationGroup: row[groupKey], provider: row.provider, name: row.name, actual: row.hourlyUsd, predicted: values[i] }));
  }
  const method = groupKey === 'gpuModelGroup' ? 'Leave one entire GPU hardware model out across providers. The CPU baseline also excludes every host machine family represented in the test set.'
    : 'Leave one entire provider × machine family out. The CPU baseline excludes the same held-out host families.';
  return { ...validationMetrics(predictions, rows, unique(rows.map(row => row[groupKey])).length, skippedGroups, method),
    selectionNote: 'Fixed prespecified model; no hyperparameters or winner were selected using held-out prices.', failedFolds, foldFits };
}

function trainingMetrics(fit, rows) {
  const predictions = fit ? rows.map(row => ({ id: row.id, family: row.modelFamily, validationGroup: row.modelFamily, provider: row.provider, name: row.name,
    actual: row.hourlyUsd, predicted: predictGpuResourcePrice(fit, row) })) : [];
  return validationMetrics(predictions, rows, unique(rows.map(row => row.modelFamily)).length, [], 'Training fit; descriptive and not a generalization estimate.');
}

export function fitSingleGpuResourceComparison(cpu, gpu) {
  const familyCount = unique(gpu.map(row => row.modelFamily)).length;
  const gpuModels = unique(gpu.map(row => row.gpuModelGroup));
  const providers = unique(gpu.map(row => row.provider));
  const variants = GPU_SINGLE_RESOURCE_MODELS.map(model => {
    const options = { resourceKeys: model.resourceKeys };
    const outcome = fitGpuResourceModel(cpu, gpu, model.kind, options);
    const validation = validateGpuResourceModel(cpu, gpu, model.kind, options);
    const gpuModelValidation = validateGpuResourceModel(cpu, gpu, model.kind, { ...options, groupKey: 'gpuModelGroup' });
    const key = model.resourceKeys[0], symbol = key === 'bandwidthPerGpuGBps' ? 'β' : 'γ';
    const parameters = !outcome.fit ? [] : model.kind === 'additive'
      ? [{ key, symbol: 'k', value: outcome.fit.rawCoefficients[0], normalizedValue: outcome.fit.coefficients[0] }]
      : [{ key: 'A', symbol: 'A', value: outcome.fit.A }, { key, symbol, value: outcome.fit.slopes[0] }];
    return { ...model, sampleCount: gpu.length, familyCount, gpuModels, providers, status: outcome.status,
      fit: outcome.fit, parameters, solverDiagnostics: outcome.diagnostics, training: trainingMetrics(outcome.fit, gpu),
      validation, gpuModelValidation, quality: experimentQuality(validation), warnings: [
        'The GPU resource is fitted on the same complete cohort as the other single-resource models; this comparison does not claim broader coverage from omitting metrics.',
        'Every validation fold refits this exact single-resource formula, including the CPU Geekbench/RAM baseline, without the test host families.',
        'The previous three-resource fits reaching zero coefficients on the full sample did not imply their validation folds used only bandwidth.',
        'The CPU baseline is an estimated contribution and resource coefficients are predictive associations, not observed component prices.',
        'These are fixed-model comparisons; choosing the lowest error afterward has not received independent validation.',
        outcome.fit?.diagnostics.boundParameters.length ? 'A fitted coefficient or exponent reached the nonnegative boundary of zero.' : null,
        outcome.fit?.diagnostics.jacobianRank < outcome.fit?.diagnostics.parameterCount ? 'The selected resource does not independently identify every parameter in this sample.' : null,
        validation.coverage < 1 || gpuModelValidation.coverage < 1 ? 'Some validation folds failed; compare shared predictions while retaining the reported missing coverage.' : null,
      ].filter(Boolean) };
  });
  const counts = {};
  for (const [metric, commonMetric, groupKey, countKey] of [
    ['validation', 'commonValidation', 'modelFamily', 'commonTestedCount'],
    ['gpuModelValidation', 'commonGpuModelValidation', 'gpuModelGroup', 'commonGpuModelTestedCount'],
  ]) {
    const predictedSets = variants.map(variant => new Set(variant[metric].predictions.map(row => row.id)));
    const commonRows = gpu.filter(row => predictedSets.every(ids => ids.has(row.id)));
    const commonIds = new Set(commonRows.map(row => row.id));
    counts[countKey] = commonRows.length;
    variants.forEach(variant => { variant[commonMetric] = validationMetrics(variant[metric].predictions.filter(row => commonIds.has(row.id)), commonRows,
      unique(commonRows.map(row => row[groupKey])).length, [], 'Identical held-out configurations successfully predicted by all four fixed single-resource models.'); });
  }
  return { sampleCount: gpu.length, familyCount, gpuModelCount: gpuModels.length, providers, variants, ...counts,
    note: 'Bandwidth-only and VRAM-only linear and power-law formulas are each refitted on the identical complete cohort, using the same CPU Geekbench/RAM baseline, full-VM log-price loss with equal machine-family weights, and held-out families or GPU hardware models. GPU count is applied once. This is a direct comparison of fixed single-resource models, not a reinterpretation of the earlier three-resource validation.' };
}

export function fitGpuResourceExperiments(catalog, cpuSources, gpuModels, fp32Dataset, bandwidthDataset, { now = Date.now() } = {}) {
  const { cpu, gpu, coverage } = buildGpuResourceDataset(catalog, cpuSources, gpuModels, fp32Dataset, bandwidthDataset, { now });
  const variants = GPU_RESOURCE_MODELS.map(model => {
    const outcome = fitGpuResourceModel(cpu, gpu, model.kind);
    const validation = validateGpuResourceModel(cpu, gpu, model.kind);
    const gpuModelValidation = validateGpuResourceModel(cpu, gpu, model.kind, { groupKey: 'gpuModelGroup' });
    const parameters = !outcome.fit ? [] : model.kind === 'additive'
      ? RESOURCE_KEYS.map((key, i) => ({ key, symbol: ['a', 'b', 'c'][i], value: outcome.fit.rawCoefficients[i], normalizedValue: outcome.fit.coefficients[i] }))
      : [{ key: 'A', symbol: 'A', value: outcome.fit.A }, ...RESOURCE_KEYS.map((key, i) => ({ key, symbol: ['α', 'β', 'γ'][i], value: outcome.fit.slopes[i] }))];
    return { ...model, sampleCount: gpu.length, familyCount: coverage.familyCount, providers: coverage.providers, gpuModels: unique(gpu.map(row => row.gpuModelGroup)),
      status: outcome.status, fit: outcome.fit, parameters, solverDiagnostics: outcome.diagnostics, training: trainingMetrics(outcome.fit, gpu),
      validation, gpuModelValidation, quality: experimentQuality(validation), warnings: [
        'FP32 and memory bandwidth are advertised hardware peaks, not measured application or cloud-VM performance.',
        'The CPU baseline is an estimated host contribution, not a separately observed billable component.',
        'GPU terms and the linear GPU-count multiplier are nonnegative modeling assumptions, not causal resource prices.',
        'Both forms are fixed comparisons; choosing the lower error after inspecting these results has not received independent validation.',
        'VRAM retains source-normalized nominal memory conventions; it does not measure usable device bytes.',
        outcome.fit?.diagnostics.boundParameters.length ? 'One or more GPU coefficients or exponents reached zero under the nonnegative constraint. That term adds no fitted contribution conditional on the other resources in this sample; it does not mean the hardware resource has no value.' : null,
        outcome.fit?.diagnostics.jacobianRank < outcome.fit?.diagnostics.parameterCount ? 'The resource design is rank deficient; individual GPU parameters are not uniquely identified.' : null,
        outcome.fit?.diagnostics.atOrBelowCpuBaselineCount ? 'Some observed VM prices are below the predicted CPU baseline; these rows are retained in the fitting loss.' : null,
        validation.coverage < 1 || gpuModelValidation.coverage < 1 ? 'Some validation folds failed; their groups and missing coverage are explicitly reported.' : null,
      ].filter(Boolean) };
  });
  const common = variants.map(variant => new Set(variant.validation.predictions.map(row => row.id)));
  const sharedRows = gpu.filter(row => common.every(ids => ids.has(row.id)));
  for (const variant of variants) {
    const ids = new Set(sharedRows.map(row => row.id));
    variant.commonValidation = validationMetrics(variant.validation.predictions.filter(row => ids.has(row.id)), sharedRows,
      unique(sharedRows.map(row => row.modelFamily)).length, [], 'Identical held-out configurations successfully predicted by both prespecified models. See full-cohort coverage and failed folds before comparing.');
  }
  const commonGpuIds = variants.map(variant => new Set(variant.gpuModelValidation.predictions.map(row => row.id)));
  const sharedGpuRows = gpu.filter(row => commonGpuIds.every(ids => ids.has(row.id)));
  for (const variant of variants) {
    const ids = new Set(sharedGpuRows.map(row => row.id));
    variant.commonGpuModelValidation = validationMetrics(variant.gpuModelValidation.predictions.filter(row => ids.has(row.id)), sharedGpuRows,
      unique(sharedGpuRows.map(row => row.gpuModelGroup)).length, [], 'Identical unseen-GPU-model test configurations successfully predicted by both prespecified models.');
  }
  const baselineSpec = GPU_EXPERIMENTS.find(model => model.id === 'gpu-replace-geekbench');
  const baselineFit = fitPowerLaw(gpu, baselineSpec.keys, baselineSpec.reference);
  const baselineComparison = { label: 'Previous joint RAM × CPU Geekbench × VRAM × FP32 power law', sampleCount: gpu.length,
    familyCount: coverage.familyCount, fit: compactCpuFit(baselineFit), validation: validateExperiment(gpu, baselineSpec, 'gpu'),
    note: 'Refitted and tested on the identical complete cohort and family boundaries. Both the function and fitting objective differ from the new models, so this is not an isolated test of memory bandwidth.' };
  return { resourceModelVersion: GPU_RESOURCE_MODEL_VERSION, generatedAt: new Date(now).toISOString(), priceUpdatedAt: catalog.updatedAt,
    sourceDataSignature: resourceDataSignature(catalog, cpuSources, gpuModels, fp32Dataset, bandwidthDataset), coverage,
    commonTestedCount: sharedRows.length, commonGpuModelTestedCount: sharedGpuRows.length, variants, baselineComparison,
    singleResourceComparison: fitSingleGpuResourceComparison(cpu, gpu),
    methodology: { host: 'CPU-only RAM + whole-VM CPU Geekbench power law, refitted without the test host families in every validation split.',
      additive: 'P = CPUbaseline + n × [a F + b B + c V], with a,b,c ≥ 0.',
      multiplicative: 'P = CPUbaseline + n × A × (F/30)^α × (B/1000)^β × (V/40)^γ, with A > 0 and α,β,γ ≥ 0.',
      units: 'F is dense FP32 TFLOPS per GPU; B is memory bandwidth in decimal GB/s per GPU; V is source-normalized nominal VRAM GiB per GPU; n is the integer count of identical full GPUs, applied exactly once.',
      objective: 'Both GPU forms minimize the equally weighted mean across training machine families of mean squared log(full predicted VM price / actual VM price). No residual-price rows are discarded. The CPU baseline uses ordinary least squares on CPU-only log prices.',
      solver: 'Deterministic multiple starting points, projected damped Gauss–Newton, first-order optimality checked at tolerance 1e-7. No regularization or validation-tuned parameters. This numerical check does not prove a global optimum.',
      uncertainty: 'No coefficient confidence intervals are estimated. These correlated hardware specifications cannot establish causal component prices.',
      comparison: 'Both fixed formulas use exactly the same complete cohort, training/test boundaries and objective. Family and unseen-GPU-model results are reported separately; neither model is automatically selected.' },
    rows: gpu.map(row => ({ id: row.id, provider: row.provider, name: row.name, modelFamily: row.modelFamily, gpuModelGroup: row.gpuModelGroup,
      gpu: row.gpu, gpuCount: row.gpuCount, ramGiB: row.ramGiB, cpuScore: row.cpuScore, hourlyUsd: row.hourlyUsd,
      fp32PerGpuTflops: row.fp32PerGpuTflops, bandwidthPerGpuGBps: row.bandwidthPerGpuGBps, vramPerGpuGiB: row.vramPerGpuGiB,
      fp32Provenance: row.fp32Provenance, bandwidthProvenance: row.bandwidthProvenance, observedAt: row.observedAt })) };
}
