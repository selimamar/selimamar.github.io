import test from 'node:test';
import assert from 'node:assert/strict';
import { getFitDataRows, filterFitDataRows, fitDataHead, renderFitDataRows } from '../lib/fit-data-view.js';

test('CPU table contains exactly the displayed fitting cohort, with authoritative fit values and held-out prices', () => {
  const report = { cpu: { displayed: { rows: [
    { id: 'one', name: 'used', hourlyUsd: 0.25, cpuScore: null, fittedPrice: 999, heldOutPrice: 0.4 },
    { id: 'two', name: 'also used', hourlyUsd: 0.5, heldOutPrice: 0.6 },
  ], validation: { predictions: [{ id: 'one', predicted: 0.3 }] } }, selected: { rows: [{ id: 'wrong-model' }] } } };
  const annotated = [
    { id: 'one', name: 'stale', hourlyUsd: 99, cpuScore: 100, region: 'us-east-1', priceSourceUrl: 'https://example.com/price' },
    { id: 'unused', hourlyUsd: 2 },
  ];
  const rows = getFitDataRows(report, null, annotated, 'cpu');
  assert.deepEqual(rows.map(row => row.id), ['one', 'two']);
  assert.equal(rows[0].hourlyUsd, 0.25);
  assert.equal(rows[0].cpuScore, null);
  assert.equal(rows[0].name, 'used');
  assert.equal(rows[0].region, 'us-east-1');
  assert.equal(rows[0].heldOutPrice, 0.3);
  assert.equal(rows[1].heldOutPrice, 0.6);
  assert.equal(annotated[0].hourlyUsd, 99);
});

test('GPU table requires the restricted bandwidth fit and never uses old-model or training predictions', () => {
  const resources = { rows: [{ id: 'gpu', hourlyUsd: 1, heldOutPrice: 999 }, { id: 'missing', hourlyUsd: 2 }],
    variants: [{ id: 'gpu-resource-additive', fit: {}, validation: { predictions: [{ id: 'gpu', predicted: 88 }] } }],
    singleResourceComparison: { variants: [{ id: 'gpu-bandwidth-linear', fit: {},
      validation: { predictions: [{ id: 'gpu', predicted: 1.2 }] }, training: { predictions: [{ id: 'missing', predicted: 77 }] } }] } };
  const rows = getFitDataRows(null, resources, [], 'gpu');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].heldOutPrice, 1.2);
  assert.equal(rows[1].heldOutPrice, null);
  assert.deepEqual(getFitDataRows(null, { ...resources, singleResourceComparison: null }, [], 'gpu'), []);
  assert.deepEqual(getFitDataRows(null, null, [], 'cpu'), []);
});

test('table renders source-linked model inputs, per-GPU bandwidth, and four-decimal prices', () => {
  const row = { provider: 'gcp', name: 'g2-standard-12', region: 'Iowa', ramGiB: 48, cpuScore: 5383,
    gpuCount: 1, gpu: 'NVIDIA L4', bandwidthPerGpuGBps: 300, gpuMemoryBandwidthGBps: 999,
    hourlyUsd: 1.000416348, heldOutPrice: 1.2, priceSourceUrl: 'https://cloud.google.com/price',
    cpuBenchmarks: [{ url: 'https://example.com/geekbench' }],
    bandwidthProvenance: { bandwidthSourceUrls: ['https://example.com/bandwidth'] } };
  const html = renderFitDataRows([row], 'gpu');
  assert.equal((html.match(/<td /g) ?? []).length, 7);
  for (const expected of ['Google Cloud', 'Iowa', '1 × NVIDIA L4', '5,383', '$1.0004', '$1.2000', 'href="https://example.com/geekbench"', 'href="https://example.com/bandwidth"', '>300</a>']) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes('999'));
  assert.equal((fitDataHead('cpu').match(/<th /g) ?? []).length, 6);
  assert.equal((fitDataHead('gpu').match(/<th /g) ?? []).length, 7);
});

test('table escapes catalog text, rejects unsafe source URLs, and keeps missing scores missing', () => {
  const html = renderFitDataRows([{ provider: '<script>evil</script>', name: '"<img src=x>', region: '<b>region</b>',
    ramGiB: 16, cpuScore: null, hourlyUsd: 0.1, priceSourceUrl: 'javascript:alert(1)',
    cpuBenchmarks: [{ url: 'https://example.com/benchmark' }] }], 'cpu');
  assert.ok(html.includes('&lt;script&gt;evil&lt;/script&gt;'));
  assert.ok(html.includes('&quot;&lt;img src=x&gt;'));
  assert.ok(!html.includes('<script>') && !html.includes('<img') && !html.includes('javascript:'));
  assert.ok(!html.includes('href='));
  assert.match(html, /<td class="fit-data-number">—<\/td>/);
  assert.ok(!html.includes('NaN'));
});

test('filtering searches human-readable provider names, preserves input order, and pagination is explicit', () => {
  const rows = [{ id: 'a', provider: 'gcp', name: 'large', region: 'Iowa', hourlyUsd: 2 },
    { id: 'b', provider: 'aws', name: 'small', hourlyUsd: 0.5 },
    { id: 'c', provider: 'gcp', name: 'medium', hourlyUsd: 1 }];
  assert.deepEqual(filterFitDataRows(rows).map(row => row.id), ['b', 'c', 'a']);
  assert.deepEqual(filterFitDataRows(rows, { search: 'google cloud', sort: 'price-desc' }).map(row => row.id), ['a', 'c']);
  assert.deepEqual(filterFitDataRows(rows, { provider: 'gcp', search: 'iowa' }).map(row => row.id), ['a']);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  assert.equal((renderFitDataRows(rows, 'cpu', { limit: 1 }).match(/<tr>/g) ?? []).length, 1);
  assert.match(renderFitDataRows([], 'gpu'), /colspan="7"/);
  assert.match(renderFitDataRows([], 'cpu'), /No configurations match/);
});
