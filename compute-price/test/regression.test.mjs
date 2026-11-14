import test from 'node:test';
import assert from 'node:assert/strict';
import { fitLogModel } from '../lib/regression.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
const keys = ['ramGiB', 'cpuScore'];
const reference = { ramGiB: 16, cpuScore: 5000 };
const makeRows = (points, slopes = [0.8, 0.6], logA = Math.log(0.45)) => points.map(([x, y]) => ({
  ramGiB: 16 * Math.exp(x), cpuScore: 5000 * Math.exp(y), hourlyUsd: Math.exp(logA + slopes[0] * x + slopes[1] * y),
}));
const orthogonal = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

test('unregularized log regression recovers an exact power law and unpenalized intercept', () => {
  const fit = fitLogModel(makeRows(orthogonal), keys, reference);
  close(fit.A, 0.45);
  close(fit.slopes[0], 0.8);
  close(fit.slopes[1], 0.6);
  close(fit.logR2, 1);
  close(fit.trainingLogMse, 0);
  close(fit.effectiveDegreesOfFreedom, 3);
  assert.equal(fit.rankDeficient, false);
  assert.deepEqual(fit.constantKeys, []);
});

test('ridge shrinkage and objective match the analytic orthogonal solution', () => {
  const lambda = 0.25;
  const fit = fitLogModel(makeRows(orthogonal), keys, reference, { lambda });
  close(fit.A, 0.45);
  close(fit.slopes[0], 0.8 / (1 + lambda));
  close(fit.slopes[1], 0.6 / (1 + lambda));
  const squareNorm = 0.8 ** 2 + 0.6 ** 2;
  close(fit.trainingLogMse, squareNorm * (lambda / (1 + lambda)) ** 2);
  close(fit.penalty, lambda * squareNorm / (1 + lambda) ** 2);
  close(fit.objective, squareNorm * lambda / (1 + lambda));
  close(fit.effectiveDegreesOfFreedom, 1 + 2 / (1 + lambda));
  assert.ok(fit.maxKktViolation < 1e-12);
});

test('objective uses mean loss so duplicating observations does not change shrinkage', () => {
  const rows = makeRows(orthogonal);
  const original = fitLogModel(rows, keys, reference, { lambda: 0.1 });
  const repeated = fitLogModel(Array.from({ length: 7 }, () => rows).flat(), keys, reference, { lambda: 0.1 });
  close(repeated.A, original.A);
  repeated.slopes.forEach((value, j) => close(value, original.slopes[j]));
  close(repeated.objective, original.objective);
});

test('nonnegative fit solves the correlated boundary optimum instead of clipping OLS coefficients', () => {
  const points = orthogonal.map(([a, b]) => [a, 0.5 * a + Math.sqrt(0.75) * b]);
  const rows = makeRows(points, [2, -1]);
  const ordinary = fitLogModel(rows, keys, reference);
  close(ordinary.slopes[0], 2);
  close(ordinary.slopes[1], -1);
  const constrained = fitLogModel(rows, keys, reference, { nonnegative: true });
  close(constrained.slopes[0], 1.5);
  close(constrained.slopes[1], 0);
  close(constrained.trainingLogMse, 0.75);
  assert.deepEqual(constrained.constrainedKeys, ['cpuScore']);
  const regularized = fitLogModel(rows, keys, reference, { lambda: 0.5, nonnegative: true });
  close(regularized.slopes[0], 1);
  close(regularized.slopes[1], 0);
  assert.ok(regularized.maxKktViolation < 1e-12);
});

test('nonnegative regression permits the intercept-only optimum', () => {
  const fit = fitLogModel(makeRows(orthogonal, [-0.8, -0.6]), keys, reference, { lambda: 0.1, nonnegative: true });
  close(fit.A, 0.45);
  assert.deepEqual(fit.slopes, [0, 0]);
  close(fit.effectiveDegreesOfFreedom, 1);
  fit.predictions.forEach(value => close(value, 0.45));
});

test('ridge uniquely stabilizes perfectly collinear predictors while zero penalty refuses them', () => {
  const rows = makeRows([[-1, -1], [0, 0], [1, 1]], [1, 1]);
  assert.equal(fitLogModel(rows, keys, reference), null);
  assert.equal(fitLogModel(rows, keys, reference, { nonnegative: true }), null);
  for (const nonnegative of [false, true]) {
    const lambda = 0.1;
    const fit = fitLogModel(rows, keys, reference, { lambda, nonnegative });
    close(fit.slopes[0], 2 / (2 + lambda));
    close(fit.slopes[1], 2 / (2 + lambda));
    assert.equal(fit.rankDeficient, true);
    assert.ok(fit.maxKktViolation < 1e-12);
  }
});

test('constant training-fold predictors receive zero slope without blocking the remaining fit', () => {
  const rows = makeRows([[-1, 0], [0, 0], [1, 0]], [0.8, 5]);
  assert.equal(fitLogModel(rows, keys, reference), null);
  for (const nonnegative of [false, true]) {
    const fit = fitLogModel(rows, keys, reference, { lambda: 0.25, nonnegative });
    close(fit.A, 0.45);
    close(fit.slopes[0], 0.8 / 1.25);
    assert.equal(fit.slopes[1], 0);
    assert.deepEqual(fit.constantKeys, ['cpuScore']);
    assert.equal(fit.rankDeficient, true);
  }
  const allConstant = fitLogModel([1, 2, 4].map(hourlyUsd => ({ ...reference, hourlyUsd })), keys, reference, { lambda: 0.1 });
  close(allConstant.A, 2);
  assert.deepEqual(allConstant.slopes, [0, 0]);
  assert.deepEqual(allConstant.constantKeys, keys);
});

test('centering and scales use only this call’s training rows and do not persist across fits', () => {
  const points = [[2, -1], [2, 1], [6, -1], [6, 1]];
  const train = makeRows(points);
  const frozen = JSON.stringify(train);
  const fit = fitLogModel(train, keys, reference, { lambda: 0.2 });
  close(fit.normalization.centerLogRatios[0], 4);
  close(fit.normalization.centerLogRatios[1], 0);
  close(fit.normalization.scaleLogRatios[0], 2);
  close(fit.normalization.scaleLogRatios[1], 1);
  close(fit.normalization.targetLogMean, Math.log(0.45) + 0.8 * 4);
  fitLogModel([...train, ...makeRows([[20, -15], [15, 30]])], keys, reference, { lambda: 0.2 });
  assert.deepEqual(fitLogModel(train, keys, reference, { lambda: 0.2 }), fit);
  assert.equal(JSON.stringify(train), frozen);
});

test('reference-unit changes preserve predictions and raw exponents', () => {
  const rows = makeRows(orthogonal);
  const fit = fitLogModel(rows, keys, reference, { lambda: 0.3 });
  const shifted = fitLogModel(rows, keys, { ramGiB: 32, cpuScore: 10000 }, { lambda: 0.3 });
  shifted.slopes.forEach((value, j) => close(value, fit.slopes[j]));
  shifted.predictions.forEach((value, i) => close(value, fit.predictions[i]));
  close(shifted.A, fit.A * 2 ** (fit.slopes[0] + fit.slopes[1]));
});

test('four-factor active-set search satisfies ridge KKT conditions on a correlated design', () => {
  const featureKeys = ['ramGiB', 'cpuScore', 'vramGiB', 'gpuScore'];
  const refs = { ramGiB: 32, cpuScore: 5000, vramGiB: 16, gpuScore: 100000 };
  const rows = Array.from({ length: 32 }, (_, i) => {
    const a = i & 1 ? 1 : -1, b = i & 2 ? 1 : -1, c = i & 4 ? 1 : -1, d = i & 8 ? 1 : -1;
    const logs = [a, 0.7 * a + b, 0.4 * b + c, 0.8 * c + d];
    const row = Object.fromEntries(featureKeys.map((key, j) => [key, refs[key] * Math.exp(logs[j])]));
    return { ...row, hourlyUsd: Math.exp(0.5 + 0.8 * logs[0] - 0.6 * logs[1] + 0.4 * logs[2] + 1.2 * logs[3]) };
  });
  const fit = fitLogModel(rows, featureKeys, refs, { lambda: 0.1, nonnegative: true });
  assert.ok(fit);
  assert.ok(fit.slopes.every(value => value >= 0));
  assert.ok(fit.maxKktViolation < 1e-10);
  // Verify gradients directly in the data rather than trusting the returned check.
  featureKeys.forEach((key, j) => {
    const gradient = rows.reduce((sum, row, i) => {
      const z = (Math.log(row[key] / refs[key]) - fit.normalization.centerLogRatios[j]) / fit.normalization.scaleLogRatios[j];
      return sum + z * Math.log(fit.predictions[i] / row.hourlyUsd) / rows.length;
    }, 0) + 0.1 * fit.standardizedSlopes[j];
    if (fit.slopes[j] === 0) assert.ok(gradient >= -1e-10);
    else close(gradient, 0, 1e-10);
  });
});

test('invalid inputs and too few observations fail without plausible coefficients', () => {
  const rows = makeRows(orthogonal);
  assert.equal(fitLogModel(rows.slice(0, 2), keys, reference, { lambda: 1 }), null);
  for (const value of [0, -1, null, NaN, Infinity, '1']) {
    assert.equal(fitLogModel([{ ...rows[0], hourlyUsd: value }, ...rows.slice(1)], keys, reference, { lambda: 1 }), null);
    assert.equal(fitLogModel([{ ...rows[0], ramGiB: value }, ...rows.slice(1)], keys, reference, { lambda: 1 }), null);
    assert.equal(fitLogModel(rows, keys, { ...reference, ramGiB: value }, { lambda: 1 }), null);
  }
  for (const lambda of [-1, Infinity, NaN, null, '1']) assert.equal(fitLogModel(rows, keys, reference, { lambda }), null);
  assert.equal(fitLogModel(rows, ['ramGiB', 'ramGiB'], reference), null);
  assert.equal(fitLogModel(rows, keys, reference, { nonnegative: 'yes' }), null);
});
