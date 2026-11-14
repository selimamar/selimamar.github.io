import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPowerLaw } from '../lib/model.js';
import { fitHistoricalBandwidth, joinHistoricalRows, fitHistoricalSnapshot,
  buildCurrentAwsHistoryPoint, buildReferenceHistory, HISTORY_REFERENCE } from '../lib/reference-history.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const host = r => 0.25 * (r.ramGiB / 16) ** 0.3 * (r.cpuScore / 5000) ** 0.4;
function fixture() {
  const cpu = [];
  for (const ramGiB of [8, 16, 32]) for (const cpuScore of [2000, 5000, 12000]) {
    const r = { id: `aws:c${ramGiB}.${cpuScore}`, name: `c${ramGiB}.${cpuScore}`, provider: 'aws',
      kind: 'cpu', type: 'cpu', modelFamily: `aws:c${ramGiB}`, vcpus: cpuScore / 1000, ramGiB, cpuScore };
    cpu.push({ ...r, hourlyUsd: host(r) });
  }
  const gpu = [100, 300, 700, 1200].map((bandwidthPerGpuGBps, i) => {
    const r = { id: `aws:g${i}.large`, name: `g${i}.large`, provider: 'aws', kind: 'gpu', type: 'gpu',
      modelFamily: `aws:g${i % 2}`, gpuModelGroup: `gpu${i}`, vcpus: 8, ramGiB: 32,
      cpuScore: 5000, gpuCount: i + 1, bandwidthPerGpuGBps };
    return { ...r, hourlyUsd: host(r) + 0.0025 * r.gpuCount * bandwidthPerGpuGBps };
  });
  return { cpu, gpu, mapping: { records: [...cpu, ...gpu] },
    snapshot: { date: '2016-10-26', publicationDate: '2016-10-26T20:54:55Z', year: 2016,
      sourceUrl: 'https://example.test/2016.csv', records: [...cpu, ...gpu].map(r => ({ ...r, effectiveDate: '2016-10-01' })) } };
}

test('historical bandwidth fit recovers a known coefficient and applies GPU count exactly once, including two-row cohorts', () => {
  const { cpu, gpu, snapshot, mapping } = fixture();
  const cpuFit = fitPowerLaw(cpu, ['ramGiB', 'cpuScore'], { ramGiB: 16, cpuScore: 5000 });
  for (const rows of [gpu, gpu.slice(0, 2)]) {
    const fit = fitHistoricalBandwidth(cpuFit, rows);
    near(fit.k, 0.0025);
    fit.predictions.forEach((p, i) => near(p, rows[i].hourlyUsd));
    near(fit.diagnostics.objective, 0);
  }
  const point = fitHistoricalSnapshot(snapshot, mapping);
  near(point.cpu.hourlyUsd, host(HISTORY_REFERENCE));
  near(point.gpu.hourlyUsd, host(HISTORY_REFERENCE) + 0.0025 * HISTORY_REFERENCE.bandwidthPerGpuGBps);
  assert.equal(point.cpu.extrapolated, true);
  assert.equal(point.date, '2016-10-26');
});

test('historical constrained fit keeps every below-baseline observation and returns zero at the boundary', () => {
  const { cpu, gpu } = fixture();
  const cpuFit = fitPowerLaw(cpu, ['ramGiB', 'cpuScore'], { ramGiB: 16, cpuScore: 5000 });
  const rows = gpu.map(r => ({ ...r, hourlyUsd: host(r) * 0.8 }));
  const fit = fitHistoricalBandwidth(cpuFit, rows);
  assert.equal(fit.k, 0);
  assert.equal(fit.diagnostics.atBoundary, true);
  assert.equal(fit.diagnostics.atOrBelowCpuBaselineCount, rows.length);
  assert.equal(fit.diagnostics.sampleCount, rows.length);
});

test('historical GPU objective gives each family equal weight despite duplicated sizes', () => {
  const { cpu, gpu } = fixture();
  const cpuFit = fitPowerLaw(cpu, ['ramGiB', 'cpuScore'], { ramGiB: 16, cpuScore: 5000 });
  const rows = gpu.map(r => ({ ...r, hourlyUsd: r.hourlyUsd * (r.modelFamily === 'aws:g0' ? 2 : 1) }));
  const many = [...rows, ...Array.from({ length: 20 }, () => rows.filter(r => r.modelFamily === 'aws:g0')).flat()];
  const a = fitHistoricalBandwidth(cpuFit, rows), b = fitHistoricalBandwidth(cpuFit, many);
  near(a.k, b.k);
  near(a.diagnostics.objective, b.diagnostics.objective);
});

test('historical joins refuse future prices, mismatched hardware and unverified shapes, and use frozen scores only', () => {
  const { snapshot, mapping } = fixture();
  snapshot.records[0].effectiveDate = '2016-10-27';
  snapshot.records[1].ramGiB *= 2;
  snapshot.records[2].id = 'aws:unverified';
  snapshot.records[3].cpuScore = 999999999;
  snapshot.records[4].effectiveDate = 'invalid';
  const joined = joinHistoricalRows(snapshot, mapping);
  assert.equal(joined.rejected.length, 4);
  assert.ok(joined.rejected.some(r => r.reason === 'price-not-effective-at-publication'));
  assert.ok(joined.rejected.some(r => r.reason === 'hardware-mismatch'));
  const retained = joined.rows.find(r => r.id === snapshot.records[3].id);
  assert.equal(retained.cpuScore, mapping.records[3].cpuScore);
  assert.equal(retained.hourlyUsd, snapshot.records[3].hourlyUsd);
});

test('historical points are derived only from actual archived prices, independently of current-price changes', () => {
  const { snapshot, mapping } = fixture();
  const catalog = { updatedAt: '2026-09-29T12:00:00Z', instances: snapshot.records.map(r => ({ ...r,
    region: 'us-east-1 · N. Virginia', billingKind: 'on-demand', hourlyUsd: r.hourlyUsd / 2 })) };
  const a = buildReferenceHistory({ snapshots: [snapshot] }, mapping, catalog, { generatedAt: 'fixed' });
  const b = buildReferenceHistory({ snapshots: [snapshot] }, mapping, { ...catalog,
    instances: catalog.instances.map(r => ({ ...r, hourlyUsd: r.hourlyUsd * 5 })) }, { generatedAt: 'fixed' });
  assert.deepEqual(a.points[0], b.points[0]);
  assert.notEqual(a.points[1].cpu.hourlyUsd, b.points[1].cpu.hourlyUsd);
  assert.equal(a.points.length, 2);
  assert.equal(a.points[0].date, '2016-10-26');
  assert.equal(a.points[1].kind, 'current-catalog');
  assert.equal(a.points[1].scope, 'aws-us-east-1');
});

test('daily refresh retains prior current observations and replaces only the same observed date', () => {
  const { snapshot, mapping } = fixture();
  const catalog = { updatedAt: '2026-09-28T12:00:00Z', instances: snapshot.records.map(r => ({ ...r,
    region: 'us-east-1 · N. Virginia', billingKind: 'on-demand' })) };
  const previous = buildReferenceHistory({ snapshots: [snapshot] }, mapping, catalog);
  const nextCatalog = { ...catalog, updatedAt: '2026-09-29T12:00:00Z' };
  const next = buildReferenceHistory({ snapshots: [snapshot] }, mapping, nextCatalog, { previous });
  assert.equal(next.points.length, 3);
  assert.deepEqual(next.points[1], previous.points[1]);
  const again = buildReferenceHistory({ snapshots: [snapshot] }, mapping, nextCatalog, { previous: next });
  assert.equal(again.points.length, 3);
});

test('current AWS observation excludes other regions, providers and spot prices', () => {
  const { snapshot, mapping } = fixture();
  const rows = snapshot.records.map(r => ({ ...r, region: 'us-east-1 · N. Virginia', billingKind: 'on-demand' }));
  const catalog = { updatedAt: '2026-09-29T12:00:00Z', instances: [
    ...rows, ...rows.map(r => ({ ...r, provider: 'gcp' })), ...rows.map(r => ({ ...r, region: 'us-west-2' })),
    ...rows.map(r => ({ ...r, billingKind: 'spot' })),
  ] };
  const point = buildCurrentAwsHistoryPoint(catalog, mapping);
  assert.equal(point.coverage.sourceRecordCount, rows.length);
  assert.equal(point.coverage.rejectedCount, 0);
});

test('changing the reference reevaluates saved daily fits without changing prices, sources or dates', () => {
  const { snapshot, mapping } = fixture();
  const catalog = { updatedAt: '2026-09-28T12:00:00Z', instances: snapshot.records.map(r => ({ ...r,
    region: 'us-east-1 · N. Virginia', billingKind: 'on-demand' })) };
  const previous = buildReferenceHistory({ snapshots: [snapshot] }, mapping, catalog);
  const oldReference = { ramGiB: 16, cpuScore: 20000, gpuCount: 1, bandwidthPerGpuGBps: 300 };
  const saved = previous.points.find(p => p.kind === 'current-catalog');
  previous.reference = oldReference;
  saved.cpu.hourlyUsd = host(oldReference);
  saved.gpu.hostHourlyUsd = host(oldReference);
  saved.gpu.gpuHourlyUsd = 0.0025 * 300;
  saved.gpu.hourlyUsd = saved.gpu.hostHourlyUsd + saved.gpu.gpuHourlyUsd;
  saved.gpu.bandwidthRange = [200, 1200];
  saved.gpu.extrapolated = false;
  const original = structuredClone(previous);
  const next = buildReferenceHistory({ snapshots: [snapshot] }, mapping, null, { previous });
  const updated = next.points.find(p => p.kind === 'current-catalog');
  near(updated.cpu.hourlyUsd, host(HISTORY_REFERENCE));
  near(updated.gpu.hourlyUsd, host(HISTORY_REFERENCE) + 0.0025 * HISTORY_REFERENCE.bandwidthPerGpuGBps);
  assert.equal(updated.gpu.extrapolated, true);
  assert.ok(updated.warnings.includes('The GPU bandwidth reference is outside the observed per-device bandwidth range.'));
  assert.equal(updated.date, saved.date);
  assert.equal(updated.sourceUrl, saved.sourceUrl);
  assert.deepEqual(updated.rows, saved.rows);
  assert.deepEqual(updated.cpu.fit, saved.cpu.fit);
  assert.deepEqual(previous, original);
});

test('a failed AWS refresh does not relabel stale prices with another provider’s newer catalog date', () => {
  const { snapshot, mapping } = fixture();
  const catalog = { updatedAt: '2026-09-29T12:00:00Z',
    providers: [{ id: 'aws', status: 'stale', lastSuccessAt: '2026-09-28T12:00:00Z' }],
    instances: snapshot.records.map(r => ({ ...r, region: 'us-east-1', billingKind: 'on-demand' })) };
  assert.equal(buildCurrentAwsHistoryPoint(catalog, mapping).date, '2026-09-28');
});
