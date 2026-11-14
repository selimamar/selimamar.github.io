import test from 'node:test';
import assert from 'node:assert/strict';
import { gpuContributionAtBandwidth, positiveLogDomain, logPosition, prepareGpuResourceCharts } from '../lib/gpu-resource-charts.js';

const cpuFit = { A: 2, keys: ['ramGiB', 'cpuScore'], reference: { ramGiB: 16, cpuScore: 5000 }, slopes: [1, 1] };
const reference = { fp32PerGpuTflops: 30, bandwidthPerGpuGBps: 1000, vramPerGpuGiB: 40 };

test('log coordinates reject nonpositive values and place a geometric midpoint halfway', () => {
  assert.equal(positiveLogDomain([0, -2, NaN, Infinity]), null);
  assert.equal(logPosition(0, [1, 100]), null);
  assert.equal(logPosition(-1, [1, 100]), null);
  assert.equal(logPosition(5, [1, Infinity]), null);
  assert.equal(logPosition(10, [1, 100]), 0.5);
});

test('residuals divide by GPU count once; excluded log points stay in validation', () => {
  const rows = [10, 4, 2].map((hourlyUsd, index) => ({ id: String(index), ramGiB: 32, cpuScore: 5000, gpuCount: 2, bandwidthPerGpuGBps: 300 + index * 100, hourlyUsd }));
  const predictions = rows.map(row => ({ id: row.id, actual: row.hourlyUsd, predicted: row.hourlyUsd * 1.1 }));
  const report = { rows, variants: [{ id: 'gpu-resource-additive', sampleCount: rows.length, fit: { kind: 'additive', cpuFit, reference, coefficients: [0, 1, 0] }, validation: { predictions } }] };
  const prepared = prepareGpuResourceCharts(report);
  assert.equal(prepared.residual.points.length, 1);
  assert.equal(prepared.residual.points[0].inferred, 3);
  assert.equal(prepared.residual.excludedNonpositive, 2);
  assert.equal(prepared.panels[0].points.length, 3);
  assert.equal(report.rows.length, 3);
  assert.ok(prepared.residual.curves[0].points.every(point => point.bandwidth === 300), 'curves do not extrapolate beyond observed positive points');
});

test('conditional GPU curves use per-device normalized inputs without a count multiplier', () => {
  assert.equal(gpuContributionAtBandwidth({ kind: 'additive', reference, coefficients: [30, 2000, 120] }, 100), 350);
  assert.equal(gpuContributionAtBandwidth({ kind: 'multiplicative', reference, A: 2, slopes: [1, 1, 1] }, 500), 1);
});

test('validation panels share bounds that include both models; differing CPU baselines disable shared residuals', () => {
  const variants = [3, 300].map((predicted, index) => ({ id: String(index), fit: { kind: 'additive', cpuFit: { ...cpuFit, A: 2 + index }, reference, coefficients: [0, 1, 0] }, validation: { predictions: [{ actual: 1, predicted }] } }));
  const prepared = prepareGpuResourceCharts({ rows: [], variants });
  assert.equal(prepared.residual.commonCpu, false);
  assert.ok(prepared.validationDomain[0] < 1);
  assert.ok(prepared.validationDomain[1] > 300);
  assert.equal(prepared.panels.length, 2);
});
