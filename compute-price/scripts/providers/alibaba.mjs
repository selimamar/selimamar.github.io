/** Official anonymous international ECS list-price feed; remote JavaScript is parsed, never executed. */
export const ALIBABA_PRICING_URL = 'https://www.alibabacloud.com/product/ecs/pricing';
export const ALIBABA_LOADER_URL = 'https://ecsnew.console.aliyun.com/tools/price.do?channel=intl';
export const ALIBABA_REGION = 'us-east-1 · Virginia';
const REGION_ID = 'us-east-1';
const DATA_URL = /^https:\/\/g\.alicdn\.com\/aliyun\/ecs-price-info-intl\/([\d.]+)\/price\/js_price\/filter_price\/(instanceTypePrice_2|instanceTypeDefinition)\.js$/;
const DISPLAY_URL = /^https:\/\/g\.alicdn\.com\/aliyun\/www-product-ecs-price\/[\d.]+\/index\.js$/;

function readAssignment(source, variable) {
  const match = new RegExp(`^\\s*var\\s+${variable}\\s*=\\s*([\\s\\S]*?)\\s*;?\\s*$`).exec(source);
  if (!match) throw new Error(`Alibaba missing JSON assignment ${variable}`);
  try { return JSON.parse(match[1]); }
  catch { throw new Error(`Alibaba invalid JSON assignment ${variable}`); }
}

export function parseAlibabaLoader(source) {
  const urls = [...source.matchAll(/["'](https:\/\/[^"']+)["']/g)].map(match => match[1]);
  function one(predicate, label) {
    const matches = [...new Set(urls.filter(predicate))];
    if (matches.length !== 1) throw new Error(`Alibaba expected one international ${label} source`);
    return matches[0];
  }
  const priceSourceUrl = one(url => DATA_URL.test(url) && url.endsWith('/instanceTypePrice_2.js'), 'Linux pricing');
  const specSourceUrl = one(url => DATA_URL.test(url) && url.endsWith('/instanceTypeDefinition.js'), 'specification');
  if (DATA_URL.exec(priceSourceUrl)[1] !== DATA_URL.exec(specSourceUrl)[1]) throw new Error('Alibaba price/specification versions differ');
  return { priceSourceUrl, specSourceUrl, displaySourceUrl: one(url => DISPLAY_URL.test(url), 'display') };
}

function verifyUnits({ priceSourceUrl, specSourceUrl, displaySourceUrl, displayText }) {
  if (!DATA_URL.test(priceSourceUrl) || !DATA_URL.test(specSourceUrl) || !DISPLAY_URL.test(displaySourceUrl)) {
    throw new Error('Alibaba requires official international USD sources');
  }
  // These labels are in the English renderer used by the international pricing page.
  // row[6] contains discounted terms, row[8] the list terms; index zero is hourly.
  for (const marker of ['"common.price.unit.yuan":"USD"',
    '"common.column.title.hour":"Pay-as-you-go Hourly Price"',
    '"common.column.title.standardHour":"List Price (Pay-as-you-go)"',
    '"common.column.title.memory":"MEM (GiB)"', 'e.GPUMemorySize+" GB"',
    'c=r[6],s=r[8];c[8]=s[0]', 'standardHour:(0,l.formatGlobalPrice)(e[8])']) {
    if (!displayText?.includes(marker)) throw new Error('Alibaba currency, hourly-rate mapping, or memory-unit declaration changed');
  }
}

function positiveDecimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

export function parseAlibabaCatalog(priceText, definitionText, context) {
  verifyUnits(context);
  const { now, priceSourceUrl, specSourceUrl, displaySourceUrl } = context;
  if (!Number.isFinite(Date.parse(now))) throw new Error('Alibaba observation time is invalid');
  const data = readAssignment(priceText, 'instanceTypePrice_2');
  const definitions = readAssignment(definitionText, 'instanceTypeDefineItems');
  if (!Array.isArray(definitions)) throw new Error('Alibaba specifications are not an array');
  const specs = new Map();
  for (const spec of definitions) {
    if (specs.has(spec.InstanceTypeId)) throw new Error(`Alibaba duplicate specification ${spec.InstanceTypeId}`);
    specs.set(spec.InstanceTypeId, spec);
  }
  const region = data.linux?.[REGION_ID];
  if (!region || typeof region !== 'object') throw new Error('Alibaba Virginia Linux price table is missing');
  const result = new Map();
  for (const [generation, networks] of Object.entries(region)) {
    if (!/^ecs-\d+$/.test(generation) || !networks?.vpc) continue;
    for (const [ioOptimized, records] of Object.entries(networks.vpc)) {
      if (!['true', 'false'].includes(ioOptimized) || !Array.isArray(records)) continue;
      for (const raw of records) {
        if (!Array.isArray(raw) || raw[1] !== 'linux' || raw[2] !== REGION_ID || raw[3] !== ioOptimized || raw[7] !== 'vpc') continue;
        const name = raw[0], spec = specs.get(name), hourlyUsd = positiveDecimal(raw[8]?.[0]);
        if (!spec || !/^ecs\.[a-z0-9.-]+$/.test(name) || !hourlyUsd || !positiveDecimal(raw[4]) || !positiveDecimal(raw[5])) continue;
        if (raw[4] !== spec.CpuCoreCount || raw[5] !== spec.MemorySize) throw new Error(`Alibaba price/specification mismatch for ${name}`);
        const bareMetal = spec.InstanceCategory === 'ECS Bare Metal' || /^ecs\.ebm/.test(name);
        const burstable = spec.InstanceFamilyLevel === 'CreditEntryLevel';
        const cpuTenancy = bareMetal ? 'bare-metal' : burstable ? 'burstable' : spec.InstanceFamilyLevel === 'EntryLevel' ? 'shared-vCPU' : 'dedicated-vCPU';
        const reportedCount = positiveDecimal(spec.GPUAmount), gpuModel = spec.GPUSpec?.trim();
        const isGpu = Boolean(reportedCount && gpuModel && (/^(?:NVIDIA|AMD)\b/.test(gpuModel) || /GPU/.test(spec.InstanceCategory ?? '')));
        const row = { id: `alibaba:${name}`, provider: 'alibaba', name, region: ALIBABA_REGION,
          family: spec.InstanceTypeFamily, vcpus: spec.CpuCoreCount, ramGiB: spec.MemorySize,
          hourlyUsd, currency: 'USD', billingKind: 'on-demand', operatingSystem: 'Linux',
          observedAt: now, priceSourceUrl, specSourceUrl, pricePageUrl: ALIBABA_PRICING_URL,
          displaySourceUrl, priceSourceVersion: DATA_URL.exec(priceSourceUrl)[1],
          priceRecordPath: ['linux', REGION_ID, generation, 'vpc', ioOptimized, name],
          sourceHourlyListPrice: raw[8][0], priceBasis: 'Published pay-as-you-go hourly list price; original-rate array index 0.',
          cpuTenancy, architecture: spec.CpuArchitecture === 'ARM' ? 'arm64' : spec.CpuArchitecture === 'X86' ? 'x86_64' : spec.CpuArchitecture,
          cpuModel: spec.PhysicalProcessorModel || null, cpuThreadsPerCore: spec.CpuOptions?.ThreadsPerCore ?? null,
          acceleratorKind: isGpu ? 'gpu' : reportedCount ? 'other' : null,
          memoryUnitBasis: 'Official international price table labels system memory in GiB.',
          availabilityNote: 'Publicly listed price; regional inventory and account eligibility are not checked.',
          includes: 'Instance compute, RAM, attached accelerators and any mandatory local storage. Separately billed cloud disks, images and traffic excluded.' };
        if (spec.LocalStorageAmount > 0 && spec.LocalStorageCapacity > 0) row.includedLocalStorage = {
          count: spec.LocalStorageAmount, capacityPerDeviceGB: spec.LocalStorageCapacity, kind: spec.LocalStorageCategory };
        if (isGpu) {
          const fraction = /\*1\/(\d+)$/.exec(gpuModel);
          row.gpu = gpuModel;
          row.gpuCount = fraction ? reportedCount / Number(fraction[1]) : reportedCount;
          row.gpuCountReported = reportedCount;
          row.gpuAllocation = fraction ? 'fractional' : 'full';
          row.gpuSpecSourceUrl = specSourceUrl;
          if (positiveDecimal(spec.GPUMemorySize)) {
            const capacityGB = spec.GPUMemorySize * reportedCount;
            // The GB label alone does not establish the device's byte convention.
            // GPUMemorySize already describes the allocated partition; do not multiply it by the physical GPU fraction again.
            row.vramGiB = capacityGB;
            row.vramUnit = 'GB';
            row.vramCapacity = { value: capacityGB, unit: 'GB', byteConvention: 'unspecified', basis: 'Official renderer labels per-device GPUMemorySize in GB; multiplied by reported device count, without further partition scaling.', sourceUrl: specSourceUrl };
            row.gpuSpecificationsStatus = 'sourced';
          } else row.gpuSpecificationsStatus = 'partial';
        }
        const previous = result.get(name);
        if (previous) {
          if (previous.hourlyUsd !== hourlyUsd || previous.vcpus !== row.vcpus || previous.ramGiB !== row.ramGiB) throw new Error(`Alibaba ambiguous rate for ${name}`);
          continue;
        }
        result.set(name, row);
      }
    }
  }
  if (!result.size) throw new Error('Alibaba returned no verified Virginia Linux hourly prices');
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchAlibabaCatalog(fetcher = fetch, now = new Date().toISOString()) {
  async function read(url) {
    const response = await fetcher(url, { headers: { accept: 'text/javascript, application/javascript, text/plain' }, signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error(`Alibaba source HTTP ${response.status}`);
    return response.text();
  }
  const sources = parseAlibabaLoader(await read(ALIBABA_LOADER_URL));
  const [priceText, definitionText, displayText] = await Promise.all([
    read(sources.priceSourceUrl), read(sources.specSourceUrl), read(sources.displaySourceUrl),
  ]);
  return parseAlibabaCatalog(priceText, definitionText, { ...sources, displayText, now });
}
