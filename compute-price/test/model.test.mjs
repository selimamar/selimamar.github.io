import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_SPECS, fitPowerLaw, predictPrice, crossValidate, analyzeModel, buildModelDataset, machineFamily, rSquared } from '../lib/model.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
const price = (row, spec, A, slopes) => A * spec.keys.reduce((p, key, i) => p * (row[key] / spec.reference[key]) ** slopes[i], 1);
const factorialRows = (type, groups = 4, offsets = []) => {
  const spec = MODEL_SPECS[type];
  const slopes = type === 'cpu' ? [0.8, 0.6] : [0.4, 0.7, 0.3, 0.8];
  return Array.from({ length: groups }, (_, g) => Array.from({ length: 2 ** spec.keys.length }, (_, mask) => {
    const row = { id: `${g}:${mask}`, provider: 'test', name: `family${g}.${mask}`, modelFamily: `test:family${g}` };
    spec.keys.forEach((key, j) => { row[key] = spec.reference[key] * Math.exp(mask & (1 << j) ? 1 : -1); });
    row.hourlyUsd = price(row, spec, 0.45, slopes) * Math.exp(offsets[g] ?? 0);
    return row;
  })).flat();
};

test('log-linear QR recovers a known two-factor power law and reference price', () => {
  const rows = factorialRows('cpu');
  const fit = fitPowerLaw(rows, MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference);
  close(fit.A, 0.45);
  close(fit.slopes[0], 0.8);
  close(fit.slopes[1], 0.6);
  close(fit.logR2, 1);
  close(fit.maxVif, 1);
  close(predictPrice(fit, MODEL_SPECS.cpu.reference), 0.45);
  close(predictPrice(fit, { ramGiB: 32, cpuScore: 10000 }), 0.45 * 2 ** 1.4);
  assert.equal(predictPrice(fit, { ramGiB: 0, cpuScore: 10000 }), null);
});

test('GPU bundle regression recovers host RAM, CPU performance, VRAM and GPU performance exponents', () => {
  assert.deepEqual(MODEL_SPECS.gpu.keys, ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore']);
  assert.deepEqual(MODEL_SPECS.gpu.reference, { ramGiB: 32, cpuScore: 5000, vramGiB: 16, gpuScore: 100000 });
  const rows = factorialRows('gpu');
  const fit = fitPowerLaw(rows, MODEL_SPECS.gpu.keys, MODEL_SPECS.gpu.reference);
  close(fit.A, 0.45);
  fit.slopes.forEach((slope, i) => close(slope, [0.4, 0.7, 0.3, 0.8][i]));
  rows.forEach((row, i) => close(fit.predictions[i], row.hourlyUsd));
  close(predictPrice(fit, { ...MODEL_SPECS.gpu.reference, ramGiB: 64 }), 0.45 * 2 ** 0.4);
  close(predictPrice(fit, { ...MODEL_SPECS.gpu.reference, cpuScore: 10000 }), 0.45 * 2 ** 0.7);
  close(predictPrice(fit, { ...MODEL_SPECS.gpu.reference, vramGiB: 32 }), 0.45 * 2 ** 0.3);
  close(predictPrice(fit, { ...MODEL_SPECS.gpu.reference, gpuScore: 200000 }), 0.45 * 2 ** 0.8);
  assert.equal(predictPrice(fit, { vramGiB: 16, gpuScore: 100000 }), null);
});

test('orthogonal log-price noise leaves coefficients unchanged and gives the analytic R-squared', () => {
  const rows = factorialRows('cpu', 1).map(row => {
    const x = Math.log(row.ramGiB / 16), y = Math.log(row.cpuScore / 5000);
    return { ...row, hourlyUsd: row.hourlyUsd * Math.exp(0.2 * x * y) };
  });
  const fit = fitPowerLaw(rows, MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference);
  close(fit.A, 0.45);
  close(fit.slopes[0], 0.8);
  close(fit.slopes[1], 0.6);
  close(fit.logR2, 1 - 0.2 ** 2 / (0.8 ** 2 + 0.6 ** 2 + 0.2 ** 2));
});

test('constant and exactly collinear predictors cannot receive separate coefficients', () => {
  const rows = factorialRows('cpu');
  assert.equal(fitPowerLaw(rows.map(row => ({ ...row, ramGiB: 16 })), MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference), null);
  assert.equal(fitPowerLaw(rows.map(row => ({ ...row, cpuScore: 500 * row.ramGiB })), MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference), null);
  const result = analyzeModel(rows.map(row => ({ ...row, cpuScore: 500 * row.ramGiB })), 'cpu');
  assert.equal(result.status, 'not-identifiable');
  assert.deepEqual(result.parameters, []);
  assert.equal(result.validation, null);
});

test('invalid inputs fail instead of producing plausible regression parameters', () => {
  const rows = factorialRows('cpu');
  for (const invalid of [0, -1, NaN, Infinity, null, '1']) {
    assert.equal(fitPowerLaw([{ ...rows[0], hourlyUsd: invalid }, ...rows.slice(1)], MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference), null);
    assert.equal(fitPowerLaw([{ ...rows[0], cpuScore: invalid }, ...rows.slice(1)], MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference), null);
  }
  assert.equal(rSquared([1, 1], [1, 1]), null);
  assert.equal(rSquared([1, 2], [1]), null);
});

test('near-collinearity remains numerically accurate and is disclosed through high VIF', () => {
  const rows = factorialRows('cpu').map((row, i) => {
    const x = Math.log(row.ramGiB / 16);
    const next = { ...row, cpuScore: 5000 * Math.exp(x + 0.001 * (i & 2 ? 1 : -1)) };
    next.hourlyUsd = price(next, MODEL_SPECS.cpu, 0.45, [0.8, 0.6]);
    return next;
  });
  const fit = fitPowerLaw(rows, MODEL_SPECS.cpu.keys, MODEL_SPECS.cpu.reference);
  close(fit.slopes[0], 0.8, 1e-7);
  close(fit.slopes[1], 0.6, 1e-7);
  assert.ok(fit.maxVif > 10000);
});

test('exactly enough observations to interpolate parameters is not a reportable model', () => {
  const rows = factorialRows('cpu', 1).slice(0, 3);
  assert.equal(analyzeModel(rows, 'cpu').status, 'not-identifiable');
});

test('family holdouts remove every size of the withheld family together', () => {
  const rows = factorialRows('cpu', 4, [1.3, 0, 0, 0]);
  const result = crossValidate(rows, MODEL_SPECS.cpu);
  assert.equal(result.completedGroups, 4);
  assert.equal(result.testedCount, rows.length);
  assert.equal(result.coverage, 1);
  const heldOutExpensiveFamily = result.predictions.filter(row => row.family === 'test:family0');
  assert.equal(heldOutExpensiveFamily.length, 4);
  heldOutExpensiveFamily.forEach(row => close(row.predicted, row.actual / Math.exp(1.3)));
  assert.ok(result.mape > 0);
});

test('GPU holdouts expose insufficient independent GPU variation without silently dropping factors', () => {
  const rows = [0, 1, 2].flatMap(g => factorialRows('cpu', 1).map((row, i) => {
    const next = { ...row, id: `${g}:${i}`, modelFamily: `gpu:${g}`, vramGiB: [8, 16, 96][g], gpuScore: [60000, 150000, 300000][g] };
    next.hourlyUsd = price(next, MODEL_SPECS.gpu, 0.45, [0.4, 0.7, 0.3, 0.8]);
    return next;
  }));
  assert.ok(fitPowerLaw(rows, MODEL_SPECS.gpu.keys, MODEL_SPECS.gpu.reference));
  const result = crossValidate(rows, MODEL_SPECS.gpu);
  assert.equal(result.completedGroups, 0);
  assert.equal(result.coverage, 0);
  assert.equal(result.mape, null);
  assert.equal(result.logR2, null);
  assert.equal(result.skippedGroups.length, 3);
  assert.deepEqual(result.predictions, []);
});

test('GPU bundle validation uses every host and GPU factor with a RAM-only comparison baseline', () => {
  const rows = factorialRows('gpu', 4, [0.4, -0.2, 0, 0]);
  const result = crossValidate(rows, MODEL_SPECS.gpu);
  assert.equal(result.testedCount, rows.length);
  assert.equal(result.coverage, 1);
  assert.ok(Number.isFinite(result.mape));
  assert.ok(Number.isFinite(result.baselineMape));
  assert.equal(result.baselineKey, 'ramGiB');
  assert.ok(result.predictions.every(row => Number.isFinite(row.baseline) && row.baseline > 0));
  const missingCpu = rows.map(row => ({ ...row, cpuScore: null }));
  assert.equal(crossValidate(missingCpu, MODEL_SPECS.gpu).testedCount, 0);
});

test('cluster bootstrap preserves whole-family noise, has deterministic intervals and declines too few families', () => {
  const rows = factorialRows('cpu', 4, [-0.6, -0.2, 0.2, 0.6]);
  const first = analyzeModel(rows, 'cpu', { bootstrapRepeats: 120 });
  const second = analyzeModel(rows, 'cpu', { bootstrapRepeats: 120 });
  assert.deepEqual(first.bootstrap, second.bootstrap);
  assert.equal(first.bootstrap.successful, 120);
  assert.ok(first.bootstrap.intervals[0][0] < 0.45);
  assert.ok(first.bootstrap.intervals[0][1] > 0.45);
  // Every family has identical feature coverage: cluster resampling changes only the intercept.
  first.bootstrap.intervals[1].forEach(bound => close(bound, 0.8));
  first.bootstrap.intervals[2].forEach(bound => close(bound, 0.6));
  const small = analyzeModel(factorialRows('cpu', 3), 'cpu', { bootstrapRepeats: 120 });
  assert.equal(small.bootstrap.intervals, null);
  assert.equal(small.bootstrap.successful, 0);
  assert.match(small.bootstrap.reason, /four.*families/i);
});

test('Azure size variants remain in one holdout family while distinct generations stay separate', () => {
  const family = name => machineFamily({ provider: 'azure', name });
  assert.equal(family('Standard_D8_v5'), family('Standard_D16_v5'));
  assert.equal(family('Standard_D8s_v5'), family('Standard_D16s_v5'));
  assert.equal(family('Standard_NC24ads_A100_v4'), family('Standard_NC48ads_A100_v4'));
  assert.notEqual(family('Standard_D8s_v5'), family('Standard_D8s_v6'));
  assert.notEqual(machineFamily({ provider: 'aws', name: 'm6i.large' }), machineFamily({ provider: 'aws', name: 'm7i.large' }));
});

test('Google Cloud CPU size variants and GPU additions remain within their machine series', () => {
  const family = name => machineFamily({ provider: 'gcp', name });
  assert.equal(family('c3-standard-4'), 'gcp:c3');
  assert.equal(family('c3-standard-4'), family('c3-highmem-8'));
  assert.equal(family('c3-standard-4'), family('c3-highcpu-44'));
  assert.notEqual(family('c3-standard-4'), family('c3d-standard-4'));
  assert.equal(family('n1-standard-4+t4'), family('n1-highmem-8+t4'));
  assert.equal(family('n1-standard-4+t4'), 'gcp:n1');
});

test('bootstrap intervals are withheld when too many resamples lose predictor rank', () => {
  const points = [[0, 0], [1, 0], [0, 1], [-1, -1]];
  const rows = points.flatMap(([x, y], group) => [0, 1].map(i => {
    const row = { id: `${group}:${i}`, provider: 'test', name: `g${group}.${i}`, modelFamily: `g${group}`, ramGiB: 16 * Math.exp(x), cpuScore: 5000 * Math.exp(y) };
    row.hourlyUsd = price(row, MODEL_SPECS.cpu, 0.45, [0.8, 0.6]);
    return row;
  }));
  const result = analyzeModel(rows, 'cpu', { bootstrapRepeats: 400 });
  assert.equal(result.status, 'fitted');
  assert.ok(result.bootstrap.successful > 0);
  assert.ok(result.bootstrap.successful < 320);
  assert.equal(result.bootstrap.intervals, null);
  assert.match(result.bootstrap.reason, /not identifiable/i);
});

const now = Date.parse('2026-09-29T12:00:00Z');
const vm = (name, extra = {}) => ({ provider: 'aws', name, hourlyUsd: 0.1, ramGiB: 16, vcpus: 4, observedAt: '2026-09-29T10:00:00Z', ...extra });
const benchmark = (name, extra = {}, id = 1000) => ({ provider: 'aws', name, geekbench6Multi: { score: 5000, version: '6.3.0', edition: 'for Linux AVX2', vcpus: 4, ramGiB: 16, url: `https://browser.geekbench.com/v6/cpu/${id}`, ...extra } });
const models = { methodology: { versionMajor: 7, api: 'OpenCL' }, records: [{ gpu: 'NVIDIA T4', score: 61216, versionMajor: 7, api: 'OpenCL', sourceUrl: 'https://browser.geekbench.com/opencl-benchmarks' }] };

test('Nominal GB with unverified byte convention stays visible but cannot silently enter a GiB model', () => {
  const instances = [vm('uncertain-ram', { ramUnit: 'GB' }),
    vm('uncertain-vram', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16, vramUnit: 'GB' })];
  const dataset = buildModelDataset({ instances }, [{ records: instances.map(row => benchmark(row.name)) }], models, { now });
  assert.equal(dataset.annotated.length, 2);
  assert.equal(dataset.cpu.length + dataset.gpu.length, 0);
  assert.equal(dataset.excluded['Memory byte convention not verified'], 2);
});

test('dataset requires current prices and compatible exact-shape CPU measurements', () => {
  const cases = [
    ['good', {}, {}], ['wrong-cpus', {}, { vcpus: 8 }], ['wrong-ram', {}, { ramGiB: 32 }],
    ['legacy', {}, { version: '5.4.0' }], ['windows', {}, { edition: 'for Windows AVX2' }],
    ['unsourced', {}, { url: 'https://example.com/fake' }],
    ['stale', { observedAt: '2026-09-27T00:00:00Z' }, {}], ['bad-price', { hourlyUsd: Infinity }, {}],
    ['multi-gpu', { gpu: 'NVIDIA T4', gpuCount: 2, vramGiB: 32 }, {}],
    ['fractional', { gpu: 'NVIDIA T4', gpuCount: 0.5, vramGiB: 8 }, {}],
    ['unmatched-gpu', { gpu: 'NVIDIA A10G', gpuCount: 1, vramGiB: 22 }, {}],
    ['single-gpu', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16 }, {}],
  ];
  const dataset = buildModelDataset({ instances: cases.map(([name, props]) => vm(name, props)) }, [{ records: cases.map(([name, , props], i) => benchmark(name, props, 1000 + i)) }], models, { now });
  assert.deepEqual(dataset.cpu.map(row => row.name), ['good']);
  assert.deepEqual(dataset.gpu.map(row => row.name), ['single-gpu']);
  assert.ok(dataset.annotated.some(row => row.name === 'stale'), 'retained dated prices remain visible in the full catalog');
  assert.equal(dataset.gpu[0].gpuScore, 61216);
  assert.equal(dataset.gpu[0].cpuScore, 5000);
  assert.equal(Object.values(dataset.excluded).reduce((a, b) => a + b, 0), cases.length - 2);
});

test('repeated benchmark source URLs do not gain extra weight in the CPU median', () => {
  const records = [benchmark('median', { score: 1000 }, 1), benchmark('median', { score: 3000 }, 2), benchmark('median', { score: 3000 }, 2)];
  const result = buildModelDataset({ instances: [vm('median'), vm('median')] }, [{ records }], models, { now });
  assert.equal(result.cpu.length, 1);
  assert.equal(result.cpu[0].cpuScore, 2000);
  assert.equal(result.cpu[0].cpuBenchmarks.length, 2);
  assert.equal(result.excluded['Duplicate configuration'], 1);
});

test('GPU bundle eligibility requires a compatible CPU benchmark and verified host metadata', () => {
  const cases = [
    vm('no-cpu-benchmark', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16 }),
    vm('no-host-specs', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16, ramGiB: null, vcpus: null }),
    vm('incompatible-cpu-score', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16 }),
    vm('cpu-without-benchmark'),
  ];
  const cpu = [{ records: [benchmark('incompatible-cpu-score', { version: '7.0.0' })] }];
  const dataset = buildModelDataset({ instances: cases }, cpu, models, { now });
  assert.deepEqual(dataset.gpu, []);
  assert.equal(dataset.cpu.length, 0);
  assert.equal(dataset.excluded['No compatible exact-host CPU benchmark for GPU bundle'], 3);
  assert.equal(dataset.excluded['No compatible exact-VM CPU benchmark'], 1);
});

test('GPU matching rejects fractional, multiple, stale and variant-mismatched GPUs despite valid CPU data', () => {
  const base = { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16 };
  const cases = [
    ['single', {}], ['fractional', { gpuCount: 0.5, vramGiB: 8 }], ['multiple', { gpuCount: 2, vramGiB: 32 }],
    ['no-vram', { vramGiB: null }], ['no-gpu-count', { gpuCount: null }],
    ['virtual-partition', { gpu: 'NVIDIA T4-8Q' }], ['different-device', { gpu: 'NVIDIA L4' }],
    ['stale', { observedAt: '2026-09-27T00:00:00Z' }], ['invalid-price', { hourlyUsd: -1 }],
  ];
  const cpu = [{ records: cases.map(([name], i) => benchmark(name, {}, 3000 + i)) }];
  const dataset = buildModelDataset({ instances: cases.map(([name, props]) => vm(name, { ...base, ...props })) }, cpu, models, { now });
  assert.deepEqual(dataset.gpu.map(row => row.name), ['single']);
  assert.equal(Object.values(dataset.excluded).reduce((a, b) => a + b, 0), cases.length - 1);
});

test('GPU dataset never mixes a different major version or compute API into the proxy cohort', () => {
  const catalog = { instances: [vm('gpu', { gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16 })] };
  const cpu = [{ records: [benchmark('gpu')] }];
  for (const altered of [{ ...models, methodology: { versionMajor: 6, api: 'OpenCL' } }, { ...models, records: [{ ...models.records[0], api: 'Vulkan' }] }, { ...models, records: [{ ...models.records[0], versionMajor: 6 }] }]) {
    assert.equal(buildModelDataset(catalog, cpu, altered, { now }).gpu.length, 0);
  }
});

test('compatible later Geekbench6 data requires pinned original evidence and verified nominal specs', () => {
  const catalog = { instances: [vm('source-check')] };
  const pinned = `https://raw.githubusercontent.com/SpareCores/sc-inspector-data/${'a'.repeat(40)}/data/aws/source-check/geekbench/stdout`;
  const original = { version: '6.7.1', edition: 'Pro', kernel: 'Linux 6.8.0 x86_64', sourceType: 'sparecores-original-measured-output', nominalSpecsVerified: true, url: pinned };
  const included = props => buildModelDataset(catalog, [{ records: [benchmark('source-check', props)] }], models, { now }).cpu.length;
  assert.equal(included(original), 1);
  for (const changes of [
    { nominalSpecsVerified: false }, { sourceType: 'estimated' }, { url: pinned.replace('a'.repeat(40), 'main') },
    { edition: 'for Linux SME' }, { version: '6.0.3' }, { version: '7.0.0' }, { kernel: 'Windows' },
    { url: pinned.replace('/aws/', '/azure/') }, { url: pinned.replace('/source-check/', '/different-shape/') },
  ]) assert.equal(included({ ...original, ...changes }), 0);
});

const googleHost = 'n1-standard-4';
const googleHostSource = `https://raw.githubusercontent.com/SpareCores/sc-inspector-data/${'b'.repeat(40)}/data/gcp/${googleHost}/geekbench/stdout`;
const googleBundle = overrides => vm(`${googleHost} + 1× T4`, {
  provider: 'gcp', ramGiB: 15, vcpus: 4, gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16,
  cpuBenchmarkName: googleHost, cpuBenchmarkBasis: 'exact-underlying-host-shape', ...overrides,
});
const googleBenchmark = overrides => ({ ...benchmark(googleHost, {
  score: 12345, version: '6.7.1', edition: 'Pro', vcpus: 4, ramGiB: 15,
  kernel: 'Linux 6.8.0 x86_64', sourceType: 'sparecores-original-measured-output',
  nominalSpecsVerified: true, url: googleHostSource, ...overrides,
}), provider: 'gcp' });

test('Google attached GPU bundles reuse only the explicitly paired exact host CPU measurement', () => {
  const row = googleBundle();
  const source = googleBenchmark();
  const dataset = buildModelDataset({ instances: [row] }, [{ records: [source] }], models, { now });
  assert.equal(dataset.gpu.length, 1);
  assert.equal(dataset.gpu[0].name, `${googleHost} + 1× T4`);
  assert.equal(dataset.gpu[0].cpuScore, 12345);
  assert.equal(dataset.gpu[0].gpuScore, 61216);
  assert.equal(dataset.gpu[0].cpuBenchmarks[0].url, googleHostSource);
  assert.match(dataset.gpu[0].cpuBenchmarkBasis, /paired exact underlying.*GPU attachment not benchmarked/i);
  assert.equal(dataset.cpu.length, 0);
});

test('Google host pairing requires its explicit basis and an exact vCPU and RAM match', () => {
  for (const changes of [
    { cpuBenchmarkBasis: undefined }, { cpuBenchmarkBasis: 'similar-host' }, { cpuBenchmarkName: undefined },
    { cpuBenchmarkName: 'n1-standard-8' }, { vcpus: 8 }, { ramGiB: 16 }, { provider: 'aws' },
  ]) {
    const dataset = buildModelDataset({ instances: [googleBundle(changes)] }, [{ records: [googleBenchmark()] }], models, { now });
    assert.equal(dataset.gpu.length, 0, JSON.stringify(changes));
  }
  for (const changes of [{ vcpus: 8 }, { ramGiB: 16 }, { nominalSpecsVerified: false }]) {
    const dataset = buildModelDataset({ instances: [googleBundle()] }, [{ records: [googleBenchmark(changes)] }], models, { now });
    assert.equal(dataset.gpu.length, 0, JSON.stringify(changes));
  }
});

test('paired Google CPU evidence must name the same underlying host and provider in its pinned source path', () => {
  for (const url of [
    googleHostSource.replace('/gcp/', '/aws/'),
    googleHostSource.replace('/n1-standard-4/', '/n1-highmem-4/'),
    googleHostSource.replace('/n1-standard-4/', '/n1-standard-4%20%2B%201%C3%97%20T4/'),
    googleHostSource.replace('b'.repeat(40), 'main'),
  ]) {
    const dataset = buildModelDataset({ instances: [googleBundle()] }, [{ records: [googleBenchmark({ url })] }], models, { now });
    assert.equal(dataset.gpu.length, 0, url);
  }
});

test('a cloud GPU alias mapping cannot override contradictory current hardware metadata', () => {
  const catalog = { instances: [vm('changed-gpu', { gpu: 'NVIDIA A10G', gpuCount: 1, vramGiB: 22 })] };
  const withOldMapping = { ...models, cloudMappings: [{ provider: 'aws', name: 'changed-gpu', catalogGpu: 'NVIDIA T4', gpu: 'NVIDIA T4', gpuCount: 1 }] };
  assert.equal(buildModelDataset(catalog, [{ records: [benchmark('changed-gpu')] }], withOldMapping, { now }).gpu.length, 0);
});
