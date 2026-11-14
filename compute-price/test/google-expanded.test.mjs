import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseGCPCatalogPage, readGooglePricingHTML } from '../scripts/pricing.mjs';
import { augmentGoogleCatalog, parseGoogleNetworkPrices, composeGoogleMultiGpu } from '../scripts/providers/google.mjs';
const pages = JSON.parse(await readFile(new URL('fixtures/google-expanded.json', import.meta.url), 'utf8')).pages;
const now = '2026-09-29T06:00:00.000Z';
const host = { id: 'gcp:n1-standard-1', provider: 'gcp', name: 'n1-standard-1', region: 'us-central1 · Iowa',
  vcpus: 1, ramGiB: 3.75, hourlyUsd: 0.0475, observedAt: now, priceSourceUrl: 'https://cloud.google.com/products/compute/pricing/general-purpose' };

test('Network shapes use documented binary memory and Iowa default hourly price', () => {
  const rows = parseGoogleNetworkPrices(pages['network-optimized'], now);
  assert.equal(rows.length, 34);
  const c4n = rows.find(row => row.name === 'c4n-standard-2');
  assert.equal(c4n.hourlyUsd, 0.154987);
  assert.equal(c4n.vcpus, 2);
  assert.equal(c4n.ramGiB, 7);
  assert.equal(rows.find(row => row.name === 'm4n-hypermem-16').hourlyUsd, 2.5664656);
  assert.equal(parseGoogleNetworkPrices(pages['network-optimized'].replaceAll('Iowa (us-central1)', 'London (europe-west2)'), now).length, 0);
  assert.equal(parseGoogleNetworkPrices(pages['network-optimized'].replaceAll('(USD)', '(EUR)'), now).length, 0);
  assert.equal(parseGoogleNetworkPrices(pages['network-optimized'].replaceAll('/ 1 hour', '/ 1 month'), now).length, 0);
  assert.throws(() => parseGoogleNetworkPrices(pages['network-optimized'].replace('JEDEC binary gigabytes', 'decimal gigabytes'), now), /memory convention/);
});

test('Multi-GPU bundles use explicit per-device rates and legal published CPU/RAM limits', () => {
  const large = { ...host, id: 'gcp:n1-standard-64', name: 'n1-standard-64', vcpus: 64, ramGiB: 240, hourlyUsd: 3.04 };
  const rows = composeGoogleMultiGpu([host, large], pages['gpus-pricing'], now);
  const twoT4 = rows.find(row => row.name === 'n1-standard-1 + 2× T4');
  assert.equal(twoT4.hourlyUsd, 0.0475 + 2 * 0.35);
  assert.equal(twoT4.vramGiB, 32);
  assert.equal(twoT4.cpuBenchmarkName, 'n1-standard-1');
  assert.equal(twoT4.cpuBenchmarkBasis, 'exact-underlying-host-shape');
  assert.ok(rows.every(row => row.gpuCount > 1 && !row.gpuScore && !row.geekbenchGpu));
  assert.deepEqual(rows.filter(row => row.baseMachineName === large.name).map(row => [row.gpu, row.gpuCount]), [['NVIDIA T4', 4], ['NVIDIA P4', 4], ['NVIDIA V100', 8]]);
  assert.ok(rows.every(row => Math.abs(row.hourlyUsd - row.priceComponents.reduce((sum, part) => sum + part.hourlyUsd, 0)) < 1e-12));
  assert.throws(() => composeGoogleMultiGpu([host], pages['gpus-pricing'].replaceAll(' per GPU', ''), now), /incomplete/);
  assert.throws(() => composeGoogleMultiGpu([host], pages['gpus-pricing'].replaceAll('Iowa (us-central1)', 'London (europe-west2)'), now), /incomplete/);
});

test('Augmentation restores published VM Shape rows, adds network machines and deduplicates base shapes', async () => {
  const options = { parsePage: parseGCPCatalogPage, readHTML: readGooglePricingHTML, htmlByPage: pages };
  const extras = await augmentGoogleCatalog([host], () => { throw new Error('Cached source fetched again'); }, now, options);
  assert.equal(extras.length, 36 + 34 + 7);
  assert.equal(extras.find(row => row.name === 'c4-standard-4-lssd').hourlyUsd, 0.279861781);
  assert.equal(extras.find(row => row.name === 'c4a-standard-4-lssd').ramGiB, 16);
  const next = await augmentGoogleCatalog([host, ...extras], () => { throw new Error('Unexpected network'); }, now, options);
  assert.deepEqual(next, []);
});
