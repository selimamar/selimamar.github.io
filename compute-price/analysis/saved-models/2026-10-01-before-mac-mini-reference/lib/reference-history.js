// Retrospective fixed-quality reconstruction. Only archived prices enter old
// fits; today's measurements describe matched hardware, never historical prices.
import { fitPowerLaw, predictPrice, rSquared } from './model.js';

export const REFERENCE_HISTORY_VERSION = '1.0.0';
export const HISTORY_REFERENCE = Object.freeze({ ramGiB: 16, cpuScore: 20000, gpuCount: 1, bandwidthPerGpuGBps: 300 });
const CPU_KEYS = ['ramGiB', 'cpuScore'];
const CPU_REFERENCE = { ramGiB: 16, cpuScore: 5000 };
const positive = x => Number.isFinite(x) && x > 0;
const unique = xs => [...new Set(xs)].sort();
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const range = xs => xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
const same = (a, b) => positive(a) && positive(b) && Math.abs(a - b) < 1e-6;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const compactFit = fit => fit && Object.fromEntries(['A', 'logA', 'slopes', 'keys', 'reference', 'maxVif', 'logR2'].map(key => [key, fit[key]]));

function trainingMetrics(rows, predictions) {
  if (!rows.length || predictions.some(x => !positive(x))) return null;
  return {
    basis: 'In-sample diagnostics only; no out-of-sample accuracy claim.',
    logR2: rSquared(rows.map(r => Math.log(r.hourlyUsd)), predictions.map(Math.log)),
    mape: mean(rows.map((r, i) => Math.abs(predictions[i] / r.hourlyUsd - 1))),
    rmsle: Math.sqrt(mean(rows.map((r, i) => Math.log(predictions[i] / r.hourlyUsd) ** 2))),
  };
}

/** Fit H + k*n*B, k >= 0, minimizing equal-family whole-VM log MSE. */
export function fitHistoricalBandwidth(cpuFit, rows) {
  if (!cpuFit || !Array.isArray(rows) || rows.length < 2 || rows.some(r =>
    !positive(r.hourlyUsd) || !positive(r.gpuCount) || !positive(r.bandwidthPerGpuGBps) || !r.modelFamily)) return null;
  const counts = new Map();
  rows.forEach(r => counts.set(r.modelFamily, (counts.get(r.modelFamily) ?? 0) + 1));
  const observations = rows.map(r => ({ actual: r.hourlyUsd, host: predictPrice(cpuFit, r),
    bandwidth: r.gpuCount * r.bandwidthPerGpuGBps, weight: 1 / (counts.size * counts.get(r.modelFamily)) }));
  if (observations.some(r => !positive(r.host))) return null;
  // Above this bound every predicted price exceeds its observation, so the
  // derivative of every term is positive and no minimum can lie further right.
  const upper = Math.max(...observations.map(r => r.actual / r.bandwidth));
  const objective = fraction => observations.reduce((loss, r) =>
    loss + r.weight * Math.log((r.host + fraction * upper * r.bandwidth) / r.actual) ** 2, 0);
  // Bracket every local basin seen on both linear and logarithmic grids. The
  // log grid resolves near-zero optima; endpoint zero remains a true candidate.
  const grid = unique([0, 1, ...Array.from({ length: 1023 }, (_, i) => (i + 1) / 1024),
    ...Array.from({ length: 257 }, (_, i) => 10 ** (-14 + i * 14 / 256)),
    ...observations.map(r => Math.max(0, (r.actual - r.host) / r.bandwidth / upper))]).sort((a, b) => a - b);
  const losses = grid.map(objective);
  let best = { fraction: 0, loss: losses[0] }, basins = 0;
  const consider = fraction => { const loss = objective(fraction); if (loss < best.loss) best = { fraction, loss }; };
  grid.forEach(consider);
  for (let i = 1; i < grid.length - 1; i++) {
    if (losses[i] > losses[i - 1] || losses[i] > losses[i + 1]) continue;
    basins++;
    let left = grid[i - 1], right = grid[i + 1];
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = right - ratio * (right - left), b = left + ratio * (right - left);
    let fa = objective(a), fb = objective(b);
    for (let iteration = 0; iteration < 100; iteration++) {
      if (fa < fb) { right = b; b = a; fb = fa; a = right - ratio * (right - left); fa = objective(a); }
      else { left = a; a = b; fa = fb; b = left + ratio * (right - left); fb = objective(b); }
    }
    consider((left + right) / 2);
  }
  const k = upper * best.fraction;
  const predictions = observations.map(r => r.host + k * r.bandwidth);
  return { k, predictions, diagnostics: {
    objective: best.loss, objectiveName: 'Equal-family mean squared log error of whole-VM price',
    coefficientConstraint: 'k >= 0', solver: 'Bounded linear/log grid bracketing with golden-section refinement',
    upperBound: upper, candidateBasins: basins, atBoundary: k === 0,
    sampleCount: rows.length, familyCount: counts.size,
    atOrBelowCpuBaselineCount: observations.filter(r => r.actual <= r.host).length,
    ...trainingMetrics(rows, predictions),
  } };
}

/** Exact names, nominal hardware and publication-date eligibility are checked again here. */
export function joinHistoricalRows(snapshot, mapping) {
  const records = mapping?.records ?? [];
  const index = new Map(records.map(r => [r.id, r]));
  const rows = [], rejected = [], seen = new Set();
  const publication = snapshot.publicationDate ?? snapshot.date;
  if (!validTime(publication)) return { rows, rejected: [{ reason: 'invalid-publication-date' }] };
  for (const raw of snapshot.records ?? []) {
    const mapped = index.get(raw.id);
    const reject = reason => rejected.push({ id: raw.id, name: raw.name, reason });
    if (!mapped || mapped.provider !== 'aws' || raw.name !== mapped.name) { reject('missing-exact-benchmark-match'); continue; }
    if (seen.has(raw.id)) { reject('duplicate-machine'); continue; }
    if (!positive(raw.hourlyUsd) || !positive(mapped.cpuScore)) { reject('invalid-price-or-score'); continue; }
    if (!same(raw.ramGiB, mapped.ramGiB) || !same(raw.vcpus, mapped.vcpus)) { reject('hardware-mismatch'); continue; }
    if (raw.effectiveDate && (!validTime(raw.effectiveDate) || Date.parse(raw.effectiveDate) > Date.parse(publication))) { reject('price-not-effective-at-publication'); continue; }
    if (mapped.firstFamilyAvailability && Date.parse(mapped.firstFamilyAvailability) > Date.parse(publication)) { reject('family-not-yet-available'); continue; }
    const kind = mapped.type;
    if (raw.kind && raw.kind !== kind) { reject('hardware-kind-mismatch'); continue; }
    if (!['cpu', 'gpu'].includes(kind)) { reject('unsupported-hardware-kind'); continue; }
    if (kind === 'gpu' && (!positive(mapped.gpuCount) || !positive(mapped.bandwidthPerGpuGBps)
      || (raw.gpuCount != null && !same(raw.gpuCount, mapped.gpuCount)))) { reject('invalid-gpu-specifications'); continue; }
    seen.add(raw.id);
    rows.push({ id: raw.id, name: raw.name, provider: 'aws', kind, modelFamily: mapped.modelFamily,
      hourlyUsd: raw.hourlyUsd, ramGiB: raw.ramGiB, vcpus: raw.vcpus, cpuScore: mapped.cpuScore,
      ...(kind === 'gpu' ? { gpuCount: mapped.gpuCount, bandwidthPerGpuGBps: mapped.bandwidthPerGpuGBps,
        gpuModelGroup: mapped.gpuModelGroup } : {}),
      sku: raw.sku ?? null, rateCode: raw.rateCode ?? null, effectiveDate: raw.effectiveDate ?? null,
      priceSourceUrl: raw.priceSourceUrl ?? snapshot.sourceUrl ?? null,
      benchmarkMappingId: mapped.id,
    });
  }
  return { rows, rejected };
}

export function fitHistoricalSnapshot(snapshot, mapping) {
  const joined = joinHistoricalRows(snapshot, mapping);
  const cpuRows = joined.rows.filter(r => r.kind === 'cpu'), gpuRows = joined.rows.filter(r => r.kind === 'gpu');
  const cpuFit = cpuRows.length >= 4 ? fitPowerLaw(cpuRows, CPU_KEYS, CPU_REFERENCE) : null;
  const cpuRange = range(cpuRows.map(r => r.cpuScore)), ramRange = range(cpuRows.map(r => r.ramGiB));
  const cpuFamilies = unique(cpuRows.map(r => r.modelFamily));
  const gpuFamilies = unique(gpuRows.map(r => r.modelFamily));
  const gpuFit = fitHistoricalBandwidth(cpuFit, gpuRows);
  const hostHourlyUsd = cpuFit ? predictPrice(cpuFit, HISTORY_REFERENCE) : null;
  const outside = (value, limits) => !!limits && (value < limits[0] || value > limits[1]);
  const extrapolated = outside(HISTORY_REFERENCE.cpuScore, cpuRange) || outside(HISTORY_REFERENCE.ramGiB, ramRange);
  const bandwidthRange = range(gpuRows.map(r => r.bandwidthPerGpuGBps));
  const warnings = [];
  if (extrapolated) warnings.push('The CPU reference is outside at least one observed input range; the estimate extrapolates.');
  if (cpuFamilies.length < 4) warnings.push('The historical CPU sample contains fewer than four machine families.');
  if (gpuRows.length < 5 || gpuFamilies.length < 3) warnings.push('The historical GPU sample is small; no reliable out-of-sample accuracy estimate is claimed.');
  if (outside(HISTORY_REFERENCE.bandwidthPerGpuGBps, bandwidthRange)) warnings.push('The GPU bandwidth reference is outside the observed per-device bandwidth range.');
  if (!cpuFit) warnings.push('CPU fit unavailable: too few observations or a rank-deficient design.');
  if (!gpuFit) warnings.push('GPU fit unavailable: requires a valid host fit and at least two complete GPU observations.');
  return {
    date: (snapshot.publicationDate ?? snapshot.date)?.slice(0, 10) ?? null,
    kind: snapshot.kind ?? 'archived-catalog', year: snapshot.year ?? null,
    publicationDate: snapshot.publicationDate ?? snapshot.date ?? null,
    sourceUrl: snapshot.sourceUrl ?? null, sourceSha256: snapshot.sha256 ?? null,
    effectiveStart: snapshot.effectiveStart ?? null, effectiveEnd: snapshot.effectiveEnd ?? null,
    sourceVersion: snapshot.version ?? null, scope: 'aws-us-east-1',
    cpu: { status: cpuFit ? 'fitted' : 'unavailable', hourlyUsd: hostHourlyUsd,
      sampleCount: cpuRows.length, familyCount: cpuFamilies.length, families: cpuFamilies,
      scoreRange: cpuRange, ramRange, extrapolated, fit: compactFit(cpuFit),
      diagnostics: cpuFit ? trainingMetrics(cpuRows, cpuFit.predictions) : null },
    gpu: { status: gpuFit ? 'fitted' : 'unavailable', hourlyUsd: gpuFit ? hostHourlyUsd + HISTORY_REFERENCE.gpuCount * gpuFit.k * HISTORY_REFERENCE.bandwidthPerGpuGBps : null,
      hostHourlyUsd, gpuHourlyUsd: gpuFit ? HISTORY_REFERENCE.gpuCount * gpuFit.k * HISTORY_REFERENCE.bandwidthPerGpuGBps : null,
      k: gpuFit?.k ?? null, sampleCount: gpuRows.length, familyCount: gpuFamilies.length, families: gpuFamilies,
      gpuModelCount: unique(gpuRows.map(r => r.gpuModelGroup)).length,
      bandwidthRange, extrapolated: extrapolated || outside(HISTORY_REFERENCE.bandwidthPerGpuGBps, bandwidthRange),
      fitDiagnostics: gpuFit?.diagnostics ?? null },
    coverage: { sourceRecordCount: snapshot.records?.length ?? 0, matchedCount: joined.rows.length,
      rejectedCount: joined.rejected.length + (snapshot.rejectedHardwareMismatch?.length ?? 0),
      rejected: [...joined.rejected, ...(snapshot.rejectedHardwareMismatch ?? []).map(r => ({ id: r.id, name: r.name, reason: 'archive-hardware-mismatch', mismatchFields: r.mismatchFields }))] },
    warnings, rows: joined.rows,
  };
}

/** A separate AWS-only observation; never substitute the headline multi-provider fit. */
export function buildCurrentAwsHistoryPoint(catalog, mapping) {
  const records = (catalog?.instances ?? []).filter(r => r.provider === 'aws'
    && /^us-east-1(?:\s|$)/.test(r.region ?? '') && r.billingKind === 'on-demand');
  const observedAt = catalog?.providers?.find(p => p.id === 'aws')?.lastSuccessAt ?? catalog.updatedAt;
  return fitHistoricalSnapshot({ kind: 'current-catalog', publicationDate: observedAt,
    sourceUrl: records[0]?.priceSourceUrl ?? 'https://aws.amazon.com/ec2/pricing/on-demand/',
    records: records.map(r => ({ ...r, effectiveDate: r.pricePublishedAt ?? null })) }, mapping);
}

export function buildReferenceHistory(archive, mapping, catalog, { previous = null, generatedAt = new Date().toISOString() } = {}) {
  const historical = (archive?.snapshots ?? []).map(snapshot => fitHistoricalSnapshot(snapshot, mapping));
  // Retain actual daily observations already saved. Archives are rederived only
  // from the immutable archived source records, never from the current catalog.
  const saved = (previous?.points ?? []).filter(p => p.kind === 'current-catalog' && p.scope === 'aws-us-east-1');
  const current = catalog ? buildCurrentAwsHistoryPoint(catalog, mapping) : null;
  const pointsByKey = new Map([...historical, ...saved, ...(current ? [current] : [])]
    .filter(p => validTime(p.publicationDate)).map(p => [`${p.kind}:${p.date}`, p]));
  return {
    schemaVersion: 1, modelVersion: REFERENCE_HISTORY_VERSION, generatedAt,
    reference: { ...HISTORY_REFERENCE }, scope: 'aws-us-east-1', currency: 'USD',
    label: 'AWS historical reconstruction',
    methodology: {
      description: 'Refit the same functional forms to dated public AWS Linux on-demand price catalogs for US East (N. Virginia). This is a provider-specific reconstruction, separate from the current multi-provider reference price.',
      cpuFormula: 'H = A × (RAM/16)^alpha × (Geekbench6/5000)^beta; ordinary least squares of log price on log inputs.',
      gpuFormula: 'P = H + n × k × B; nonnegative k minimizes equal-family mean squared log error of whole-VM price.',
      benchmarkBasis: mapping?.benchmarkBasis ?? 'Later exact-VM Geekbench 6 measurements are frozen descriptors, not contemporaneous historical benchmarks.',
      dates: 'Points use actual archive publication dates. No prices are interpolated or carried into missing years.',
      matching: 'Exact instance name plus matching nominal RAM and vCPU count. No vCPU-to-performance imputation. Prices effective after their source publication are excluded.',
      uncertainty: 'Historical samples vary with catalog and benchmark coverage. Early samples are small; extrapolation and changing composition can move the series. Training diagnostics are not held-out validation. Values are nominal USD without inflation adjustment.',
      referenceMeaning: 'The 16 GiB / 20,000 Geekbench reference is hypothetical and may lie outside observed combinations. Marginal input-range flags do not establish joint support.',
      dailyObservations: 'Subsequent AWS catalog refreshes append dated current observations; these are not backfilled from present prices.',
    },
    sources: { archiveIndex: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/index.json',
      archiveFile: 'data/historical-aws-prices.json', benchmarkMappingFile: 'data/historical-benchmark-mapping.json',
      benchmarkRelease: mapping?.benchmarkReleaseSource ?? 'https://www.geekbench.com/blog/2023/02/geekbench-6/',
      benchmarkMappingGeneratedAt: mapping?.generatedAt ?? null },
    points: [...pointsByKey.values()].sort((a, b) => Date.parse(a.publicationDate) - Date.parse(b.publicationDate)),
  };
}
