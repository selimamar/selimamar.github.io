import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedGpuResourceModel, gpuMemoryCorrelation, renderGpuBandwidthModel } from '../lib/gpu-resource-view.js';

const variant = (id, predictions = []) => ({
  id, sampleCount: predictions.length, familyCount: 2, gpuModels: ['one', 'two'], providers: ['aws'],
  fit: { kind: 'additive', resourceKeys: ['bandwidthPerGpuGBps'], rawCoefficients: [0.002], reference: { bandwidthPerGpuGBps: 1000 },
    cpuFit: { A: 0.25, keys: ['ramGiB', 'cpuScore'], reference: { ramGiB: 16, cpuScore: 5000 }, slopes: [0.4, 0.5] } },
  validation: { mape: 0.123, logR2: 0.9, testedCount: predictions.length, predictions },
  training: { logR2: 0.99, predictions: [{ name: 'training-only sentinel', actual: 99, predicted: 99 }] },
});

function report(model) {
  return { variants: [variant('gpu-resource-additive', [{ name: 'old-model sentinel', actual: 88, predicted: 88 }])],
    singleResourceComparison: { variants: [variant('gpu-vram-linear'), model] },
    coverage: { cpuBaselineCount: 50 }, rows: [] };
}

test('displayed GPU model selects the restricted fit explicitly without falling back to a three-input fit', () => {
  const model = variant('gpu-bandwidth-linear');
  assert.equal(displayedGpuResourceModel(report(model)), model);
  assert.equal(displayedGpuResourceModel({ variants: [model] }), undefined);
  assert.equal(displayedGpuResourceModel(null), undefined);
});

test('VRAM correlation uses per-GPU specifications, filters invalid pairs and handles constant inputs', () => {
  const rows = [1, 2, 4, 8].map((value, index) => ({ bandwidthPerGpuGBps: value * 100, vramPerGpuGiB: value * value,
    gpuCount: [8, 1, 4, 2][index], gpuMemoryBandwidthGBps: 777 }));
  const correlation = gpuMemoryCorrelation([...rows, { bandwidthPerGpuGBps: 0, vramPerGpuGiB: 99 }, { bandwidthPerGpuGBps: 1, vramPerGpuGiB: Infinity }]);
  assert.equal(correlation.count, 4);
  assert.ok(correlation.raw > 0.98 && correlation.raw < 1);
  assert.ok(Math.abs(correlation.log - 1) < 1e-12);
  assert.deepEqual(gpuMemoryCorrelation(rows.map(row => ({ ...row, vramPerGpuGiB: 16 }))), { count: 4, raw: null, log: null });
  assert.deepEqual(gpuMemoryCorrelation(), { count: 0, raw: null, log: null });
});

test('the single scatter uses the restricted family-held-out predictions and not training or old-model results', () => {
  const model = variant('gpu-bandwidth-linear', [
    { name: 'held-out alpha', actual: 1, predicted: 1.5 },
    { name: 'held-out beta', actual: 10, predicted: 20 },
    { name: 'invalid negative', actual: -1, predicted: 1 },
  ]);
  const html = renderGpuBandwidthModel(report(model));
  assert.equal((html.match(/<svg /g) ?? []).length, 1);
  assert.equal((html.match(/<circle /g) ?? []).length, 2);
  assert.ok(html.includes('held-out alpha') && html.includes('held-out beta'));
  assert.ok(!html.includes('training-only sentinel') && !html.includes('old-model sentinel'));
  assert.ok(!html.includes('invalid negative') && !html.includes('NaN'));
  assert.match(html, /0\.002 × n × B/); // The equation uses the restricted bandwidth coefficient.
  assert.match(html, /H = 0\.25/); // The bundled host contribution remains in the equation.
});

test('GPU reference price combines H100 SXM bandwidth with the M6 CPU score, including a zero GPU coefficient', () => {
  const model = variant('gpu-bandwidth-linear');
  const original = structuredClone(model);
  const html = renderGpuBandwidthModel(report(model));

  // Host is 0.25 × sqrt(20,525 / 5,000); GPU is 3,350 × 0.002 = 6.70.
  assert.match(html, /reference-amount">\$7\.207 <span>USD\/hour<\/span>/);
  assert.match(html, /1 H100 SXM · 3,350 GB\/s bandwidth/);
  assert.match(html, /16 GB unified memory/);
  assert.match(html, /20,525 Geekbench 6 CPU score/);
  assert.match(html, /\$6\.700 GPU contribution \+ \$0\.507 CPU\/RAM host/);
  assert.deepEqual(model, original);

  model.fit.rawCoefficients = [0];
  const zeroGpu = renderGpuBandwidthModel(report(model));
  assert.match(zeroGpu, /reference-amount">\$0\.507 <span>USD\/hour<\/span>/);
  assert.match(zeroGpu, /\$0\.000 GPU contribution \+ \$0\.507 CPU\/RAM host/);
});
