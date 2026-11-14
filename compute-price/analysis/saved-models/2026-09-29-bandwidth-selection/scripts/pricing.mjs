/** Public, unauthenticated list prices. Shared by the daily updater and Worker. */
import serverSpecifications from '../data/sparecores-server-specs.json' with { type: 'json' };
import { augmentGoogleCatalog } from './providers/google.mjs';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const AWS_URL = 'https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/US%20East%20(N.%20Virginia)/Linux/index.json';
export const DO_URL = 'https://www.digitalocean.com/pricing/droplets/';
export const AZURE_URL = 'https://prices.azure.com/api/retail/prices';
export const GCP_PRICING_ROOT = 'https://cloud.google.com/products/compute/pricing/';
export const GCP_PRICE_PAGES = ['general-purpose', 'compute-optimized', 'memory-optimized', 'storage-optimized', 'accelerator-optimized'];
export const GCP_GPU_SPEC_URL = 'https://docs.cloud.google.com/compute/docs/gpus';

const awsSpec = 'https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html';
const awsPreviousSpec = 'https://docs.aws.amazon.com/ec2/latest/instancetypes/pg.html';
const azureSpec = 'https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/';
export const AWS_CATALOG = [
  { name: 'm6i.large', vcpus: 2, ramGiB: 8 },
  { name: 'm7i.large', vcpus: 2, ramGiB: 8 },
  { name: 'm7i.xlarge', vcpus: 4, ramGiB: 16 },
  { name: 'c7i.large', vcpus: 2, ramGiB: 4 },
  { name: 'c7i.xlarge', vcpus: 4, ramGiB: 8 },
  { name: 'r7i.large', vcpus: 2, ramGiB: 16 },
  { name: 'r7i.xlarge', vcpus: 4, ramGiB: 32 },
  { name: 'g4dn.xlarge', vcpus: 4, ramGiB: 16, gpu: 'NVIDIA T4', gpuCount: 1, vramGiB: 16, specSourceUrl: awsSpec },
  { name: 'g5.xlarge', vcpus: 4, ramGiB: 16, gpu: 'NVIDIA A10G', gpuCount: 1, vramGiB: 22, specSourceUrl: awsSpec },
  { name: 'g6.xlarge', vcpus: 4, ramGiB: 16, gpu: 'NVIDIA L4', gpuCount: 1, vramGiB: 22, specSourceUrl: awsSpec },
];
export const AZURE_CATALOG = [
  { name: 'Standard_D2as_v5', vcpus: 2, ramGiB: 8, specSourceUrl: azureSpec + 'general-purpose/dasv5-series' },
  { name: 'Standard_D4as_v5', vcpus: 4, ramGiB: 16, specSourceUrl: azureSpec + 'general-purpose/dasv5-series' },
  { name: 'Standard_D8as_v5', vcpus: 8, ramGiB: 32, specSourceUrl: azureSpec + 'general-purpose/dasv5-series' },
  { name: 'Standard_E2as_v5', vcpus: 2, ramGiB: 16, specSourceUrl: azureSpec + 'memory-optimized/easv5-series' },
  { name: 'Standard_E4as_v5', vcpus: 4, ramGiB: 32, specSourceUrl: azureSpec + 'memory-optimized/easv5-series' },
  { name: 'Standard_F2s_v2', vcpus: 2, ramGiB: 4, specSourceUrl: azureSpec + 'compute-optimized/fsv2-series' },
  { name: 'Standard_F4s_v2', vcpus: 4, ramGiB: 8, specSourceUrl: azureSpec + 'compute-optimized/fsv2-series' },
];
export const DO_CATALOG = [
  { name: 's-2vcpu-4gb', vcpus: 2, ramGiB: 4, family: 'Basic · shared CPU' },
  { name: 's-4vcpu-8gb', vcpus: 4, ramGiB: 8, family: 'Basic · shared CPU' },
  { name: 'c-2', vcpus: 2, ramGiB: 4, family: 'CPU-Optimized' },
  { name: 'c-4', vcpus: 4, ramGiB: 8, family: 'CPU-Optimized' },
  { name: 'g-2vcpu-8gb', vcpus: 2, ramGiB: 8, family: 'General Purpose' },
  { name: 'g-4vcpu-16gb', vcpus: 4, ramGiB: 16, family: 'General Purpose' },
  { name: 'm-2vcpu-16gb', vcpus: 2, ramGiB: 16, family: 'Memory-Optimized' },
  { name: 'm-4vcpu-32gb', vcpus: 4, ramGiB: 32, family: 'Memory-Optimized' },
];

export const PROVIDERS = [
  { id: 'aws', name: 'Amazon Web Services', region: 'us-east-1 · N. Virginia', sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/' },
  { id: 'azure', name: 'Microsoft Azure', region: 'eastus · Virginia', sourceUrl: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/' },
  { id: 'gcp', name: 'Google Cloud', region: 'us-central1 · Iowa', sourceUrl: GCP_PRICING_ROOT },
  { id: 'alibaba', name: 'Alibaba Cloud', region: 'us-east-1 · Virginia', sourceUrl: 'https://www.alibabacloud.com/en/product/ecs/pricing' },
  { id: 'oracle', name: 'Oracle Cloud', region: 'us-ashburn-1 · Virginia', sourceUrl: 'https://www.oracle.com/cloud/compute/pricing/' },
  { id: 'ibm', name: 'IBM Cloud', region: 'us-south · Dallas', sourceUrl: 'https://www.ibm.com/products/virtual-servers/pricing' },
];

/** The active provider policy also applies to retained observations and older caches. */
export function activeProviderSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  const ids = new Set(PROVIDERS.map(provider => provider.id));
  const instances = snapshot.instances.filter(row => ids.has(row.provider));
  return { ...snapshot, instances, providers: snapshot.providers.filter(row => ids.has(row.id)),
    ...(snapshot.coverage ? { coverage: { ...snapshot.coverage, instanceCount: instances.length,
      uniqueProviderShapes: new Set(instances.map(row => row.id)).size } } : {}) };
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function instance(provider, spec, price, priceSourceUrl, observedAt, extra = {}) {
  return { id: `${provider}:${spec.name}`, provider, ...spec,
    ...(provider === 'aws' && spec.gpu && spec.vramGiB > 0 ? { vramCapacity: {
      value: spec.vramGiB, unit: 'GiB', basis: 'provider-published nominal accelerator capacity', sourceUrl: spec.specSourceUrl,
    } } : {}),
    region: PROVIDERS.find(p => p.id === provider)?.region ?? (provider === 'digitalocean' ? 'nyc3 · New York' : null),
    hourlyUsd: assertPositive(Number(price), `${provider} ${spec.name} hourly price`),
    priceSourceUrl, observedAt, ...extra };
}

export function azurePriceUrl() {
  const filter = "serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and priceType eq 'Consumption' and (" + AZURE_CATALOG.map(s => `armSkuName eq '${s.name}'`).join(' or ') + ')';
  const url = new URL(AZURE_URL);
  url.searchParams.set('api-version', '2023-01-01-preview');
  url.searchParams.set('currencyCode', 'USD');
  url.searchParams.set('$filter', filter);
  return url.href;
}

export function azureCatalogPriceUrl() {
  const url = new URL(AZURE_URL);
  url.searchParams.set('$filter', "serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and priceType eq 'Consumption'");
  return url.href;
}

export function parseAzureCatalog(items, observedAt, metadata = serverSpecifications.records) {
  if (!Array.isArray(items)) throw new Error('Azure returned no price items');
  const specifications = new Map(metadata.filter(spec => spec.provider === 'azure'
    && ['ACTIVE', 'PLANNED_FOR_RETIREMENT'].includes(spec.status) && spec.cpuAllocation === 'DEDICATED'
    && !/^Standard_B/i.test(spec.name)).map(spec => [spec.name, spec]));
  const grouped = new Map();
  for (const row of items) {
    if (!specifications.has(row.armSkuName) || row.armRegionName !== 'eastus' || row.serviceName !== 'Virtual Machines'
      || !(row.productName?.startsWith('Virtual Machines ') || /\bLinux$/i.test(row.productName ?? ''))
      || /Windows|SQL|Red Hat|RHEL|SUSE|Ubuntu Pro|Promo/i.test(row.productName)
      || /Spot|Low Priority|Promo/i.test(`${row.meterName} ${row.skuName}`)
      || row.type !== 'Consumption' || row.currencyCode !== 'USD' || row.unitOfMeasure !== '1 Hour'
      || row.tierMinimumUnits !== 0 || row.isPrimaryMeterRegion !== true || !(row.retailPrice > 0)
      || Date.parse(row.effectiveStartDate) > Date.parse(observedAt)) continue;
    if (!grouped.has(row.armSkuName)) grouped.set(row.armSkuName, new Map());
    grouped.get(row.armSkuName).set(row.meterId, row);
  }
  const result = [];
  for (const [name, meters] of grouped) {
    // Multiple distinct primary Linux meters are ambiguous; never silently select the cheapest.
    if (meters.size !== 1) continue;
    const row = [...meters.values()][0];
    const metadata = specifications.get(name);
    const official = AZURE_CATALOG.find(spec => spec.name === name);
    const spec = { name, vcpus: metadata.vcpus, ramGiB: metadata.ramGiB,
      family: metadata.family, architecture: metadata.architecture, cpuTenancy: 'dedicated-vCPU',
      acceleratorKind: metadata.gpuCount > 0 ? 'gpu' : null,
      specSourceUrl: official?.specSourceUrl ?? metadata.sourceUrl,
      specLicense: 'CC-BY-SA-4.0', specAttribution: 'Spare Cores',
      specRetrievedAt: serverSpecifications.retrievedAt };
    if (!(spec.vcpus > 0) || !(spec.ramGiB > 0)) continue;
    if (metadata.gpuCount > 0) {
      spec.gpuCount = metadata.gpuCount;
      if (metadata.gpu) spec.gpu = metadata.gpu;
      if (metadata.vramGiB > 0) {
        spec.vramGiB = metadata.vramGiB;
        spec.vramCapacity = { value: metadata.vramGiB * 1024, unit: 'MiB',
          basis: 'Spare Cores published accelerator metadata', sourceUrl: metadata.sourceUrl };
      }
      const t4 = /^Standard_NC(4|8|16|64)as_T4_v3$/.exec(name);
      const a100 = /^Standard_NC(24|48|96)ads_A100_v4$/.exec(name);
      if (t4 || a100) {
        const count = t4 ? (Number(t4[1]) === 64 ? 4 : 1) : Number(a100[1]) / 24;
        const nominalGB = count * (t4 ? 16 : 80);
        spec.gpuCount = count;
        spec.gpu = t4 ? 'NVIDIA T4' : 'NVIDIA A100';
        spec.gpuSpecSourceUrl = azureSpec + `gpu-accelerated/${t4 ? 'ncast4v3' : 'nca100v4'}-series`;
        spec.vramGiB = nominalGB * 1e9 / 2 ** 30;
        spec.vramCapacity = { value: nominalGB, unit: 'GB',
          basis: 'provider-published nominal accelerator capacity', sourceUrl: spec.gpuSpecSourceUrl };
      }
      spec.gpuSpecificationsStatus = spec.gpu && spec.vramGiB > 0 ? 'sourced' : 'partial';
      if (name === 'Standard_NC32ads_A10_v4') {
        spec.gpuCountReported = spec.gpuCount;
        delete spec.gpuCount;
        spec.gpuSpecificationsStatus = 'unverified-gpu-count';
        spec.gpuSpecificationNote = 'Public metadata conflicts on GPU count. Excluded from GPU performance matching until independently verified.';
      }
    }
    result.push(instance('azure', spec, row.retailPrice, azureCatalogPriceUrl(), observedAt,
      { meterId: row.meterId, priceEffectiveAt: row.effectiveStartDate, billingKind: 'on-demand' }));
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseAzure(items, observedAt) {
  if (!Array.isArray(items)) throw new Error('Azure returned no price items');
  return AZURE_CATALOG.map(spec => {
    const matches = items.filter(row => row.armSkuName === spec.name && row.armRegionName === 'eastus'
      && row.serviceName === 'Virtual Machines' && row.productName.startsWith('Virtual Machines ')
      && !/Windows|SQL|Red Hat|RHEL|SUSE|Ubuntu Pro/i.test(row.productName)
      && !/Spot|Low Priority/i.test(`${row.meterName} ${row.skuName}`)
      && row.type === 'Consumption' && row.currencyCode === 'USD'
      && row.unitOfMeasure === '1 Hour' && row.tierMinimumUnits === 0
      && row.isPrimaryMeterRegion === true && Number(row.retailPrice) > 0);
    // Never choose the lowest mixed-license or historical price silently.
    if (matches.length !== 1) throw new Error(`Azure ${spec.name}: expected one Linux on-demand meter, got ${matches.length}`);
    return instance('azure', spec, matches[0].retailPrice, azurePriceUrl(), observedAt,
      { meterId: matches[0].meterId, priceEffectiveAt: matches[0].effectiveStartDate });
  });
}

/** Extract published JSON objects from Next.js flight text without executing page code. */
export function extractDigitalOceanPlans(html) {
  const text = html.replace(/\\"/g, '"');
  const plans = [];
  for (const match of text.matchAll(/\{"memory":/g)) {
    let depth = 0, quoted = false, escaped = false;
    for (let index = match.index; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { plans.push(JSON.parse(text.slice(match.index, index + 1))); } catch { /* unrelated page object */ }
        break;
      }
    }
  }
  return plans;
}

export function parseDigitalOcean(html, observedAt) {
  const plans = extractDigitalOceanPlans(html);
  return DO_CATALOG.map(spec => {
    const candidates = plans.filter(row => row.slug === spec.name);
    if (!candidates.length) throw new Error(`DigitalOcean ${spec.name}: missing public plan`);
    const signatures = new Set(candidates.map(p => JSON.stringify([p.cpus, p.memory, p.price?.hourly])));
    if (signatures.size !== 1) throw new Error(`DigitalOcean ${spec.name}: conflicting public rates`);
    const row = candidates[0];
    if (row.cpus !== spec.vcpus || row.memory !== spec.ramGiB) throw new Error(`DigitalOcean ${spec.name}: specifications changed`);
    return instance('digitalocean', spec, row.price?.hourly, DO_URL, observedAt,
      { specSourceUrl: DO_URL, includes: 'Published bundled SSD storage and transfer allowance; monthly cap may apply.' });
  });
}

async function fetchText(url, fetcher) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(url, { headers: { 'accept': 'application/json, text/html;q=0.9', 'user-agent': 'ComputePriceIndex/1.0 (public pricing monitor)' }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`Public pricing endpoint returned HTTP ${response.status}`);
      // Standard fetch transparently decodes HTTP Content-Encoding in Node/Workers.
      return await response.text();
    } catch (error) {
      // Retry one transport failure; HTTP rate limits and parsing changes retain last-good data.
      if (attempt || error.name !== 'TypeError') throw error;
    }
  }
}

async function fetchAzure(fetcher, now) {
  let url = azurePriceUrl();
  const rows = [];
  for (let page = 0; url && page < 5; page++) {
    if (new URL(url).origin !== 'https://prices.azure.com') throw new Error('Unexpected Azure pagination host');
    const body = JSON.parse(await fetchText(url, fetcher));
    if (!Array.isArray(body.Items)) throw new Error('Azure returned malformed price data');
    rows.push(...body.Items);
    url = body.NextPageLink;
  }
  if (url) throw new Error('Azure pricing exceeded pagination limit');
  return parseAzure(rows, now);
}

async function fetchAzureCatalog(fetcher, now) {
  let url = azureCatalogPriceUrl();
  const rows = [];
  for (let page = 0; url && page < 30; page++) {
    if (new URL(url).origin !== 'https://prices.azure.com') throw new Error('Unexpected Azure pagination host');
    const body = JSON.parse(await fetchText(url, fetcher));
    if (!Array.isArray(body.Items)) throw new Error('Azure returned malformed price data');
    rows.push(...body.Items);
    url = body.NextPageLink;
  }
  if (url) throw new Error('Azure catalog exceeded pagination limit');
  const parsed = parseAzureCatalog(rows, now);
  if (parsed.length < 200) throw new Error(`Azure catalog unexpectedly incomplete (${parsed.length} verified shapes)`);
  return parsed;
}

export function cpuMethodology(benchmarks) {
  if (!Array.isArray(benchmarks)) return benchmarks?.methodology ?? null;
  return { name: 'Exact-shape measured CPU references',
    selection: 'First valid exact provider/shape CPU result, checking listed datasets in order.',
    datasets: benchmarks.map(dataset => dataset?.methodology).filter(Boolean) };
}

function attachBenchmarks(instances, benchmarks) {
  const datasets = Array.isArray(benchmarks) ? benchmarks : [benchmarks];
  const documentedVersions = {
    'https://www.geekbench.com/blog/2024/04/geekbench-63/': ['6.1', '6.2', '6.3'],
    'https://www.geekbench.com/blog/2026/04/geekbench-67/': ['6.3', '6.4', '6.5', '6.6', '6.7'],
  };
  return instances.map(item => {
    const { geekbench6Multi: oldBenchmark, ...cleanItem } = item;
    for (const dataset of datasets) {
      const reference = dataset?.records?.find(r => r.provider === item.provider && r.name === item.name);
      const benchmark = reference?.geekbench6Multi;
      if (!benchmark || benchmark.vcpus !== item.vcpus || benchmark.ramGiB !== item.ramGiB
        || !Number.isFinite(benchmark.score) || benchmark.score <= 0) continue;
      const allowed = documentedVersions[dataset?.methodology?.compatibilitySource];
      const explicit = Array.isArray(dataset?.methodology?.compatibleVersions);
      const compatible = allowed && explicit;
      const minor = typeof benchmark.version === 'string' ? benchmark.version.split('.').slice(0, 2).join('.') : '';
      const versionValid = compatible ? /^6\.[1-7]\.\d+$/.test(benchmark.version ?? '')
        && allowed.includes(minor) && dataset.methodology.compatibleVersions.includes(minor) : benchmark.version === '6.3.0';
      if (!versionValid || /SME/i.test(benchmark.edition ?? '')
        || /\bSME\d*\b/i.test(String(benchmark.instructionSets ?? ''))) continue;
      const browserSource = /^https:\/\/browser\.geekbench\.com\/v6\/cpu\/\d+$/.test(benchmark.url ?? '');
      const raw = /^https:\/\/raw\.githubusercontent\.com\/SpareCores\/sc-inspector-data\/([0-9a-f]{40})\/data\/(aws|azure|gcp)\/([^/]+)\/geekbench\/stdout$/.exec(benchmark.url ?? '');
      const rawSource = raw && raw[1] === dataset?.attribution?.sourceCommit && raw[2] === item.provider
        && raw[3] === encodeURIComponent(item.name) && benchmark.sourceType === 'sparecores-original-measured-output'
        && benchmark.nominalSpecsVerified === true && /^Linux\b/i.test(benchmark.kernel ?? '') && compatible;
      if (!(browserSource && (compatible ? benchmark.edition?.includes('Linux') : benchmark.edition?.includes('Linux AVX2'))) && !rawSource) continue;
      return { ...cleanItem, geekbench6Multi: benchmark };
    }
    return cleanItem;
  });
}

export async function refreshSnapshot(previous = null, { fetcher = fetch, now = new Date().toISOString(), benchmarks = { records: [] }, gpuBenchmarks = { records: [] } } = {}) {
  const loaders = {
    aws: async () => parseAWS(JSON.parse(await fetchText(AWS_URL, fetcher)), now),
    azure: () => fetchAzure(fetcher, now),
  };
  const selectedProviders = PROVIDERS.filter(p => loaders[p.id]);
  const outcomes = await Promise.allSettled(selectedProviders.map(p => loaders[p.id]()));
  const providers = [], instances = [];
  outcomes.forEach((outcome, index) => {
    const provider = selectedProviders[index];
    const oldProvider = previous?.providers?.find(p => p.id === provider.id);
    if (outcome.status === 'fulfilled') {
      providers.push({ ...provider, status: 'fresh', checkedAt: now, lastSuccessAt: now });
      instances.push(...outcome.value);
    } else {
      const retained = previous?.instances?.filter(i => i.provider === provider.id) ?? [];
      providers.push({ ...provider, status: retained.length ? 'stale' : 'unavailable', checkedAt: now,
        lastSuccessAt: oldProvider?.lastSuccessAt ?? retained[0]?.observedAt ?? null,
        error: String(outcome.reason?.message ?? 'Pricing source unavailable').slice(0, 240) });
      instances.push(...retained);
    }
  });
  const successes = providers.filter(p => p.status === 'fresh').length;
  return { schemaVersion: 1, currency: 'USD', updatedAt: successes ? now : previous?.updatedAt ?? null,
    attemptedAt: now, refreshIntervalHours: 24, providers, instances: attachGPUAndCPUBenchmarks(instances, benchmarks, gpuBenchmarks),
    scope: 'Selected public Linux on-demand VM list rates, one US region per provider. No commitments, Spot, tax, support, separate disks, egress or public IPv4 charges. Bundled provider inclusions remain in each rate.',
    benchmarkMethodology: cpuMethodology(benchmarks) ?? previous?.benchmarkMethodology ?? null,
    gpuBenchmarkMethodology: gpuBenchmarks?.methodology ?? null };
}

/** Age is evaluated on every response, even if an updater or deployment stops. */
export function withFreshness(snapshot, nowMs = Date.now()) {
  return { ...snapshot, providers: snapshot.providers.map(provider => {
    const lastSuccess = Date.parse(provider.lastSuccessAt ?? '');
    return { ...provider, status: provider.status === 'fresh'
      && (!Number.isFinite(lastSuccess) || nowMs - lastSuccess > DAY_MS * 1.5) ? 'stale' : provider.status };
  }) };
}

export function parseAWS(data, observedAt) {
  if (data.manifest?.currencyCode !== 'USD') throw new Error('AWS currency is not USD');
  const rows = Object.values(data.regions?.['US East (N. Virginia)'] ?? {});
  return AWS_CATALOG.map(spec => {
    const matches = rows.filter(row => row['Instance Type'] === spec.name
      && row['Operating System'] === 'Linux' && row['Pre Installed S/W'] === 'NA'
      && row['License Model'] === 'No License required' && row.Location === 'US East (N. Virginia)');
    if (matches.length !== 1) throw new Error(`AWS ${spec.name}: expected one Linux on-demand rate, got ${matches.length}`);
    const row = matches[0];
    if (Number(row.vCPU) !== spec.vcpus || row.Memory !== `${spec.ramGiB} GiB`) throw new Error(`AWS ${spec.name}: specifications changed`);
    return instance('aws', spec, row.price, AWS_URL, observedAt,
      { specSourceUrl: spec.specSourceUrl ?? 'https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-type-summary-table.html',
        rateCode: row.rateCode, pricePublishedAt: data.manifest.hawkFilePublicationDate });
  });
}

/** Official AWS accelerator specification table; do not infer VRAM from GPU names. */
export function parseAWSAccelerators(html, sourceUrl = awsSpec) {
  const specifications = new Map();
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]
      .replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length !== 8 || !cells[0].includes('.')) continue;
    const gpu = cells[6].match(/^([\d.]+) x (.+?) GPU$/);
    const memory = cells[7].match(/^([\d,.]+) GiB(?:\s|$)/);
    if (!gpu || !memory) continue;
    specifications.set(cells[0], { gpu: gpu[2], gpuCount: Number(gpu[1]),
      vramGiB: Number(memory[1].replace(/,/g, '')), vcpus: Number(cells[3]),
      ramGiB: Number(cells[1].replace(/,/g, '')), processor: cells[2],
      specSourceUrl: sourceUrl });
  }
  if (!specifications.size) throw new Error('AWS accelerator specifications could not be read');
  return specifications;
}

export function parseAWSCatalog(data, observedAt, acceleratorSpecifications = new Map(), previousInstances = []) {
  if (data.manifest?.currencyCode !== 'USD') throw new Error('AWS currency is not USD');
  const rows = Object.values(data.regions?.['US East (N. Virginia)'] ?? {});
  const selected = rows.filter(row => row['Operating System'] === 'Linux'
    && row['Pre Installed S/W'] === 'NA' && row['License Model'] === 'No License required'
    && row.Location === 'US East (N. Virginia)' && !/^t\d/i.test(row['Instance Type'] ?? ''));
  const seen = new Set();
  return selected.map(row => {
    const name = row['Instance Type'];
    const memory = row.Memory?.match(/^([\d,.]+) GiB$/);
    if (!name || seen.has(name) || !memory) throw new Error(`Invalid or duplicate AWS catalog shape: ${name}`);
    seen.add(name);
    const spec = { name, vcpus: assertPositive(Number(row.vCPU), `${name} vCPUs`),
      ramGiB: assertPositive(Number(memory[1].replace(/,/g, '')), `${name} memory`),
      family: row['Instance Family'], cpuTenancy: 'dedicated-vCPU',
      acceleratorKind: row['Instance Family'] === 'GPU instance' ? 'gpu'
        : /ASIC/.test(row['Instance Family']) ? 'asic'
        : /FPGA/.test(row['Instance Family']) ? 'fpga'
        : /Media Accelerator/.test(row['Instance Family']) ? 'media' : null,
      specSourceUrl: AWS_URL };
    const accelerator = acceleratorSpecifications.get(name);
    if (accelerator && spec.acceleratorKind === 'gpu' && accelerator.vcpus === spec.vcpus && accelerator.ramGiB === spec.ramGiB) Object.assign(spec, accelerator);
    else if (spec.acceleratorKind === 'gpu') {
      const previous = previousInstances.find(item => item.provider === 'aws' && item.name === name
        && item.vcpus === spec.vcpus && item.ramGiB === spec.ramGiB && item.gpu && item.gpuCount > 0 && item.vramGiB > 0);
      if (previous) Object.assign(spec, { gpu: previous.gpu, gpuCount: previous.gpuCount, vramGiB: previous.vramGiB,
        specSourceUrl: previous.specSourceUrl, gpuSpecificationsStatus: 'retained',
        gpuSpecObservedAt: previous.gpuSpecObservedAt ?? previous.observedAt });
      else spec.gpuSpecificationsStatus = 'unverified';
    }
    if (accelerator && spec.gpu) spec.gpuSpecObservedAt = observedAt;
    return instance('aws', spec, row.price, AWS_URL, observedAt,
      { rateCode: row.rateCode, pricePublishedAt: data.manifest.hawkFilePublicationDate,
        billingKind: 'on-demand', storage: row.Storage, network: row['Network Performance'] });
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function parseDigitalOceanCatalog(html, observedAt) {
  const plans = extractDigitalOceanPlans(html);
  const unique = new Map();
  for (const row of plans) {
    // v5 page objects are worked examples of configurable resources, not bundled size offers.
    if (typeof row.slug !== 'string' || /^(?:s5|g5)-/.test(row.slug)) continue;
    const prior = unique.get(row.slug);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error(`Conflicting DigitalOcean plan ${row.slug}`);
    unique.set(row.slug, row);
  }
  return [...unique.values()].map(row => {
    const family = row.slug.startsWith('s-') ? 'Basic' : row.slug.startsWith('c-') ? 'CPU-Optimized'
      : row.slug.startsWith('g-') ? 'General Purpose' : row.slug.startsWith('m-') ? 'Memory-Optimized'
      : row.slug.startsWith('so') ? 'Storage-Optimized' : 'Published bundled plan';
    return instance('digitalocean', { name: row.slug,
      vcpus: assertPositive(Number(row.cpus), `${row.slug} vCPUs`),
      ramGiB: assertPositive(Number(row.memory), `${row.slug} memory`),
      family, cpuTenancy: family === 'Basic' ? 'shared-vCPU' : 'dedicated-vCPU',
      acceleratorKind: null, specSourceUrl: DO_URL }, row.price?.hourly, DO_URL, observedAt,
      { billingKind: 'bundled-on-demand', diskGiB: row.disk?.boot,
        includedTransferGiB: row.price?.transferQuota,
        includes: 'Published bundled SSD storage and transfer allowance; monthly cap may apply.' });
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function googleCellText(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Only rendered tables at their explicitly selected region; embedded alternate-region JSON is ignored. */
function googleTables(html) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  let region = null;
  const result = [];
  for (const token of clean.matchAll(/<li\b[^>]*>|<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (token[0].startsWith('<li')) {
      if (/aria-selected=["']true["']/.test(token[0])) region = /data-value=["']([^"']+)["']/.exec(token[0])?.[1] ?? null;
      continue;
    }
    const headers = [...token[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(cell => googleCellText(cell[1]));
    const rows = [...token[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => googleCellText(cell[1]))).filter(row => row.length);
    result.push({ region, headers, rows });
  }
  return result;
}

const googleHourlyPrice = text => {
  const match = /^\$([\d,]+(?:\.\d+)?)\s*\/\s*1 hour$/.exec(text ?? '');
  return match ? Number(match[1].replace(/,/g, '')) : null;
};
const googleNumber = text => /^\d[\d,]*(?:\.\d+)?$/.test(text ?? '') ? Number(text.replace(/,/g, '')) : null;

/** Full predefined-machine prices. Never divide a monthly price or select a commitment/Spot column. */
export function parseGCPCatalogPage(html, observedAt, page = 'general-purpose') {
  const sourceUrl = GCP_PRICING_ROOT + page;
  const result = new Map();
  for (const { region, headers, rows } of googleTables(html)) {
    if (region !== 'Iowa (us-central1)' || !/^Machine type$/i.test(headers[0] ?? '')) continue;
    const priceIndex = headers.findIndex(header => /^(?:Default|Price)\b/.test(header) && /\(USD\)/.test(header)
      && !/CUD|commitment|Spot|Flex-start/i.test(header));
    if (priceIndex < 0) continue;
    const cpuIndex = headers.findIndex(header => /^(?:Virtual CPUs|vCPUs?|Cores(?: \(Hyper threaded\))?)$/i.test(header));
    const memoryIndex = headers.findIndex(header => header === 'Memory');
    const componentsIndex = headers.indexOf('Components');
    for (const cells of rows) {
      if (cells.length !== headers.length) continue;
      const name = cells[0], price = googleHourlyPrice(cells[priceIndex]);
      if (!/^[a-z]\d[a-z]?-(?:standard|highcpu|highmem|ultramem|megamem|megagpu|highgpu|ultragpu)-\d+(?:[a-z0-9-]*)$/.test(name)
        || name.includes('-node-') || /^(?:e2-(?:micro|small|medium)|f1-|g1-)/.test(name) || !(price > 0)) continue;
      let vcpus = googleNumber(cells[cpuIndex]), ramGiB = Number(/^([\d,.]+)\s*GiB$/.exec(cells[memoryIndex] ?? '')?.[1]?.replace(/,/g, ''));
      let gpuCount = null;
      if (componentsIndex >= 0) {
        const components = cells[componentsIndex];
        vcpus = Number(/vCPUs:\s*([\d,]+)/.exec(components)?.[1]?.replace(/,/g, ''));
        // Google explicitly defines machine-memory GB on this page as binary GiB.
        ramGiB = Number(/Memory:\s*([\d,.]+)\s*(?:GiB|GB)/.exec(components)?.[1]?.replace(/,/g, ''));
        const count = /GPUs:\s*(\d+(?:\/\d+)?)/.exec(components)?.[1]?.split('/').map(Number);
        gpuCount = count?.length === 2 ? count[0] / count[1] : count?.[0];
      }
      if (!(vcpus > 0) || !(ramGiB > 0)) continue;
      const spec = { name, vcpus, ramGiB, family: name.split('-')[0], cpuTenancy: 'dedicated-vCPU',
        acceleratorKind: componentsIndex >= 0 ? 'gpu' : null, specSourceUrl: sourceUrl };
      if (componentsIndex >= 0) {
        // Only these regional G-series rows have fully documented exact GPU models here.
        if (!/^(g2|g4)-/.test(name) || !(gpuCount > 0)) continue;
        const g4 = name.startsWith('g4-'), capacity = gpuCount * (g4 ? 96 : 24);
        Object.assign(spec, { gpuCount, gpu: g4 ? 'NVIDIA RTX PRO 6000 Blackwell Server Edition' : 'NVIDIA L4',
          vramGiB: capacity, gpuSpecSourceUrl: GCP_GPU_SPEC_URL,
          vramCapacity: { value: capacity, unit: 'GB', basis: 'provider-published nominal accelerator capacity', sourceUrl: GCP_GPU_SPEC_URL },
          gpuSpecificationsStatus: 'sourced' });
      }
      const storageIndex = headers.indexOf('Local SSD');
      if (storageIndex >= 0) spec.storage = cells[storageIndex];
      const row = instance('gcp', spec, price, sourceUrl, observedAt, { billingKind: 'on-demand',
        consumptionModelId: '7754-699E-0EBF', includes: 'Complete published predefined VM hourly rate; bundled local SSD where specified. No sustained-use or commitment discount.' });
      if (result.has(name) && JSON.stringify(result.get(name)) !== JSON.stringify(row)) throw new Error(`Conflicting Google Cloud rate for ${name}`);
      result.set(name, row);
    }
  }
  return [...result.values()];
}

/** Legal single-device N1 configurations cost the published host rate plus its GPU add-on. */
export function composeGCPGPUConfigurations(cpuInstances, html, observedAt) {
  const limits = { 'NVIDIA T4': { code: 'T4', vcpus: 48, ramGiB: 312, capacityGB: 16 },
    'NVIDIA P4': { code: 'P4', vcpus: 24, ramGiB: 156, capacityGB: 8 },
    'NVIDIA V100': { code: 'V100', vcpus: 12, ramGiB: 78, capacityGB: 16 } };
  const gpuRates = new Map();
  for (const table of googleTables(html)) {
    if (table.region !== 'Iowa (us-central1)' || table.headers[0] !== 'Model'
      || table.headers[3] !== 'GPU price (USD)') continue;
    for (const cells of table.rows) {
      const limit = limits[cells[0]], rate = googleHourlyPrice(cells[3]);
      if (!limit || cells[1] !== '1 GPU' || !(rate > 0)
        || !new RegExp(`^${limit.capacityGB} GB\\b`).test(cells[2])) continue;
      if (gpuRates.has(cells[0])) throw new Error(`Ambiguous Google Cloud GPU rate for ${cells[0]}`);
      gpuRates.set(cells[0], rate);
    }
  }
  if (gpuRates.size !== 3) throw new Error('Google Cloud single-GPU pricing table is incomplete');
  const result = [];
  const sourceUrl = GCP_PRICING_ROOT + 'accelerator-optimized';
  for (const host of cpuInstances.filter(row => row.provider === 'gcp' && /^n1-(?:standard|highmem|highcpu)-\d+$/.test(row.name))) {
    for (const [gpu, rate] of gpuRates) {
      const limit = limits[gpu];
      if (host.vcpus > limit.vcpus || host.ramGiB > limit.ramGiB) continue;
      result.push(instance('gcp', { name: `${host.name} + 1× ${limit.code}`, baseMachineName: host.name, cpuBenchmarkName: host.name,
        cpuBenchmarkBasis: 'exact-underlying-host-shape',
        cpuBenchmarkNote: 'Measured underlying N1 host shape; GPU attachment preserves the listed host vCPU and RAM configuration. The paired benchmark was not run with this GPU attached.',
        cpuBenchmarkSpecSourceUrl: GCP_GPU_SPEC_URL,
        vcpus: host.vcpus, ramGiB: host.ramGiB, family: `n1-${limit.code.toLowerCase()}`,
        cpuTenancy: 'dedicated-vCPU', acceleratorKind: 'gpu', gpu, gpuCount: 1,
        vramGiB: limit.capacityGB, specSourceUrl: GCP_GPU_SPEC_URL,
        vramCapacity: { value: limit.capacityGB, unit: 'GB', basis: 'provider-published nominal accelerator capacity', sourceUrl: GCP_GPU_SPEC_URL },
        gpuSpecificationsStatus: 'sourced' }, host.hourlyUsd + rate, sourceUrl, observedAt,
        { billingKind: 'on-demand-composed', priceFormula: 'host VM hourly rate + one GPU hourly add-on',
          priceComponents: [{ name: host.name, hourlyUsd: host.hourlyUsd, sourceUrl: host.priceSourceUrl },
            { name: `1× ${gpu}`, hourlyUsd: rate, sourceUrl }],
          includes: 'One predefined N1 host plus one GPU; no GPU workstation license, discount or separate storage.' }));
    }
  }
  return result;
}

/** Discard scripts while streaming: Google embeds large alternate-region price datasets we do not use. */
export async function readGooglePricingHTML(response) {
  if (!response.ok) throw new Error(`Google Cloud pricing returned HTTP ${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const kept = []; let pending = '', inScript = false;
  while (true) {
    const { value, done } = await reader.read();
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    while (true) {
      const marker = inScript ? /<\/script\s*>/i.exec(pending) : /<script\b/i.exec(pending);
      if (!marker) {
        if (done) { if (!inScript) kept.push(pending); pending = ''; }
        else if (pending.length > 32) { if (!inScript) kept.push(pending.slice(0, -32)); pending = pending.slice(-32); }
        break;
      }
      if (!inScript) kept.push(pending.slice(0, marker.index));
      pending = pending.slice(marker.index + marker[0].length);
      inScript = !inScript;
    }
    if (done) break;
  }
  if (inScript) throw new Error('Truncated Google Cloud pricing HTML');
  return kept.join('');
}

async function fetchGCPCatalog(fetcher, now) {
  const rows = [];
  const htmlByPage = {};
  let gpuHtml = '';
  // Sequential pages limit peak memory in the deployed Worker.
  for (const page of GCP_PRICE_PAGES) {
    const response = await fetcher(GCP_PRICING_ROOT + page, { headers: { accept: 'text/html', 'accept-language': 'en-US' }, signal: AbortSignal.timeout(55000) });
    const html = await readGooglePricingHTML(response);
    const parsed = parseGCPCatalogPage(html, now, page);
    if (parsed.length < (page === 'general-purpose' ? 150 : 5)) throw new Error(`Google Cloud ${page} pricing unexpectedly incomplete (${parsed.length} shapes)`);
    rows.push(...parsed);
    if (page === 'general-purpose') htmlByPage[page] = html;
    if (page === 'accelerator-optimized') gpuHtml = html;
  }
  rows.push(...composeGCPGPUConfigurations(rows, gpuHtml, now));
  rows.push(...await augmentGoogleCatalog(rows, fetcher, now,
    { parsePage: parseGCPCatalogPage, readHTML: readGooglePricingHTML, htmlByPage }));
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new Error('Duplicate Google Cloud shape across pricing tables');
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function refreshCatalog(previous = null, { fetcher = fetch, now = new Date().toISOString(), benchmarks = { records: [] }, gpuBenchmarks = { records: [] }, providerIds = PROVIDERS.map(provider => provider.id) } = {}) {
  if (providerIds.some(id => !PROVIDERS.some(provider => provider.id === id))) throw new Error('Unsupported catalog provider');
  previous = activeProviderSnapshot(previous);
  const loaders = {
    aws: async () => {
      const [prices, specs, olderSpecs] = await Promise.allSettled([
        fetchText(AWS_URL, fetcher).then(JSON.parse),
        fetchText(awsSpec, fetcher).then(parseAWSAccelerators),
        fetchText(awsPreviousSpec, fetcher).then(html => parseAWSAccelerators(html, awsPreviousSpec)),
      ]);
      if (prices.status === 'rejected') throw prices.reason;
      const combined = new Map([
        ...(olderSpecs.status === 'fulfilled' ? olderSpecs.value : []),
        ...(specs.status === 'fulfilled' ? specs.value : []),
      ]);
      // Published launch specifications retain prior-generation models omitted from current tables.
      const p2Source = 'https://aws.amazon.com/blogs/aws/new-p2-instance-type-for-amazon-ec2-up-to-16-gpus/';
      for (const [name, vcpus, ramGiB, gpuCount, vramGiB] of [
        ['p2.xlarge', 4, 61, 1, 12], ['p2.8xlarge', 32, 488, 8, 96], ['p2.16xlarge', 64, 732, 16, 192],
      ]) if (!combined.has(name)) combined.set(name, { vcpus, ramGiB, gpuCount, vramGiB, gpu: 'NVIDIA K80', specSourceUrl: p2Source });
      if (!combined.has('g3s.xlarge')) combined.set('g3s.xlarge', { vcpus: 4, ramGiB: 30.5,
        gpuCount: 1, vramGiB: 8, gpu: 'NVIDIA M60',
        specSourceUrl: 'https://aws.amazon.com/blogs/machine-learning/serving-deep-learning-at-curalate-with-apache-mxnet-aws-lambda-and-amazon-elastic-inference/' });
      const rows = parseAWSCatalog(prices.value, now, combined, previous?.instances ?? []);
      if (rows.length < 500) throw new Error(`AWS catalog unexpectedly incomplete (${rows.length} shapes)`);
      return rows;
    },
    azure: () => fetchAzureCatalog(fetcher, now),
    gcp: () => fetchGCPCatalog(fetcher, now),
    alibaba: async () => (await import('./providers/alibaba.mjs')).fetchAlibabaCatalog(fetcher, now),
    oracle: async () => (await import('./providers/oracle.mjs')).fetchOracleCatalog(fetcher, now),
    ibm: async () => (await import('./providers/ibm.mjs')).fetchIBMCatalog(fetcher, now),
  };
  const selectedProviders = PROVIDERS.filter(provider => providerIds.includes(provider.id));
  const outcomes = await Promise.allSettled(selectedProviders.map(async p => {
    const result = await loaders[p.id]();
    const rows = Array.isArray(result) ? result : result.instances;
    if (!rows?.length || rows.some(row => row.provider !== p.id || !(row.hourlyUsd > 0)
      || !(row.vcpus > 0) || !(row.ramGiB > 0) || !row.priceSourceUrl || !row.observedAt)
      || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`Invalid ${p.name} catalog`);
    return { instances: rows, metadata: result.metadata ?? null };
  }));
  const instances = previous?.instances?.filter(row => !providerIds.includes(row.provider)) ?? [];
  const providers = previous?.providers?.filter(row => !providerIds.includes(row.id)) ?? [];
  outcomes.forEach((outcome, index) => {
    const provider = selectedProviders[index];
    if (outcome.status === 'fulfilled') {
      instances.push(...outcome.value.instances);
      providers.push({ ...provider, status: 'fresh', checkedAt: now, lastSuccessAt: now,
        instanceCount: outcome.value.instances.length, ...(outcome.value.metadata ? { coverage: outcome.value.metadata } : {}) });
    } else {
      const retained = previous?.instances?.filter(item => item.provider === provider.id) ?? [];
      const old = previous?.providers?.find(p => p.id === provider.id);
      instances.push(...retained);
      providers.push({ ...provider, status: retained.length ? 'stale' : 'unavailable', checkedAt: now,
        lastSuccessAt: old?.lastSuccessAt ?? retained[0]?.observedAt ?? null, instanceCount: retained.length,
        ...(old?.coverage ? { coverage: old.coverage } : {}),
        error: String(outcome.reason?.message ?? 'Source unavailable').slice(0, 240) });
    }
  });
  const enriched = attachGPUAndCPUBenchmarks(instances, benchmarks, gpuBenchmarks);
  return { schemaVersion: 1, catalogVersion: 1, currency: 'USD',
    updatedAt: outcomes.some(outcome => outcome.status === 'fulfilled') ? now : previous?.updatedAt ?? null,
    attemptedAt: now, refreshIntervalHours: 24,
    providers: PROVIDERS.map(provider => providers.find(row => row.id === provider.id)).filter(Boolean), instances: enriched,
    benchmarkMethodology: cpuMethodology(benchmarks), gpuBenchmarkMethodology: gpuBenchmarks.methodology ?? null,
    coverage: { instanceCount: enriched.length, uniqueProviderShapes: new Set(enriched.map(i => `${i.provider}:${i.name}`)).size,
      gpuPricedShapes: enriched.filter(i => i.acceleratorKind === 'gpu').length,
      gpuShapesWithSpecifications: enriched.filter(i => i.gpu && i.gpuCount > 0 && i.vramGiB > 0).length,
      cpuBenchmarkShapes: enriched.filter(i => i.geekbench6Multi).length,
      gpuBenchmarkShapes: enriched.filter(i => i.geekbenchGpu).length,
      regionsPerProvider: 1, sampling: 'AWS non-burstable Linux regional on-demand shapes; Azure East US Linux meters matched to exact hardware metadata; Google Iowa predefined compute and network tables plus documented N1 GPU bundles; Alibaba Virginia public ECS catalog; Oracle fixed shapes and a disclosed representative flexible-VM sample; IBM Dallas public VPC profiles.',
      exclusions: 'AWS T-family and Azure burstable instances; Spot/reserved/commitment/promotion/licensed OS prices; Azure shapes without active exact hardware metadata or with ambiguous Linux meters; Google shared-core/sole-tenant/custom shapes and tables without an explicit Iowa region; unverified or unavailable public regional prices. Provider-specific exclusions accompany each source.',
      limitations: 'This is a catalog of public list rates, not a capacity guarantee. Distinct disk variants and VM sizes remain separate priced shapes. Catalog count is not benchmark-matched training count. Accelerator ASIC/FPGA/media instances are identified separately from GPUs.' },
    attributions: [{ name: 'Spare Cores hardware metadata', url: serverSpecifications.sourceRepository,
      license: serverSpecifications.license, licenseUrl: serverSpecifications.licenseUrl,
      sourceCommit: serverSpecifications.sourceCommit, retrievedAt: serverSpecifications.retrievedAt,
      changes: serverSpecifications.changes }, ...(Array.isArray(benchmarks) ? benchmarks : [benchmarks])
      .filter(dataset => dataset?.attribution).map(dataset => ({ name: dataset.attribution.title,
        url: dataset.attribution.source, license: dataset.attribution.license,
        licenseUrl: dataset.attribution.licenseUrl, sourceCommit: dataset.attribution.sourceCommit,
        changes: dataset.attribution.changes }))],
    memoryUnitConvention: 'Memory uses documented GiB where available. New catalog rows whose providers specify nominal GB without a byte convention retain that value and an explicit ramUnit/vramUnit of GB; no decimal conversion is assumed. Original capacities and units are retained. Source memory definitions are preserved: Google Cloud defines its GB as binary GiB; explicitly decimal GB elsewhere are converted using 1 GB = 10^9 bytes, while GiB use 2^30 bytes. Provider memory-label conventions may differ, so a normalized nominal figure does not prove a difference in usable device memory.',
    scope: 'One US reference region per provider; Linux, public on-demand USD/hour. CPU and RAM are published hardware specifications, not performance estimates. Azure hardware metadata is adapted from Spare Cores under CC BY-SA 4.0; rates remain official Microsoft prices. Google Cloud CPU/RAM and rates come from official predefined VM tables; N1 GPU configurations add the independently published GPU charge to the full VM rate. Alibaba, Oracle and IBM prices come from their public pricing catalogs. Oracle flexible rates compose published CPU and RAM components; selected flexible configurations are a representative sample. Full machine prices include bundled storage/transfer where applicable; separate disks, egress, public IPv4, tax and support are excluded.' };
}

/** Apply curated GPU results only within one exact version and backend cohort. */
export function attachGPUAndCPUBenchmarks(instances, benchmarks = { records: [] }, gpuBenchmarks = { records: [] }) {
  const methodology = gpuBenchmarks?.methodology;
  const major = methodology?.versionMajor;
  const records = Array.isArray(gpuBenchmarks?.records) ? gpuBenchmarks.records : [];
  const versions = [...new Set(records.map(r => r.geekbenchGpu?.version).filter(v => typeof v === 'string' && /^[67]\.\d+\.\d+$/.test(v)))];
  const version = methodology?.version ?? (versions.length === 1 ? versions[0] : null);
  const cohortValid = [6, 7].includes(major) && methodology?.api === 'OpenCL'
    && typeof version === 'string' && version.startsWith(`${major}.`) && /^[67]\.\d+\.\d+$/.test(version);
  return attachBenchmarks(instances, benchmarks).map(item => {
    const { geekbenchGpu: previousGPU, ...clean } = item;
    if (!cohortValid || !clean.gpu || clean.gpuCount !== 1) return clean;
    const matches = records.filter(r => r.provider === clean.provider && r.name === clean.name);
    if (matches.length !== 1) return clean;
    const result = matches[0].geekbenchGpu;
    if (!result || result.version !== version || result.api !== 'OpenCL'
      || result.os !== 'Linux' || result.vcpus !== clean.vcpus || result.ramGiB !== clean.ramGiB
      || result.gpu !== clean.gpu || result.gpuCount !== 1 || !Number.isFinite(result.score) || result.score <= 0
      || !new RegExp(`^https://browser\\.geekbench\\.com/v${major}/${major === 7 ? 'gpu' : 'compute'}/\\d+$`).test(result.url ?? '')) return clean;
    return { ...clean, geekbenchGpu: result };
  });
}
