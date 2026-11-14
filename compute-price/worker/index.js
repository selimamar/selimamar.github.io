import seed from '../data/prices.json' with { type: 'json' };
import benchmarks from '../data/benchmarks.json' with { type: 'json' };
import catalogSeed from '../data/price-catalog.json' with { type: 'json' };
import expandedBenchmarks from '../data/cpu-benchmarks-expanded.json' with { type: 'json' };
import measuredBenchmarks from '../data/sparecores-benchmarks.json' with { type: 'json' };
import gpuBenchmarks from '../data/gpu-benchmarks.json' with { type: 'json' };
import { refreshSnapshot, refreshCatalog, withFreshness, attachGPUAndCPUBenchmarks, cpuMethodology, activeProviderSnapshot } from '../scripts/pricing.mjs';

const STORE_KEY = 'compute-price:v2';
const HOUR_MS = 60 * 60 * 1000;
const seeds = { prices: seed, catalog: catalogSeed };
const memorySnapshots = { ...seeds };
const inflight = { prices: null, catalog: null };
const catalogBenchmarks = [measuredBenchmarks, expandedBenchmarks];

export function needsRefresh(snapshot, now = new Date()) {
  const attempted = Date.parse(snapshot?.attemptedAt ?? '');
  if (!Number.isFinite(attempted)) return true;
  const dayChanged = new Date(attempted).toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
  const failed = snapshot.providers.some(p => p.status !== 'fresh');
  return dayChanged || (failed && now.getTime() - attempted >= HOUR_MS);
}

function validSnapshot(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.instances) && Array.isArray(value.providers);
}

function newest(snapshots, kind) {
  return activeProviderSnapshot(snapshots.filter(validSnapshot).sort((a, b) => Date.parse(b.attemptedAt ?? 0) - Date.parse(a.attemptedAt ?? 0))[0] ?? seeds[kind]);
}

async function readSnapshot(env, cacheKey, kind = 'prices') {
  const candidates = [seeds[kind], memorySnapshots[kind]];
  if (env.PRICES_KV) {
    try { candidates.push(await env.PRICES_KV.get(kind === 'prices' ? STORE_KEY : `${STORE_KEY}:catalog`, 'json')); } catch { /* edge cache and seed remain available */ }
  }
  if (cacheKey && globalThis.caches?.default) {
    try {
      const cached = await caches.default.match(cacheKey);
      if (cached) candidates.push(await cached.json());
    } catch { /* use the newest available persisted snapshot */ }
  }
  return newest(candidates, kind);
}

async function persistSnapshot(snapshot, env, cacheKey, kind) {
  memorySnapshots[kind] = snapshot;
  const writes = [];
  if (env.PRICES_KV) writes.push(env.PRICES_KV.put(kind === 'prices' ? STORE_KEY : `${STORE_KEY}:catalog`, JSON.stringify(snapshot)));
  if (cacheKey && globalThis.caches?.default) writes.push(caches.default.put(cacheKey,
    new Response(JSON.stringify(snapshot), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=604800' } })));
  // An unavailable persistence service must not turn fresh public prices into an API error.
  await Promise.allSettled(writes);
}

async function update(previous, env, cacheKey, kind = 'prices') {
  if (!inflight[kind]) inflight[kind] = (kind === 'catalog' ? refreshCatalog : refreshSnapshot)(previous,
    { benchmarks: kind === 'catalog' ? catalogBenchmarks : benchmarks, gpuBenchmarks })
    .then(async snapshot => { await persistSnapshot(snapshot, env, cacheKey, kind); return snapshot; })
    .finally(() => { inflight[kind] = null; });
  return inflight[kind];
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);
    if (!['/api/prices', '/api/catalog'].includes(url.pathname)) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const kind = url.pathname === '/api/catalog' ? 'catalog' : 'prices';
    const cacheKey = new Request(new URL(`/__compute_${kind}_snapshot_v2`, url.origin));
    let snapshot = await readSnapshot(env, cacheKey, kind);
    // First visit each UTC day refreshes even on hosts without scheduled jobs.
    if (needsRefresh(snapshot)) {
      const refreshTask = update(snapshot, env, cacheKey, kind);
      if (ctx.waitUntil) ctx.waitUntil(refreshTask);
      snapshot = await refreshTask;
    }
    const references = kind === 'catalog' ? catalogBenchmarks : benchmarks;
    const body = { ...withFreshness(snapshot),
      instances: attachGPUAndCPUBenchmarks(snapshot.instances, references, gpuBenchmarks),
      benchmarkMethodology: cpuMethodology(references), gpuBenchmarkMethodology: gpuBenchmarks.methodology,
      servedAt: new Date().toISOString(), refreshMode: 'daily-on-request' };
    if (kind === 'catalog') body.coverage = { ...snapshot.coverage,
      cpuBenchmarkShapes: body.instances.filter(row => row.geekbench6Multi).length,
      gpuBenchmarkShapes: body.instances.filter(row => row.geekbenchGpu).length };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' },
    });
  },
  async scheduled(event, env = {}, ctx = {}) {
    const task = Promise.all(['prices', 'catalog'].map(kind => readSnapshot(env, null, kind).then(previous => update(previous, env, null, kind))));
    if (ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  },
};
