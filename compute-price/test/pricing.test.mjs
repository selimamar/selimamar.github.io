import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAWS, parseAzure, parseDigitalOcean, refreshSnapshot, withFreshness, AWS_URL, DO_URL, DAY_MS,
  parseAWSAccelerators, parseAWSCatalog, parseDigitalOceanCatalog, parseAzureCatalog, attachGPUAndCPUBenchmarks,
  parseGCPCatalogPage, composeGCPGPUConfigurations, readGooglePricingHTML, refreshCatalog, PROVIDERS, activeProviderSnapshot } from '../scripts/pricing.mjs';

const aws = JSON.parse(await readFile(new URL('./fixtures/aws.json', import.meta.url), 'utf8'));
const azure = JSON.parse(await readFile(new URL('./fixtures/azure.json', import.meta.url), 'utf8'));
const ocean = await readFile(new URL('./fixtures/digitalocean.html', import.meta.url), 'utf8');
const benchmarks = JSON.parse(await readFile(new URL('../data/benchmarks.json', import.meta.url), 'utf8'));
const observedAt = '2026-09-29T03:00:00.000Z';
const google = JSON.parse(await readFile(new URL('./fixtures/google-cloud.json', import.meta.url), 'utf8')).pages;

test('Six-provider policy removes DigitalOcean even during a targeted failed refresh', async () => {
  assert.deepEqual(PROVIDERS.map(provider => provider.id), ['aws','azure','gcp','alibaba','oracle','ibm']);
  const previous = { schemaVersion: 1, updatedAt: observedAt, providers: [
    { id: 'aws', status: 'fresh' }, { id: 'digitalocean', status: 'fresh' },
  ], instances: [...parseAWS(aws, observedAt), ...parseDigitalOcean(ocean, observedAt)] };
  const next = await refreshCatalog(previous, { providerIds: ['gcp'], now: observedAt,
    fetcher: async () => { throw new Error('offline'); } });
  assert.ok(next.instances.every(row => row.provider !== 'digitalocean'));
  assert.ok(next.providers.every(row => row.id !== 'digitalocean'));
  assert.equal(next.instances.length, parseAWS(aws, observedAt).length);
  assert.deepEqual(activeProviderSnapshot(previous).instances, next.instances);
  await assert.rejects(refreshCatalog(previous, { providerIds: ['digitalocean'] }), /Unsupported/);
});

test('Google uses only explicit Iowa USD hourly default prices, preserving source-defined binary memory', () => {
  const rows = parseGCPCatalogPage(google['general-purpose'], observedAt);
  const c3 = rows.find(row => row.name === 'c3-standard-4');
  assert.equal(c3.hourlyUsd, 0.201608);
  assert.equal(c3.ramGiB, 16);
  assert.equal(c3.region, 'us-central1 · Iowa');
  assert.equal(parseGCPCatalogPage(google['general-purpose'].replaceAll('Iowa (us-central1)', 'London (europe-west2)'), observedAt).length, 0);
  assert.equal(parseGCPCatalogPage(google['general-purpose'].replaceAll('(USD)', '(EUR)'), observedAt).length, 0);
  assert.equal(parseGCPCatalogPage(google['general-purpose'].replaceAll('/ 1 hour', '/ 1 month'), observedAt).length, 0);
  assert.equal(parseGCPCatalogPage(google['general-purpose'].replaceAll('Default', 'Spot'), observedAt).length, 0);
  const alternate = '<script>' + google['general-purpose'].replaceAll('0.201608', '0.00001') + '</script>';
  assert.deepEqual(parseGCPCatalogPage(google['general-purpose'] + alternate, observedAt), rows);
});

test('Google GPU VM bundles retain fractions, complete rates and exact hardware without score scaling', () => {
  const rows = parseGCPCatalogPage(google['accelerator-optimized'], observedAt, 'accelerator-optimized');
  const full = rows.find(row => row.name === 'g4-standard-48');
  assert.equal(full.hourlyUsd, 4.49993);
  assert.equal(full.gpuCount, 1);
  assert.equal(full.vramGiB, 96);
  assert.equal(full.ramGiB, 180);
  assert.equal(full.gpu, 'NVIDIA RTX PRO 6000 Blackwell Server Edition');
  assert.equal(rows.find(row => row.name === 'g4-standard-6').gpuCount, 0.125);
  assert.equal(rows.find(row => row.name === 'g4-standard-6').vramGiB, 12);
});

test('Google N1 GPU configurations add documented rates only within exact per-device host limits', () => {
  const hosts = parseGCPCatalogPage(google['general-purpose'], observedAt);
  const rows = composeGCPGPUConfigurations(hosts, google['accelerator-optimized'], observedAt);
  const t4 = rows.find(row => row.name === 'n1-standard-1 + 1× T4');
  assert.equal(t4.hourlyUsd, hosts.find(row => row.name === 'n1-standard-1').hourlyUsd + 0.35);
  assert.equal(t4.cpuBenchmarkName, 'n1-standard-1');
  assert.equal(t4.vramGiB, 16);
  assert.equal(t4.priceComponents.length, 2);
  assert.ok(rows.every(row => row.hourlyUsd === row.priceComponents.reduce((sum, component) => sum + component.hourlyUsd, 0)));
  assert.equal(rows.some(row => row.baseMachineName === 'n1-standard-64'), false);
  assert.equal(rows.some(row => row.baseMachineName === 'n1-standard-16' && row.gpu === 'NVIDIA V100'), false);
  assert.equal(rows.some(row => row.baseMachineName === 'n1-highmem-32' && row.gpu !== 'NVIDIA T4'), false);
  assert.throws(() => composeGCPGPUConfigurations(hosts, google['accelerator-optimized'].replace('NVIDIA P4', 'NVIDIA P100'), observedAt), /incomplete/);
});

test('Google HTML stream strips embedded datasets across chunk boundaries and rejects truncation', async () => {
  const chunks = ['<table>one</table><scr', 'ipt nonce="x">', 'big dataset</scr', 'ipt><table>two</table>'];
  const response = new Response(new ReadableStream({ start(controller) {
    chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk))); controller.close();
  } }));
  assert.equal(await readGooglePricingHTML(response), '<table>one</table><table>two</table>');
  await assert.rejects(readGooglePricingHTML(new Response('<script>truncated')), /Truncated/);
});

test('Targeted Google outage retains its old observations without changing other providers status or timestamps', async () => {
  const previous = { schemaVersion: 1, updatedAt: observedAt, providers: [
    { id: 'aws', status: 'fresh', checkedAt: observedAt, lastSuccessAt: observedAt },
    { id: 'gcp', status: 'fresh', checkedAt: observedAt, lastSuccessAt: observedAt },
  ], instances: [...parseAWS(aws, observedAt), ...parseGCPCatalogPage(google['general-purpose'], observedAt)] };
  const next = await refreshCatalog(previous, { now: '2026-09-29T04:00:00.000Z', providerIds: ['gcp'], fetcher: async () => { throw new Error('offline'); } });
  assert.deepEqual(next.providers.find(provider => provider.id === 'aws'), previous.providers[0]);
  assert.equal(next.providers.find(provider => provider.id === 'gcp').status, 'stale');
  assert.equal(next.instances.find(row => row.provider === 'gcp').observedAt, observedAt);
  assert.equal(next.updatedAt, observedAt);
});

function fixtureFetcher(url) {
  if (url === AWS_URL) return Promise.resolve(new Response(JSON.stringify(aws)));
  if (url === DO_URL) return Promise.resolve(new Response(ocean));
  if (url.startsWith('https://prices.azure.com/')) return Promise.resolve(new Response(JSON.stringify(azure)));
  throw new Error('Unexpected URL');
}

test('AWS uses full Linux VM prices and documented accelerator GiB', () => {
  const rows = parseAWS(aws, observedAt);
  assert.equal(rows.length, 10);
  assert.equal(rows.find(r => r.name === 'm6i.large').hourlyUsd, 0.096);
  assert.equal(rows.find(r => r.name === 'g4dn.xlarge').hourlyUsd, 0.526);
  assert.equal(rows.find(r => r.name === 'g5.xlarge').vramGiB, 22);
  assert.equal(rows.find(r => r.name === 'g6.xlarge').vramGiB, 22);
});

test('AWS rejects specification changes, non-USD and ambiguous duplicate rates', () => {
  const changed = structuredClone(aws);
  const region = changed.regions['US East (N. Virginia)'];
  const row = Object.values(region).find(r => r['Instance Type'] === 'm6i.large');
  row.Memory = '16 GiB';
  assert.throws(() => parseAWS(changed, observedAt), /specifications changed/);
  changed.manifest.currencyCode = 'EUR';
  assert.throws(() => parseAWS(changed, observedAt), /currency/);
  const duplicate = structuredClone(aws);
  duplicate.regions['US East (N. Virginia)'].duplicate = { ...Object.values(aws.regions['US East (N. Virginia)'])[0] };
  assert.throws(() => parseAWS(duplicate, observedAt), /expected one/);
});

test('Azure excludes Windows, Spot, Low Priority and non-VM products', () => {
  const rows = parseAzure(azure.Items, observedAt);
  assert.equal(rows.length, 7);
  assert.equal(rows.find(r => r.name === 'Standard_D4as_v5').hourlyUsd, 0.172);
  const good = azure.Items.find(r => r.meterId === rows[0].meterId);
  const polluted = [...azure.Items,
    { ...good, retailPrice: 0.0001, productName: good.productName + ' Windows' },
    { ...good, retailPrice: 0.0001, skuName: good.skuName + ' Spot' },
    { ...good, retailPrice: 0.0001, meterName: good.meterName + ' Low Priority' },
    { ...good, retailPrice: 0.0001, productName: 'Cloud Services' },
  ];
  assert.deepEqual(parseAzure(polluted, observedAt), rows);
  assert.throws(() => parseAzure([...azure.Items, good], observedAt), /expected one/);
});

test('DigitalOcean reads exact published bundled hourly prices, not a monthly division', () => {
  const rows = parseDigitalOcean(ocean, observedAt);
  assert.equal(rows.length, 8);
  assert.equal(rows.find(r => r.name === 's-2vcpu-4gb').hourlyUsd, 0.03571);
  assert.equal(rows.find(r => r.name === 'g-2vcpu-8gb').hourlyUsd, 0.09375);
  assert.throws(() => parseDigitalOcean('<html>Changed pricing format</html>', observedAt), /missing public plan/);
});

test('Refresh attaches only exact-shape sourced benchmark records', async () => {
  const snapshot = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks });
  assert.equal(snapshot.instances.length, 17);
  assert.ok(snapshot.providers.every(p => p.status === 'fresh'));
  assert.equal(snapshot.instances.filter(i => i.geekbench6Multi).length, 3);
  assert.equal(snapshot.instances.find(i => i.name === 'm7i.large').geekbench6Multi.score, 2500);
  assert.equal(snapshot.instances.find(i => i.name === 'm7i.xlarge').geekbench6Multi, undefined);
});

test('A failed provider preserves its last observed rates and marks them stale', async () => {
  const previous = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks });
  const nextTime = '2026-09-30T03:00:00.000Z';
  const next = await refreshSnapshot(previous, { now: nextTime, benchmarks, fetcher: url => url === AWS_URL ? Promise.resolve(new Response('unavailable', { status: 503 })) : fixtureFetcher(url) });
  const failed = next.providers.find(p => p.id === 'aws');
  assert.equal(failed.status, 'stale');
  assert.equal(failed.checkedAt, nextTime);
  assert.equal(failed.lastSuccessAt, observedAt);
  assert.equal(next.instances.find(i => i.provider === 'aws').observedAt, observedAt);
  assert.equal(next.instances.find(i => i.provider === 'azure').observedAt, nextTime);
});

test('Total outage never changes last successful update date or observed prices', async () => {
  const previous = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks });
  const next = await refreshSnapshot(previous, { now: '2026-10-01T01:00:00.000Z', benchmarks, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(next.updatedAt, previous.updatedAt);
  assert.deepEqual(next.instances, previous.instances);
  assert.ok(next.providers.every(p => p.status === 'stale'));
});

test('Snapshots become visibly stale even when all refresh jobs stop running', async () => {
  const snapshot = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks });
  const aged = withFreshness(snapshot, Date.parse(observedAt) + DAY_MS * 2);
  assert.ok(aged.providers.every(p => p.status === 'stale'));
  assert.ok(snapshot.providers.every(p => p.status === 'fresh'));
  const malformed = { ...snapshot, providers: [{ status: 'fresh', lastSuccessAt: 'invalid' }] };
  assert.equal(withFreshness(malformed).providers[0].status, 'stale');
});

test('Invalid or removed benchmark references are excluded, including retained old snapshots', async () => {
  const bad = structuredClone(benchmarks);
  bad.records[0].geekbench6Multi.score = Infinity;
  bad.records[1].geekbench6Multi.version = '5.0.0';
  bad.records[2].geekbench6Multi.vcpus = 4;
  const result = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks: bad });
  assert.equal(result.instances.filter(i => i.geekbench6Multi).length, 0);
  const previous = await refreshSnapshot(null, { fetcher: fixtureFetcher, now: observedAt, benchmarks });
  const removed = await refreshSnapshot(previous, { fetcher: async () => { throw new Error('offline'); }, now: observedAt, benchmarks: { records: [] } });
  assert.equal(removed.instances.filter(i => i.geekbench6Multi).length, 0);
});

test('Large AWS catalog parser preserves actual sizes, rejects duplicates and excludes burstable rates', () => {
  const fixture = structuredClone(aws);
  const base = Object.values(fixture.regions['US East (N. Virginia)'])[0];
  fixture.regions['US East (N. Virginia)'].burstable = { ...base, 'Instance Type': 't3.large' };
  const rows = parseAWSCatalog(fixture, observedAt);
  assert.equal(rows.length, 10);
  assert.equal(rows.some(row => row.name === 't3.large'), false);
  assert.equal(rows.find(row => row.name === 'g5.xlarge').acceleratorKind, 'gpu');
  assert.equal(rows.find(row => row.name === 'g5.xlarge').gpuSpecificationsStatus, 'unverified');
  fixture.regions['US East (N. Virginia)'].duplicate = base;
  assert.throws(() => parseAWSCatalog(fixture, observedAt), /duplicate AWS/);
});

test('Accelerator specifications retain total documented GiB and fractional allocation without scaling', () => {
  const html = `<table>
    <tr><td>g5.12xlarge</td><td>192.00</td><td>2nd Gen AMD EPYC 7R32</td><td>48</td><td>24</td><td>2</td><td>4 x NVIDIA A10G GPU</td><td>89 GiB (4 x 22 GiB)</td></tr>
    <tr><td>g6f.large</td><td>8.00</td><td>AMD EPYC 7R13</td><td>2</td><td>1</td><td>2</td><td>0.125 x NVIDIA L4 GPU</td><td>2.79 GiB</td></tr>
    <tr><td>g5.xlarge</td><td>16.00</td><td>2nd Gen AMD EPYC 7R32</td><td>4</td><td>2</td><td>2</td><td>1 x NVIDIA A10G GPU</td><td>22 GiB (1 x 22 GiB)</td></tr>
  </table>`;
  // Exact cells excerpted from the official AWS accelerator specifications table.
  const specs = parseAWSAccelerators(html);
  assert.equal(specs.get('g5.12xlarge').gpuCount, 4);
  assert.equal(specs.get('g5.12xlarge').vramGiB, 89);
  assert.equal(specs.get('g6f.large').gpuCount, 0.125);
  assert.equal(specs.get('g6f.large').vramGiB, 2.79);
  const enriched = parseAWSCatalog(aws, observedAt, specs).find(row => row.name === 'g5.xlarge');
  assert.equal(enriched.gpu, 'NVIDIA A10G');
  assert.equal(enriched.vramGiB, 22);
  const nextTime = '2026-09-30T03:00:00.000Z';
  const retained = parseAWSCatalog(aws, nextTime, new Map(), [enriched]).find(row => row.name === 'g5.xlarge');
  assert.equal(retained.vramGiB, 22);
  assert.equal(retained.gpuSpecificationsStatus, 'retained');
  assert.equal(retained.gpuSpecObservedAt, observedAt);
  assert.equal(retained.observedAt, nextTime);
  specs.get('g5.xlarge').vcpus = 8;
  assert.equal(parseAWSCatalog(aws, observedAt, specs).find(row => row.name === 'g5.xlarge').gpu, undefined);
});

test('DigitalOcean catalog distinguishes shared CPU and retains bundled plans only', () => {
  const rows = parseDigitalOceanCatalog(ocean, observedAt);
  assert.equal(rows.length, 8);
  assert.equal(rows.find(row => row.name === 's-2vcpu-4gb').cpuTenancy, 'shared-vCPU');
  assert.equal(rows.find(row => row.name === 'c-2').cpuTenancy, 'dedicated-vCPU');
  const withExample = ocean + JSON.stringify({ memory: 8, cpus: 2, slug: 'g5-2vcpu-8gb-50gb', price: { hourly: 0.09517 } });
  assert.equal(parseDigitalOceanCatalog(withExample, observedAt).length, 8);
});

test('GPU exact-shape records require a consistent version/backend, Linux and a single matching GPU', () => {
  const priced = parseAWS(aws, observedAt);
  const record = { provider: 'aws', name: 'g4dn.xlarge', geekbenchGpu: {
    score: 86151, version: '6.3.0', api: 'OpenCL', os: 'Linux', vcpus: 4, ramGiB: 16,
    gpu: 'NVIDIA T4', gpuCount: 1, url: 'https://browser.geekbench.com/v6/compute/3436896',
  } };
  const dataset = { methodology: { versionMajor: 6, version: '6.3.0', api: 'OpenCL' }, records: [record] };
  const apply = source => attachGPUAndCPUBenchmarks(priced, benchmarks, source);
  assert.equal(apply(dataset).filter(row => row.geekbenchGpu).length, 1);
  for (const mutation of [{ version: '7.0.0' }, { api: 'CUDA' }, { os: 'Windows' }, { gpuCount: 2 },
    { gpu: 'NVIDIA L4' }, { vcpus: 8 }, { ramGiB: 32 }, { score: Infinity }, { score: '86151' },
    { url: 'https://example.org/v6/compute/3436896' }]) {
    const invalid = structuredClone(dataset);
    Object.assign(invalid.records[0].geekbenchGpu, mutation);
    assert.equal(apply(invalid).some(row => row.geekbenchGpu), false, JSON.stringify(mutation));
  }
  const attached = apply(dataset);
  assert.equal(attachGPUAndCPUBenchmarks(attached, benchmarks, { records: [] }).some(row => row.geekbenchGpu), false);
  const multiGPU = priced.map(row => ({ ...row, gpuCount: 2 }));
  assert.equal(attachGPUAndCPUBenchmarks(multiGPU, benchmarks, dataset).some(row => row.geekbenchGpu), false);
});

test('Geekbench 7 exact result URL uses gpu path; mixed full versions are rejected without a chosen cohort', () => {
  const priced = parseAWS(aws, observedAt);
  // Deliberately synthetic parser fixture; never shipped as an observed benchmark.
  const record = { provider: 'aws', name: 'g4dn.xlarge', geekbenchGpu: { score: 1, version: '7.0.0',
    api: 'OpenCL', os: 'Linux', vcpus: 4, ramGiB: 16, gpu: 'NVIDIA T4', gpuCount: 1,
    url: 'https://browser.geekbench.com/v7/gpu/1' } };
  const data = { methodology: { versionMajor: 7, api: 'OpenCL' }, records: [record] };
  assert.equal(attachGPUAndCPUBenchmarks(priced, benchmarks, data).filter(row => row.geekbenchGpu).length, 1);
  const mixed = structuredClone(data);
  mixed.records.push({ ...record, name: 'unmatched', geekbenchGpu: { ...record.geekbenchGpu, version: '7.1.0' } });
  assert.equal(attachGPUAndCPUBenchmarks(priced, benchmarks, mixed).some(row => row.geekbenchGpu), false);
});

test('Expanded CPU compatibility policy admits documented 6.1–6.3 Linux editions while excluding 6.0 and SME', () => {
  const priced = parseAWS(aws, observedAt);
  const expanded = structuredClone(benchmarks);
  expanded.methodology.compatibleVersions = ['6.1', '6.2', '6.3'];
  expanded.methodology.compatibilitySource = 'https://www.geekbench.com/blog/2024/04/geekbench-63/';
  expanded.records[0].geekbench6Multi.version = '6.1.0';
  assert.equal(attachGPUAndCPUBenchmarks(priced, expanded).filter(row => row.geekbench6Multi).length, 3);
  expanded.records[0].geekbench6Multi.version = '6.0.0';
  expanded.records[1].geekbench6Multi.edition = 'for Linux AArch64 SME';
  assert.equal(attachGPUAndCPUBenchmarks(priced, expanded).filter(row => row.geekbench6Multi).length, 1);
  expanded.records[0].geekbench6Multi.version = '6.1.0';
  expanded.methodology.compatibilitySource = 'https://example.org';
  assert.equal(attachGPUAndCPUBenchmarks(priced, expanded).filter(row => row.geekbench6Multi).length, 1);
});

test('Azure catalog uses exact active hardware and rejects burstable, premium OS, promotions and ambiguous meters', () => {
  const rows = parseAzureCatalog(azure.Items, observedAt);
  assert.equal(rows.length, 7);
  const normal = azure.Items.find(row => row.meterId === rows[0].meterId);
  const spec = { provider: 'azure', name: normal.armSkuName, vcpus: rows[0].vcpus, ramGiB: rows[0].ramGiB,
    cpuAllocation: 'DEDICATED', status: 'ACTIVE', sourceUrl: 'https://github.com/SpareCores/sc-data-dumps' };
  assert.equal(parseAzureCatalog([normal], observedAt, [spec]).length, 1);
  for (const mutation of [{ cpuAllocation: 'BURSTABLE' }, { status: 'RETIRED' }, { name: 'unmatched' }]) {
    assert.equal(parseAzureCatalog([normal], observedAt, [{ ...spec, ...mutation }]).length, 0);
  }
  for (const mutation of [{ productName: normal.productName + ' Windows' }, { productName: normal.productName + ' Promo' },
    { productName: normal.productName + ' Ubuntu Pro' }, { skuName: normal.skuName + ' Spot' },
    { effectiveStartDate: '2099-01-01T00:00:00Z' }]) {
    assert.equal(parseAzureCatalog([{ ...normal, ...mutation }], observedAt, [spec]).length, 0);
  }
  assert.equal(parseAzureCatalog([normal, { ...normal, meterId: 'different-meter', retailPrice: 0.001 }], observedAt, [spec]).length, 0);
});

test('Azure explicit Series Linux GPU products retain the complete VM rate and sourced VRAM', () => {
  // Excerpted from the live Microsoft East US retail API on 2026-09-29.
  const row = { currencyCode: 'USD', tierMinimumUnits: 0, retailPrice: 3.673, armRegionName: 'eastus',
    effectiveStartDate: '2022-06-01T00:00:00Z', meterId: '814993d2-bf2e-546f-b4d7-34949c13c32e',
    meterName: 'NC24ads_A100_v4', productName: 'NCads A100 v4 Series Linux', skuName: 'Standard_NC24ads_A100_v4',
    serviceName: 'Virtual Machines', unitOfMeasure: '1 Hour', type: 'Consumption', isPrimaryMeterRegion: true,
    armSkuName: 'Standard_NC24ads_A100_v4' };
  const result = parseAzureCatalog([row], observedAt)[0];
  assert.equal(result.hourlyUsd, 3.673);
  assert.equal(result.ramGiB, 220);
  assert.equal(result.gpuCount, 1);
  assert.equal(result.vramGiB, 80e9 / 2 ** 30);
  assert.equal(result.vramCapacity.value, 80);
  assert.equal(result.vramCapacity.unit, 'GB');
  assert.equal(result.specLicense, 'CC-BY-SA-4.0');
});

test('Pinned original Spare Cores CPU output is accepted only with exact path, Linux kernel and verified nominal hardware', async () => {
  const measured = JSON.parse(await readFile(new URL('../data/sparecores-benchmarks.json', import.meta.url), 'utf8'));
  const priced = parseAWS(aws, observedAt);
  const source = measured.records.find(record => priced.some(row => row.provider === record.provider && row.name === record.name));
  assert.ok(source, 'a genuinely measured priced shape must exist');
  const reference = { ...measured, records: [source] };
  assert.equal(attachGPUAndCPUBenchmarks(priced, reference).filter(row => row.geekbench6Multi).length, 1);
  for (const mutation of [{ nominalSpecsVerified: false }, { kernel: 'Windows' }, { version: '6.0.0' },
    { url: source.geekbench6Multi.url.replace('/data/aws/', '/data/azure/') },
    { url: source.geekbench6Multi.url.replace(measured.attribution.sourceCommit, 'main') },
    { instructionSets: 'ARM SME' }, { vcpus: source.geekbench6Multi.vcpus + 1 }]) {
    const invalid = structuredClone(reference);
    Object.assign(invalid.records[0].geekbench6Multi, mutation);
    assert.equal(attachGPUAndCPUBenchmarks(priced, invalid).some(row => row.geekbench6Multi), false);
  }
  const attached = attachGPUAndCPUBenchmarks(priced, [reference, benchmarks]);
  assert.ok(attached.filter(row => row.geekbench6Multi).length >= 3);
});
