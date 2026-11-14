import test from 'node:test';
import assert from 'node:assert/strict';
import { median, metricValue, eligibleInstances, summarizeMetric, sortInstances, freshness } from '../lib/metrics.js';

const vm = (overrides = {}) => ({
  provider: 'aws',
  name: 'm7i.large',
  hourlyUsd: 0.1008,
  ramGiB: 8,
  vramGiB: 0,
  vcpus: 2,
  geekbench6Multi: {
    score: 2500,
    url: 'https://browser.geekbench.com/v6/cpu/6609235',
    version: '6.3.0',
    vcpus: 2,
    ramGiB: 8,
  },
  ...overrides,
});

test('resource prices use the complete hourly rental and documented denominators', () => {
  assert.equal(metricValue(vm(), 'ram'), 0.0126);
  assert.equal(metricValue(vm(), 'cpu'), 0.04032);
  assert.equal(metricValue(vm({ hourlyUsd: 2, vramGiB: 80, gpu: '1 × NVIDIA A100' }), 'vram'), 0.025);
  assert.equal(metricValue(vm(), 'other'), null);
});

test('CPU score is the exact whole-machine measurement, without scaling by vCPU count', () => {
  const measured = vm({ vcpus: 32 });
  assert.equal(metricValue(measured, 'cpu'), 0.04032);
  assert.equal(metricValue(vm({ geekbench6Multi: null }), 'cpu'), null);
  assert.equal(metricValue(vm({ geekbench6Multi: { score: 2500 } }), 'cpu'), null);
});

test('invalid or zero prices and capacities cannot enter a price distribution', () => {
  for (const invalid of [0, -1, NaN, Infinity, null, undefined, '0.10']) {
    assert.equal(metricValue(vm({ hourlyUsd: invalid }), 'ram'), null);
  }
  for (const invalid of [0, -1, NaN, Infinity, null, undefined, '8']) {
    assert.equal(metricValue(vm({ ramGiB: invalid }), 'ram'), null);
    assert.equal(metricValue(vm({ vramGiB: invalid }), 'vram'), null);
  }
  for (const invalid of [0, -1, NaN, Infinity, null, undefined]) {
    assert.equal(metricValue(vm({ geekbench6Multi: { score: invalid, url: 'https://browser.geekbench.com/v6/cpu/6609235' } }), 'cpu'), null);
  }
});

test('RAM comparison excludes GPU machines and VRAM comparison excludes CPU-only machines', () => {
  const cpuOnly = vm();
  const gpuLabel = vm({ name: 'gpu-label', gpu: 'NVIDIA A100', vramGiB: 0 });
  const gpuMemory = vm({ name: 'gpu-memory', vramGiB: 80 });
  assert.deepEqual(eligibleInstances([cpuOnly, gpuLabel, gpuMemory], 'ram').map(row => row.name), ['m7i.large']);
  assert.deepEqual(eligibleInstances([cpuOnly, gpuLabel, gpuMemory], 'vram').map(row => row.name), ['gpu-memory']);
});

test('median handles even and odd samples without mutating the input', () => {
  const input = [0.04, 0.01, 0.03, 0.02];
  assert.equal(median(input), 0.025);
  assert.deepEqual(input, [0.04, 0.01, 0.03, 0.02]);
  assert.equal(median([0.03, 0.01, 0.02]), 0.02);
  assert.equal(median([NaN, Infinity, 0.02]), 0.02);
  assert.equal(median([]), null);
  assert.equal(median([NaN, Infinity]), null);
});

test('headline price is the median of eligible instance ratios, not ratio of totals or provider means', () => {
  const instances = [
    vm({ name: 'a', provider: 'aws', hourlyUsd: 0.08, ramGiB: 8 }),
    vm({ name: 'b', provider: 'aws', hourlyUsd: 0.16, ramGiB: 8 }),
    vm({ name: 'c', provider: 'azure', hourlyUsd: 0.96, ramGiB: 32 }),
    vm({ name: 'd', provider: 'digitalocean', hourlyUsd: 0.16, ramGiB: 4 }),
    vm({ name: 'invalid', provider: 'excluded-provider', hourlyUsd: 0 }),
  ];
  assert.deepEqual(summarizeMetric(instances, 'ram'), {
    value: 0.025,
    values: [0.01, 0.02, 0.03, 0.04],
    count: 4,
    providers: 3,
    min: 0.01,
    max: 0.04,
  });
  assert.deepEqual(summarizeMetric([], 'cpu'), {
    value: null, values: [], count: 0, providers: 0, min: null, max: null,
  });
});

test('price sorting distinguishes unit price from hourly price and preserves input order', () => {
  const instances = [
    vm({ name: 'small', hourlyUsd: 0.08, ramGiB: 4 }),
    vm({ name: 'large', hourlyUsd: 0.16, ramGiB: 16 }),
    vm({ name: 'alpha', hourlyUsd: 0.08, ramGiB: 8 }),
  ];
  assert.deepEqual(sortInstances(instances, 'ram').map(row => row.name), ['alpha', 'large', 'small']);
  assert.deepEqual(sortInstances(instances, 'ram', 'unit-desc').map(row => row.name), ['small', 'alpha', 'large']);
  assert.deepEqual(sortInstances(instances, 'ram', 'hourly-asc').map(row => row.name), ['alpha', 'small', 'large']);
  assert.deepEqual(instances.map(row => row.name), ['small', 'large', 'alpha']);
});

test('stale price snapshots and failed providers remain detectable independently', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  assert.deepEqual(freshness({ updatedAt: '2026-09-29T06:17:00Z' }, now), { stale: false, failed: [] });
  assert.equal(freshness({ updatedAt: '2026-09-28T00:00:00Z' }, now).stale, false);
  assert.equal(freshness({ updatedAt: '2026-09-27T23:59:59Z' }, now).stale, true);
  assert.equal(freshness({ updatedAt: 'invalid' }, now).stale, true);
  const providers = [
    { id: 'aws', status: 'ok' },
    { id: 'azure', status: 'stale' },
    { id: 'digitalocean', status: 'ok', error: 'source unavailable' },
  ];
  const status = freshness({ updatedAt: '2026-09-29T06:17:00Z', providers }, now);
  assert.equal(status.stale, false);
  assert.deepEqual(status.failed, providers.slice(1));
});

test('a recent snapshot cannot hide an old provider verification or retained price', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const updatedAt = '2026-09-29T06:17:00Z';
  assert.equal(freshness({ updatedAt, providers: [{ status: 'fresh', checkedAt: '2026-09-27T00:00:00Z' }] }, now).stale, true);
  assert.equal(freshness({ updatedAt, providers: [{ status: 'fresh', checkedAt: 'invalid' }] }, now).stale, true);
  assert.equal(freshness({ updatedAt, instances: [{ observedAt: '2026-09-27T00:00:00Z' }] }, now).stale, true);
  assert.equal(freshness({ updatedAt, instances: [{ observedAt: 'invalid' }] }, now).stale, true);
  assert.equal(freshness({ updatedAt, providers: [{ status: 'fresh', checkedAt: updatedAt }], instances: [{ observedAt: updatedAt }] }, now).stale, false);
});
