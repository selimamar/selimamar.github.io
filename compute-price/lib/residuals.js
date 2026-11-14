const positive = value => Number.isFinite(value) && value > 0;

/** Signed, held-out log-price errors. Invalid prices never enter the analysis. */
export function residualDiagnostics(validation) {
  const rows = (validation?.predictions ?? []).filter(row => positive(row.actual) && positive(row.predicted))
    .map(row => ({ ...row, residual: Math.log(row.actual) - Math.log(row.predicted) }));
  let mean = 0, m2 = 0;
  rows.forEach((row, index) => {
    const delta = row.residual - mean;
    mean += delta / (index + 1);
    m2 += delta * (row.residual - mean);
  });
  const n = rows.length;
  const variance = n ? Math.max(0, m2 / n) : null;
  const sigma = variance == null ? null : Math.sqrt(variance);
  const gaussian = n >= 2 && sigma > 1e-12 ? { mean, sigma,
    method: 'Normal maximum-likelihood fit: sample mean and population standard deviation (divisor n).' } : null;
  const average = fn => n ? rows.reduce((sum, row) => sum + fn(row), 0) / n : null;
  return {
    basis: 'The displayed model’s held-out whole-machine predictions; equal weight per configuration.',
    definition: 'e = ln(listed hourly price) - ln(held-out predicted hourly price)',
    validationMethod: validation?.method ?? null,
    sampleCount: n,
    inputCount: validation?.predictions?.length ?? 0,
    excludedCount: (validation?.predictions?.length ?? 0) - n,
    familyCount: new Set(rows.map(row => row.family).filter(Boolean)).size,
    mean: n ? mean : null, sigma, gaussian,
    skewness: gaussian ? average(row => ((row.residual - mean) / sigma) ** 3) : null,
    excessKurtosis: gaussian ? average(row => ((row.residual - mean) / sigma) ** 4) - 3 : null,
    rmsle: n ? Math.sqrt(average(row => row.residual ** 2)) : null,
    mape: average(row => Math.abs(row.predicted / row.actual - 1)),
    rows,
    interpretation: 'A Gaussian overlay describes shape, not proof of model adequacy. Check bias, error size and patterns across price levels. Related configurations and reused training folds make residuals dependent; no independent-normality p-value or prediction interval is claimed.',
  };
}

export function gaussianDensity(value, gaussian) {
  if (!Number.isFinite(value) || !Number.isFinite(gaussian?.mean) || !positive(gaussian?.sigma)) return null;
  const z = (value - gaussian.mean) / gaussian.sigma;
  return Math.exp(-0.5 * z * z) / (gaussian.sigma * Math.sqrt(2 * Math.PI));
}

/** Density normalization lets bars and the Gaussian share the same y scale. */
export function residualHistogram(rows, { min, max, binCount }) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)
    || !Number.isInteger(binCount) || binCount < 1) return [];
  const values = rows.map(row => row.residual).filter(value => Number.isFinite(value) && value >= min && value <= max);
  const width = (max - min) / binCount;
  const counts = Array(binCount).fill(0);
  for (const value of values) counts[Math.min(binCount - 1, Math.floor((value - min) / width))]++;
  return counts.map((count, index) => ({ low: min + index * width, high: min + (index + 1) * width,
    count, density: values.length ? count / (values.length * width) : 0 }));
}
