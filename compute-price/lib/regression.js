// Ridge regression on natural logarithms. All normalization is learned from rows
// passed to this call, so callers can fit training folds without test-data leakage.
// Objective: mean(log-price residual²) + lambda * sum(standardized slope²).
const positive = value => Number.isFinite(value) && value > 0;
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

// Positive-definite systems only: unregularized deficient designs are refused.
function cholesky(matrix) {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  const tolerance = 1e-13 * Math.max(1, ...matrix.map((row, i) => row[i]));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let value = matrix[i][j];
      for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (!Number.isFinite(value) || value <= tolerance) return null;
        lower[i][j] = Math.sqrt(value);
      } else lower[i][j] = value / lower[j][j];
    }
  }
  return lower;
}

function solve(lower, target) {
  const result = target.slice();
  for (let i = 0; i < result.length; i++) {
    for (let j = 0; j < i; j++) result[i] -= lower[i][j] * result[j];
    result[i] /= lower[i][i];
  }
  for (let i = result.length - 1; i >= 0; i--) {
    for (let j = i + 1; j < result.length; j++) result[i] -= lower[j][i] * result[j];
    result[i] /= lower[i][i];
  }
  return result.every(Number.isFinite) ? result : null;
}

function logR2(actual, predicted) {
  const center = average(actual);
  const total = actual.reduce((sum, value) => sum + (value - center) ** 2, 0);
  return total > 0 ? 1 - actual.reduce((sum, value, i) => sum + (value - predicted[i]) ** 2, 0) / total : null;
}

/**
 * Fit a 1–4 factor power law with an unpenalized intercept and optional
 * nonnegative exponents. The exact constrained solution is found by considering
 * each face of the nonnegative orthant (at most 16 small systems).
 *
 * Returns null for invalid inputs, fewer than three observations, a deficient
 * unregularized design, or a failed numerical optimality check. With positive
 * lambda, a constant predictor receives slope zero and is listed in constantKeys.
 */
export function fitLogModel(rows, keys, reference, { lambda = 0, nonnegative = false } = {}) {
  if (!Array.isArray(rows) || rows.length < 3 || !Array.isArray(keys) || keys.length < 1 || keys.length > 4
    || new Set(keys).size !== keys.length || !reference || !Number.isFinite(lambda) || lambda < 0
    || typeof nonnegative !== 'boolean' || keys.some(key => !positive(reference[key]))
    || rows.some(row => !positive(row?.hourlyUsd) || keys.some(key => !positive(row[key])))) return null;

  const n = rows.length, p = keys.length;
  const x = rows.map(row => keys.map(key => Math.log(row[key]) - Math.log(reference[key])));
  const y = rows.map(row => Math.log(row.hourlyUsd));
  const centers = keys.map((_, j) => average(x.map(row => row[j])));
  const scales = keys.map((_, j) => Math.sqrt(average(x.map(row => (row[j] - centers[j]) ** 2))));
  const constant = scales.map(value => value < 1e-12);
  const variable = keys.map((_, i) => i).filter(i => !constant[i]);
  const targetMean = average(y), target = y.map(value => value - targetMean);
  const z = x.map(row => row.map((value, j) => constant[j] ? 0 : (value - centers[j]) / scales[j]));
  const gram = Array.from({ length: p }, () => Array(p).fill(0));
  const covariance = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      covariance[j] += z[i][j] * target[i] / n;
      for (let k = 0; k <= j; k++) gram[j][k] += z[i][j] * z[i][k] / n;
    }
  }
  for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) gram[k][j] = gram[j][k];
  const rankDeficient = variable.length !== p || !cholesky(gram);
  if (lambda === 0 && rankDeficient) return null;
  const hessian = gram.map((row, j) => row.map((value, k) => value + (j === k ? lambda : 0)));

  let best = null;
  const candidates = nonnegative ? 2 ** variable.length : 1;
  for (let mask = 0; mask < candidates; mask++) {
    const active = nonnegative ? variable.filter((_, j) => mask & (1 << j)) : variable;
    const standardizedSlopes = Array(p).fill(0);
    let lower = null;
    if (active.length) {
      lower = cholesky(active.map(j => active.map(k => hessian[j][k])));
      if (!lower) continue;
      const coefficients = solve(lower, active.map(j => covariance[j]));
      if (!coefficients || (nonnegative && coefficients.some(value => value < -1e-10))) continue;
      active.forEach((j, index) => { standardizedSlopes[j] = nonnegative ? Math.max(0, coefficients[index]) : coefficients[index]; });
    }
    const residualMse = average(z.map((row, i) => (target[i] - dot(row, standardizedSlopes)) ** 2));
    const penalty = lambda * dot(standardizedSlopes, standardizedSlopes);
    const objective = residualMse + penalty;
    if (!Number.isFinite(objective)) continue;
    if (!best || objective < best.objective) best = { standardizedSlopes, active, lower, residualMse, penalty, objective };
  }
  if (!best) return null;

  // Independently verify first-order conditions rather than returning a merely
  // feasible face solution after a numerical failure elsewhere in the search.
  const gradient = hessian.map((row, j) => dot(row, best.standardizedSlopes) - covariance[j]);
  const maxKktViolation = Math.max(0, ...gradient.map((value, j) => nonnegative && best.standardizedSlopes[j] === 0 ? Math.max(0, -value) : Math.abs(value)));
  if (maxKktViolation > 1e-8 * Math.max(1, ...covariance.map(Math.abs))) return null;

  const slopes = best.standardizedSlopes.map((value, j) => constant[j] ? 0 : value / scales[j]);
  const logA = targetMean - dot(slopes, centers), A = Math.exp(logA);
  const logPredictions = x.map(row => logA + dot(row, slopes));
  const predictions = logPredictions.map(Math.exp);
  if (!positive(A) || predictions.some(value => !positive(value)) || slopes.some(value => !Number.isFinite(value))) return null;

  // Local effective degrees of freedom: intercept + trace(G_active H_active^-1).
  // With constraints this describes the selected face, not the selection search.
  let effectiveDegreesOfFreedom = 1;
  best.active.forEach((j, col) => {
    const inverseCol = solve(best.lower, best.active.map((_, k) => k === col ? 1 : 0));
    if (inverseCol) effectiveDegreesOfFreedom += dot(best.active.map(k => gram[j][k]), inverseCol);
  });
  return {
    A, logA, slopes, keys: keys.slice(), reference: { ...reference }, predictions,
    coefficientValues: [logA, ...slopes], logR2: logR2(y, logPredictions),
    lambda, nonnegative, standardizedSlopes: best.standardizedSlopes,
    constantKeys: keys.filter((_, j) => constant[j]), rankDeficient,
    constrainedKeys: nonnegative ? keys.filter((_, j) => best.standardizedSlopes[j] === 0) : [],
    normalization: { centerLogRatios: centers, scaleLogRatios: scales, targetLogMean: targetMean },
    trainingLogMse: best.residualMse, penalty: best.penalty, objective: best.objective,
    maxKktViolation, effectiveDegreesOfFreedom,
  };
}
