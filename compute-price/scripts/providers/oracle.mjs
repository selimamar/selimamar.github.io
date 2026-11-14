/** Public OCI list prices. Curated shape/SKU mappings are verified against live official documents. */
export const ORACLE_PRICE_URL = 'https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?currencyCode=USD';
export const ORACLE_SHAPES_URL = 'https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm';
export const ORACLE_PRICE_LIST_URL = 'https://www.oracle.com/cloud/price-list/';
export const ORACLE_GLOBAL_PRICE_URL = 'https://www.oracle.com/cloud/pricing/';
const REGION = 'us-ashburn-1';
const MEMORY_BASIS = 'Provider-published GB retained without numerical conversion. Oracle does not specify the byte convention on the shape page; the legacy GiB field holds this nominal capacity, not a verified binary-byte measurement.';
const FLEX_GRID = [1, 2, 4, 8];
const SKU = {
  "B109479": {
    "name": "Compute - GPU - L40S",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B109485": {
    "name": "OCI - Compute - GPU - MI300X",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B109529": {
    "name": "Compute - Standard - A2 OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B109530": {
    "name": "Compute - Standard - A2 Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B110519": {
    "name": "OCI - Compute - GPU - H200",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B110978": {
    "name": "OCI - Compute - GPU - B200",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B111129": {
    "name": "OCI - Compute - Standard - E6 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B111130": {
    "name": "OCI - Compute - Standard - E6 - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B112141": {
    "name": "OCI - Compute - Standard - X12 Ax - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B112142": {
    "name": "OCI - Compute - Standard - X12 Ax - Memory",
    "metric": "Gigabyte Per Hour",
    "allowFreeTier": false
  },
  "B112145": {
    "name": "OCI - Compute - Standard - A4 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B112146": {
    "name": "OCI - Compute - Standard - A4 - Memory",
    "metric": "Gigabyte Per Hour",
    "allowFreeTier": false
  },
  "B112530": {
    "name": "OCI - Compute - Standard - E6 Ax - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B112531": {
    "name": "OCI - Compute - Standard - E6 Ax - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B112532": {
    "name": "OCI - Compute - Standard - A4 Ax - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B112533": {
    "name": "OCI - Compute - Standard - A4 Ax - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B112613": {
    "name": "OCI - Compute - GPU - RTX PRO 6000",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B89734": {
    "name": "Compute - GPU Standard - V2",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B92740": {
    "name": "Compute - GPU - E3",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B93113": {
    "name": "Compute - Standard - E4 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B93114": {
    "name": "Compute - Standard - E4 - Memory",
    "metric": "Gigabyte Per Hour",
    "allowFreeTier": false
  },
  "B93121": {
    "name": "Compute - Dense I/O - E4 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B93122": {
    "name": "Compute - Dense I/O - E4 - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B93123": {
    "name": "Compute - Dense I/O - E4 - NVMe",
    "metric": "NVMe Terabyte Per Hour",
    "allowFreeTier": false
  },
  "B93297": {
    "name": "Compute - Standard - A1 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": true
  },
  "B93298": {
    "name": "Compute - Standard - A1 - Memory",
    "metric": "Gigabyte Per Hour",
    "allowFreeTier": true
  },
  "B93311": {
    "name": "Compute - Optimized - X9 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B93312": {
    "name": "Compute - Optimized - X9 - Memory",
    "metric": "Gigabyte Per Hour",
    "allowFreeTier": false
  },
  "B94176": {
    "name": "Compute - Standard - X9 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B94177": {
    "name": "Compute - Standard - X9 - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B95907": {
    "name": "Compute - GPU - A100 - v2",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B95909": {
    "name": "Compute - GPU - A10",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  },
  "B97384": {
    "name": "Compute - Standard - E5 - OCPU",
    "metric": "OCPU Per Hour",
    "allowFreeTier": false
  },
  "B97385": {
    "name": "Compute - Standard - E5 - Memory",
    "metric": "Gigabytes Per Hour",
    "allowFreeTier": false
  },
  "B98415": {
    "name": "Oracle Cloud Infrastructure - Compute - GPU - H100",
    "metric": "GPU Per Hour",
    "allowFreeTier": false
  }
};
// [shape, CPU SKU, RAM SKU, vCPU/OCPU, architecture]. A2/A4 OCPUs contain two Arm cores.
const FLEX = [
  ['VM.Standard3.Flex', 'B94176', 'B94177', 2, 'x86_64'],
  ['VM.Standard4.Ax.Flex', 'B112141', 'B112142', 2, 'x86_64'],
  ['VM.Standard.E4.Flex', 'B93113', 'B93114', 2, 'x86_64'],
  ['VM.Standard.E5.Flex', 'B97384', 'B97385', 2, 'x86_64'],
  ['VM.Standard.E6.Flex', 'B111129', 'B111130', 2, 'x86_64'],
  ['VM.Standard.E6.Ax.Flex', 'B112530', 'B112531', 2, 'x86_64'],
  ['VM.Standard.A1.Flex', 'B93297', 'B93298', 1, 'aarch64'],
  ['VM.Standard.A2.Flex', 'B109529', 'B109530', 2, 'aarch64'],
  ['VM.Standard.A4.Flex', 'B112145', 'B112146', 2, 'aarch64'],
  ['VM.Standard.A4.Ax.Flex', 'B112532', 'B112533', 2, 'aarch64'],
  ['VM.Optimized3.Flex', 'B93311', 'B93312', 2, 'x86_64'],
];
// Published fixed bare-metal bundles use the matching resource-priced family, not a per-OCPU headline.
const FIXED = [
  ['BM.Standard3.64', 'VM.Standard3.Flex', 64, 1024],
  ['BM.Standard4.Ax.120', 'VM.Standard4.Ax.Flex', 120, 1152],
  ['BM.Standard.E4.128', 'VM.Standard.E4.Flex', 128, 2048],
  ['BM.Standard.E5.192', 'VM.Standard.E5.Flex', 192, 2304],
  ['BM.Standard.E6.256', 'VM.Standard.E6.Flex', 256, 3072],
  ['BM.Standard.E6.Ax.192', 'VM.Standard.E6.Ax.Flex', 192, 1536],
  ['BM.Standard.A1.160', 'VM.Standard.A1.Flex', 160, 1024],
  ['BM.Standard.A4.48', 'VM.Standard.A4.Flex', 48, 768],
  ['BM.Standard.A4.Ax.48', 'VM.Standard.A4.Ax.Flex', 48, 768],
  ['BM.Optimized3.36', 'VM.Optimized3.Flex', 36, 512],
];
// [shape, SKU, OCPU, RAM GB, GPU model, GPU count, total GPU memory GB].
// Ambiguous MI355X/B300/GB200/GB300 memory tables and retired P100 shapes are omitted.
const GPU = [
  ['VM.GPU3.1', 'B89734', 6, 90, 'NVIDIA V100', 1, 16],
  ['VM.GPU3.2', 'B89734', 12, 180, 'NVIDIA V100', 2, 32],
  ['VM.GPU3.4', 'B89734', 24, 360, 'NVIDIA V100', 4, 64],
  ['BM.GPU3.8', 'B89734', 52, 768, 'NVIDIA V100', 8, 128],
  ['VM.GPU.A10.1', 'B95909', 15, 240, 'NVIDIA A10', 1, 24],
  ['VM.GPU.A10.2', 'B95909', 30, 480, 'NVIDIA A10', 2, 48],
  ['BM.GPU.A10.4', 'B95909', 64, 1024, 'NVIDIA A10', 4, 96],
  ['BM.GPU4.8', 'B92740', 64, 2048, 'NVIDIA A100 40GB', 8, 320],
  ['BM.GPU.A100-v2.8', 'B95907', 128, 2048, 'NVIDIA A100 80GB', 8, 640],
  ['BM.GPU.MI300X.8', 'B109485', 112, 2048, 'AMD MI300X', 8, 1536],
  ['BM.GPU.L40S.4', 'B109479', 112, 1024, 'NVIDIA L40S', 4, 192],
  ['BM.GPU.RTXPRO.8', 'B112613', 144, 3072, 'NVIDIA RTX PRO 6000 Blackwell', 8, 768],
  ['BM.GPU.H100.8', 'B98415', 112, 2048, 'NVIDIA H100 80GB', 8, 640],
  ['BM.GPU.H200.8', 'B110519', 112, 3072, 'NVIDIA H200', 8, 1128],
  ['BM.GPU.B200.8', 'B110978', 128, 4096, 'NVIDIA B200', 8, 1440],
];

const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const numeric = value => typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
const positive = value => Number.isFinite(value) && value > 0;
function tableRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(match => ({
    html: match[0], cells: [...match[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1])),
  }));
}
function shapeRow(rows, name, length) {
  const found = rows.filter(row => row.cells.length === length && row.cells[0].split(/\s/)[0] === name);
  if (found.length !== 1) throw new Error(`Oracle shape ${name}: expected one ${length}-column specification row`);
  return found[0].cells;
}
function exactNumber(value, expected, label) {
  if (numeric(value) !== expected) throw new Error(`Oracle ${label} changed: expected ${expected}, received ${value}`);
}

export function oracleRate(products, partNumber) {
  const definition = SKU[partNumber];
  if (!definition) throw new Error(`Unsupported Oracle SKU ${partNumber}`);
  const found = products.items?.filter(item => item.partNumber === partNumber) ?? [];
  if (found.length !== 1) throw new Error(`Oracle SKU ${partNumber} missing or duplicated`);
  const product = found[0];
  if (clean(product.displayName) !== definition.name || product.metricName !== definition.metric) throw new Error(`Oracle SKU ${partNumber} name or billing unit changed`);
  // Older documented API responses called the currency collection prices; current responses use currencyCodeLocalizations.
  const currencies = product.currencyCodeLocalizations ?? product.prices;
  const usd = currencies?.filter(item => item.currencyCode === 'USD') ?? [];
  if (usd.length !== 1) throw new Error(`Oracle SKU ${partNumber} has no unique USD price`);
  const rates = usd[0].prices?.filter(price => price.model === 'PAY_AS_YOU_GO') ?? [];
  const paid = rates.filter(price => positive(numeric(price.value)));
  if (paid.length !== 1 || rates.some(price => !Number.isFinite(numeric(price.value)) || numeric(price.value) < 0)) throw new Error(`Oracle SKU ${partNumber} has ambiguous or invalid on-demand rates`);
  if (rates.length > 1) {
    const free = rates.filter(price => numeric(price.value) === 0);
    if (!definition.allowFreeTier || rates.length !== 2 || free.length !== 1 || numeric(free[0].rangeMin) !== 0
      || !positive(numeric(free[0].rangeMax)) || numeric(paid[0].rangeMin) !== numeric(free[0].rangeMax)
      || !(numeric(paid[0].rangeMax) > numeric(paid[0].rangeMin))) throw new Error(`Oracle SKU ${partNumber} has unrecognized pricing tiers`);
  } else if (paid[0].rangeMin !== undefined && numeric(paid[0].rangeMin) !== 0) {
    throw new Error(`Oracle SKU ${partNumber} has an unexplained minimum-usage tier`);
  }
  return { partNumber, name: product.displayName, unit: product.metricName, unitHourlyUsd: numeric(paid[0].value),
    ...(rates.length > 1 ? { priceBasis: 'paid marginal rate after monthly free allowance', freeAllowance: numeric(paid[0].rangeMin) } : {}),
    sourceUrl: ORACLE_PRICE_URL };
}

export function parseOracleCatalog(products, shapesHtml, priceListHtml, now = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(now))) throw new Error('Oracle observation timestamp is invalid');
  if (!Array.isArray(products?.items) || !products.items.length) throw new Error('Oracle product catalog is empty');
  const rows = tableRows(shapesHtml), priceRows = tableRows(priceListHtml), doc = clean(shapesHtml), priceDoc = clean(priceListHtml);
  if (!/server price per hour is calculated by multiplying the GPU price per hour by the number of GPUs/i.test(priceDoc)) throw new Error('Oracle full-server GPU billing definition is missing');
  if (!/A1:[\s\S]{0,160}Each OCPU corresponds to a single hardware execution thread/.test(doc)
    || !/A2:[\s\S]{0,200}Each OCPU corresponds to two hardware execution threads/.test(doc)
    || !/A4:[\s\S]{0,200}Each OCPU corresponds to two hardware execution threads/.test(doc)) throw new Error('Oracle Arm OCPU mapping has changed');
  const rates = new Map(Object.keys(SKU).map(key => [key, oracleRate(products, key)]));
  const component = (partNumber, quantity) => ({ ...rates.get(partNumber), quantity, hourlyUsd: rates.get(partNumber).unitHourlyUsd * quantity });
  function base(name, shape, ocpus, ramGB, multiplier, architecture, components) {
    return { id: `oracle:${name}`, provider: 'oracle', name, baseMachineName: shape, family: shape.replace(/\.(Flex|\d+)$/, ''),
      region: REGION, regionName: 'US East (Ashburn)', regionScope: 'Uniform OCI public-region list prices; regional shape availability and capacity are not guaranteed.',
      architecture, ocpus, vcpus: ocpus * multiplier, vcpusPerOcpu: multiplier, ramGiB: ramGB, ramUnit: 'GB',
      ramCapacity: { value: ramGB, unit: 'GB', byteConvention: 'unspecified', sourceUrl: ORACLE_SHAPES_URL }, memoryUnitBasis: MEMORY_BASIS,
      hourlyUsd: Number(components.reduce((sum, item) => sum + item.hourlyUsd, 0).toFixed(12)), priceComponents: components,
      observedAt: now, priceSourceUrl: ORACLE_PRICE_URL, specSourceUrl: ORACLE_SHAPES_URL, priceCompositionSourceUrl: ORACLE_PRICE_LIST_URL,
      currency: 'USD', billingKind: 'on-demand-composed', cpuTenancy: 'dedicated-vCPU', acceleratorKind: null,
      deploymentType: name.startsWith('BM.') ? 'bare-metal' : 'virtual-machine',
      includes: 'Full configured compute rental, with a free Linux image and bundled local disks where specified. Separate boot/block storage, traffic, tax and optional licenses excluded. Free allowances and commitments are not deducted.' };
  }
  const instances = [];
  for (const [shape, cpu, memory, multiplier, architecture] of FLEX) {
    const row = shapeRow(rows, shape, 4), maxCpu = Number.parseInt(row[1], 10);
    const memoryLimit = /^(\d+) GB per OCPU\s*, up to (\d+) GB total/.exec(row[3]);
    if (!positive(maxCpu) || !memoryLimit || !/^1 GB or a value matching the number of OCPUs, whichever is greater$/.test(row[2])) throw new Error(`Oracle flex bounds changed for ${shape}`);
    for (const ocpus of FLEX_GRID) {
      const ramGB = 8 * ocpus;
      if (ocpus > maxCpu || ramGB > Math.min(Number(memoryLimit[1]) * ocpus, Number(memoryLimit[2]))) throw new Error(`Oracle representative configuration is no longer legal for ${shape}`);
      const name = `${shape} (${ocpus} OCPU, ${ramGB} GB)`;
      instances.push({ ...base(name, shape, ocpus, ramGB, multiplier, architecture, [component(cpu, ocpus), component(memory, ramGB)]),
        configurationBasis: 'Representative legal flex grid: 1, 2, 4 and 8 OCPUs, each with 8 published GB per OCPU. Analyst-selected samples, not provider defaults or the complete configuration space.',
        priceFormula: 'OCPUs × OCPU hourly rate + published RAM GB × memory hourly rate' });
    }
  }
  for (const [shape, flexShape, ocpus, ramGB] of FIXED) {
    const [, cpu, memory, multiplier, architecture] = FLEX.find(item => item[0] === flexShape);
    const row = shapeRow(rows, shape, 7);
    exactNumber(row[1], ocpus, `${shape} OCPU count`); exactNumber(row[2], ramGB, `${shape} RAM`);
    instances.push({ ...base(shape, shape, ocpus, ramGB, multiplier, architecture, [component(cpu, ocpus), component(memory, ramGB)]),
      configurationBasis: 'Complete provider-defined bare-metal shape; all published OCPUs and memory are billed.', localDiskDescription: row[3],
      priceFormula: 'OCPUs × OCPU hourly rate + published RAM GB × memory hourly rate' });
  }
  for (const [shape, ocpus, ramGB, nvmeTB] of [['VM.DenseIO.E4.Flex', 8, 128, 6.8], ['BM.DenseIO.E4.128', 128, 2048, 54.4]]) {
    const row = shapeRow(rows, shape, 7);
    exactNumber(row[1], ocpus, `${shape} OCPU count`); exactNumber(row[2], ramGB, `${shape} RAM`);
    if (Number.parseFloat(row[3]) !== nvmeTB || !row[3].includes('TB NVMe')) throw new Error(`Oracle ${shape} local disk specification changed`);
    const name = shape.endsWith('.Flex') ? `${shape} (${ocpus} OCPU, ${ramGB} GB)` : shape;
    instances.push({ ...base(name, shape, ocpus, ramGB, 2, 'x86_64', [component('B93121', ocpus), component('B93122', ramGB), component('B93123', nvmeTB)]),
      localNvmeTB: nvmeTB, configurationBasis: shape.endsWith('.Flex') ? 'Smallest of the three provider-defined E4 dense-I/O configurations.' : 'Complete provider-defined bare-metal shape.',
      priceFormula: 'OCPUs × OCPU hourly rate + published RAM GB × memory hourly rate + mandatory local NVMe TB × NVMe hourly rate' });
  }
  for (const [shape, sku, ocpus, ramGB, gpu, gpuCount, vramGB] of GPU) {
    const row = shapeRow(rows, shape, 8);
    exactNumber(row[1], ocpus, `${shape} OCPU count`); exactNumber(row[3], ramGB, `${shape} RAM`);
    const documentedVram = row[2] === '8 x 96 GB' ? 8 * 96 : numeric(row[2]);
    exactNumber(documentedVram, vramGB, `${shape} total VRAM`);
    // Match the public pricing-table shape and SKU together, so a moved/reassigned SKU fails closed.
    const priceRow = priceRows.find(item => (item.cells[0]?.toLowerCase() === shape.toLowerCase()
      || item.cells[0]?.toLowerCase().startsWith(shape.toLowerCase() + ' '))
      && item.html.includes(`data-partnumber="${sku}"`)
      && new RegExp(`^${gpuCount}\\s*x\\s*`, 'i').test(item.cells[1] ?? ''));
    if (!priceRow) throw new Error(`Oracle ${shape} GPU count or SKU mapping changed`);
    instances.push({ ...base(shape, shape, ocpus, ramGB, 2, 'x86_64', [component(sku, gpuCount)]),
      gpu, gpuCount, vramGiB: vramGB, vramUnit: 'GB', acceleratorKind: 'gpu', gpuSpecificationsStatus: 'sourced',
      vramCapacity: { value: vramGB, unit: 'GB', byteConvention: 'unspecified', sourceUrl: ORACLE_SHAPES_URL },
      configurationBasis: 'Complete provider-defined GPU host; the per-GPU rate includes CPU, RAM and bundled local storage.',
      localDiskDescription: row[4], priceFormula: 'GPU count × published per-GPU full-server hourly rate',
      performanceNote: 'No GPU benchmark is inferred from GPU count or model name.' });
  }
  return { instances: instances.sort((a, b) => a.name.localeCompare(b.name)), metadata: {
    provider: 'oracle', observedAt: now, sourceUpdatedAt: products.lastUpdated ?? null,
    priceSourceUrl: ORACLE_PRICE_URL, specSourceUrl: ORACLE_SHAPES_URL, compositionSourceUrl: ORACLE_PRICE_LIST_URL,
    regionalPricingSourceUrl: ORACLE_GLOBAL_PRICE_URL, region: REGION,
    count: instances.length, flexGrid: { ocpus: FLEX_GRID, memoryGBPerOcpu: 8 },
    samplingNote: 'Curated current families and fixed shapes, with a small explicit legal flex grid. Counts do not describe all possible configurable machines.',
    memoryUnitBasis: MEMORY_BASIS,
    exclusions: ['Retired P100 and previous-generation CPU shapes', 'Sales-contact-only HPC and dense-I/O E5/E6 shapes', 'GB200/GB300/B300/MI355X shapes with inconsistent published memory capacities', 'Spot, commitments, negotiated prices, dedicated VM hosts, Windows and AI Enterprise license add-ons'],
  } };
}

export async function fetchOracleCatalog(fetcher = fetch, now = new Date().toISOString()) {
  async function get(url, json = false) {
    const response = await fetcher(url, { headers: { accept: json ? 'application/json' : 'text/html', 'accept-language': 'en-US' }, signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error(`Oracle public source returned HTTP ${response.status}: ${url}`);
    return json ? response.json() : response.text();
  }
  const responses = await Promise.allSettled([get(ORACLE_PRICE_URL, true), get(ORACLE_SHAPES_URL), get(ORACLE_PRICE_LIST_URL)]);
  const failure = responses.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return parseOracleCatalog(...responses.map(result => result.value), now);
}
