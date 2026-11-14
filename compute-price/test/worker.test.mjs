import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { needsRefresh } from '../worker/index.js';
import seed from '../data/prices.json' with { type: 'json' };
import catalogSeed from '../data/price-catalog.json' with { type: 'json' };

test('Daily Worker refresh follows UTC day boundary, even less than 24 hours apart', () => {
  const snapshot = { attemptedAt: '2026-09-29T23:59:59Z', providers: [{ status: 'fresh' }] };
  assert.equal(needsRefresh(snapshot, new Date('2026-09-30T00:00:01Z')), true);
  assert.equal(needsRefresh(snapshot, new Date('2026-09-29T23:59:59Z')), false);
});

test('Failed providers retry after one hour and malformed timestamps trigger refresh', () => {
  const snapshot = { attemptedAt: '2026-09-29T02:00:00Z', providers: [{ status: 'stale' }] };
  assert.equal(needsRefresh(snapshot, new Date('2026-09-29T02:59:00Z')), false);
  assert.equal(needsRefresh(snapshot, new Date('2026-09-29T03:00:00Z')), true);
  assert.equal(needsRefresh({ ...snapshot, attemptedAt: 'invalid' }), true);
});

test('API serves the latest persisted observation without refreshing a successful same-day check', async () => {
  const now = new Date().toISOString();
  const snapshot = { ...seed, attemptedAt: now, updatedAt: now,
    providers: seed.providers.map(p => ({ ...p, status: 'fresh', checkedAt: now, lastSuccessAt: now })) };
  let reads = 0;
  const response = await worker.fetch(new Request('https://example.org/api/prices'), {
    PRICES_KV: { async get(key, mode) { reads++; assert.equal(mode, 'json'); return snapshot; } },
  });
  assert.equal(reads, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.updatedAt, now);
  assert.equal(data.instances.length, 17);
  assert.ok(data.servedAt);
  const head = await worker.fetch(new Request('https://example.org/api/prices', { method: 'HEAD' }), {
    PRICES_KV: { async get() { return snapshot; } },
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.match(head.headers.get('Content-Type'), /application\/json/);
});

test('Worker routes assets, returns 404 without asset binding, and rejects API writes', async () => {
  const asset = await worker.fetch(new Request('https://example.org/'), { ASSETS: { fetch: async () => new Response('site') } });
  assert.equal(await asset.text(), 'site');
  assert.equal((await worker.fetch(new Request('https://example.org/missing'))).status, 404);
  const refused = await worker.fetch(new Request('https://example.org/api/prices', { method: 'POST' }));
  assert.equal(refused.status, 405);
  assert.equal(refused.headers.get('Allow'), 'GET, HEAD');
});

test('Catalog endpoint reads a separate persistent key and returns unique priced shapes with provenance', async () => {
  const now = new Date().toISOString();
  const snapshot = { ...catalogSeed, attemptedAt: now, updatedAt: now,
    providers: catalogSeed.providers.map(p => ({ ...p, status: 'fresh', checkedAt: now, lastSuccessAt: now })) };
  const response = await worker.fetch(new Request('https://example.org/api/catalog'), {
    PRICES_KV: { async get(key) { assert.equal(key, 'compute-price:v2:catalog'); return snapshot; } },
  });
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.ok(catalog.instances.length > 1000);
  assert.equal(new Set(catalog.instances.map(row => `${row.provider}:${row.name}`)).size, catalog.instances.length);
  assert.ok(catalog.instances.every(row => row.priceSourceUrl && row.observedAt && row.hourlyUsd > 0));
});

test('A cached old catalog cannot restore an excluded provider', async () => {
  const now = new Date().toISOString();
  const snapshot = { ...catalogSeed, updatedAt: now, attemptedAt: now,
    providers: [...catalogSeed.providers.map(p => ({ ...p, status: 'fresh' })), { id: 'digitalocean', status: 'fresh' }],
    instances: [...catalogSeed.instances, { id: 'digitalocean:old', provider: 'digitalocean', hourlyUsd: 1 }] };
  const response = await worker.fetch(new Request('https://example.org/api/catalog'), {
    PRICES_KV: { async get() { return snapshot; } },
  });
  const data = await response.json();
  assert.equal(data.instances.some(row => row.provider === 'digitalocean'), false);
  assert.equal(data.providers.some(row => row.id === 'digitalocean'), false);
  assert.equal(data.coverage.instanceCount, data.instances.length);
});
