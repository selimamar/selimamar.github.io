import { readFile, writeFile, rename } from 'node:fs/promises';
import { refreshSnapshot, refreshCatalog, PROVIDERS, activeProviderSnapshot } from './pricing.mjs';

const target = new URL('../data/prices.json', import.meta.url);
const temporary = new URL('../data/prices.json.tmp', import.meta.url);
let previous = null;
try { previous = JSON.parse(await readFile(target, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const benchmarks = JSON.parse(await readFile(new URL('../data/benchmarks.json', import.meta.url), 'utf8'));
const expandedBenchmarks = JSON.parse(await readFile(new URL('../data/cpu-benchmarks-expanded.json', import.meta.url), 'utf8'));
const measuredBenchmarks = JSON.parse(await readFile(new URL('../data/sparecores-benchmarks.json', import.meta.url), 'utf8'));
const gpuBenchmarks = JSON.parse(await readFile(new URL('../data/gpu-benchmarks.json', import.meta.url), 'utf8'));
const catalogTarget = new URL('../data/price-catalog.json', import.meta.url);
const catalogTemporary = new URL('../data/price-catalog.json.tmp', import.meta.url);
let previousCatalog = null;
try { previousCatalog = JSON.parse(await readFile(catalogTarget, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const requests = new Map();
const fetcher = async (url, options) => {
  if (!requests.has(url)) requests.set(url, fetch(url, options).catch(error => { requests.delete(url); throw error; }));
  return (await requests.get(url)).clone();
};
const selectedProvider = process.argv.find(arg => arg.startsWith('--provider='))?.slice('--provider='.length);
const providerIds = selectedProvider?.split(',');
if (providerIds?.some(id => !PROVIDERS.some(provider => provider.id === id))) throw new Error('Unknown provider. Use aws, azure, gcp, alibaba, oracle or ibm.');
const now = new Date().toISOString();
const [result, catalog] = await Promise.all([
  selectedProvider ? Promise.resolve(activeProviderSnapshot(previous)) : refreshSnapshot(previous, { benchmarks, gpuBenchmarks, fetcher, now }),
  refreshCatalog(previousCatalog, { benchmarks: [measuredBenchmarks, expandedBenchmarks], gpuBenchmarks, fetcher, now, ...(providerIds ? { providerIds } : {}) }),
]);
if (!result.instances.length) throw new Error('No provider returned usable prices; existing file was not changed.');
if (!catalog.instances.length) throw new Error('No provider returned a usable catalog; existing files were not changed.');
await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`);
await writeFile(catalogTemporary, `${JSON.stringify(catalog, null, 2)}\n`);
await rename(temporary, target);
await rename(catalogTemporary, catalogTarget);
const checkedProviders = selectedProvider ? catalog.providers.filter(provider => providerIds.includes(provider.id))
  : [...result.providers, ...catalog.providers];
for (const provider of checkedProviders) {
  console.log(`${provider.name}: ${provider.status}${provider.error ? ` (${provider.error})` : ''}`);
}
if (!selectedProvider) console.log(`Saved ${result.instances.length} instance rates; actual check ${result.attemptedAt}.`);
console.log(`Saved ${catalog.instances.length} unique catalog shapes; ${catalog.coverage.cpuBenchmarkShapes} CPU and ${catalog.coverage.gpuBenchmarkShapes} exact GPU benchmark matches.`);
console.log(`Catalog actual check ${catalog.attemptedAt}.`);
if (checkedProviders.some(p => p.status !== 'fresh')) process.exitCode = 1;
