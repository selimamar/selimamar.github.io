/** Additional documented Google configurations; never expands an arbitrary custom-VM grid. */
export const GOOGLE_PRICING_ROOT = 'https://cloud.google.com/products/compute/pricing/';
export const GOOGLE_GPU_PRICE_URL = 'https://cloud.google.com/products/compute/gpus-pricing?hl=en';
export const GOOGLE_GPU_SPEC_URL = 'https://docs.cloud.google.com/compute/docs/gpus';
const REGION = 'us-central1 · Iowa';
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const number = value => /^\d[\d,]*(?:\.\d+)?$/.test(value ?? '') ? Number(value.replace(/,/g, '')) : null;
const hourly = value => /^\$([\d,.]+)\s*\/\s*1 hour$/.test(value ?? '') ? Number(/^\$([\d,.]+)/.exec(value)[1].replace(/,/g, '')) : null;

function tables(html) {
  let region = null;
  const found = [];
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const token of clean.matchAll(/<li\b[^>]*>|<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (/^<li\b/i.test(token[0])) {
      if (/aria-selected=["']true["']/.test(token[0])) region = /data-value=["']([^"']+)["']/.exec(token[0])?.[1] ?? null;
    } else found.push({ region,
      headers: [...token[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(cell => text(cell[1])),
      rows: [...token[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]))).filter(row => row.length),
    });
  }
  return found;
}

export function parseGoogleNetworkPrices(html, now) {
  // On this specific official page the unlabeled memory column uses the declared binary GB convention.
  if (!/JEDEC binary gigabytes/.test(html) || !/gibibytes/.test(html)) throw new Error('Google network pricing memory convention is missing');
  const rows = new Map();
  const sourceUrl = GOOGLE_PRICING_ROOT + 'network-optimized';
  for (const table of tables(html)) {
    if (table.region !== 'Iowa (us-central1)' || table.headers[0] !== 'Machine Type') continue;
    const priceIndex = table.headers.findIndex(value => /^(?:Default|Price)\b/.test(value) && /\(USD\)/.test(value));
    const cpuIndex = table.headers.indexOf('Cores (Hyper threaded)'), ramIndex = table.headers.indexOf('Memory');
    if (priceIndex < 0 || cpuIndex < 0 || ramIndex < 0) continue;
    for (const cells of table.rows) {
      const name = cells[0], hourlyUsd = hourly(cells[priceIndex]), vcpus = number(cells[cpuIndex]), ramGiB = number(cells[ramIndex]);
      if (cells.length !== table.headers.length || !/^(?:c4n|m4n)-(?:standard|highmem|highcpu|megamem|ultramem|hypermem)-\d+$/.test(name)
        || !(hourlyUsd > 0) || !(vcpus > 0) || !(ramGiB > 0)) continue;
      const row = { id: `gcp:${name}`, provider: 'gcp', name, region: REGION, family: name.split('-')[0],
        vcpus, ramGiB, hourlyUsd, observedAt: now, priceSourceUrl: sourceUrl, specSourceUrl: sourceUrl,
        cpuTenancy: 'dedicated-vCPU', acceleratorKind: null, billingKind: 'on-demand', consumptionModelId: '7754-699E-0EBF',
        memoryUnitBasis: 'The provider defines JEDEC GB as binary GiB on the pricing page.',
        includes: 'Published predefined VM rate with standard networking; separate disks, premium images and traffic excluded.' };
      if (rows.has(name) && JSON.stringify(rows.get(name)) !== JSON.stringify(row)) throw new Error(`Conflicting Google network shape ${name}`);
      rows.set(name, row);
    }
  }
  return [...rows.values()];
}

export function composeGoogleMultiGpu(baseRows, gpuHtml, now) {
  const definitions = {
    'NVIDIA T4': { code: 'T4', capacity: 16, limits: [[2, 48, 312], [4, 96, 624]] },
    'NVIDIA P4': { code: 'P4', capacity: 8, limits: [[2, 48, 312], [4, 96, 624]] },
    'NVIDIA V100': { code: 'V100', capacity: 16, limits: [[2, 24, 156], [4, 48, 312], [8, 96, 624]] },
  };
  const rates = new Map();
  for (const table of tables(gpuHtml)) {
    if (table.region !== 'Iowa (us-central1)' || table.headers[0] !== 'Model'
      || table.headers[3] !== 'GPU price (USD) per GPU') continue;
    for (const cells of table.rows) {
      const definition = definitions[cells[0]], rate = hourly(cells[3]);
      if (!definition || cells[1] !== '1 GPU' || !(rate > 0) || !cells[2].startsWith(`${definition.capacity} GB `)) continue;
      if (rates.has(cells[0])) throw new Error(`Duplicate Google per-GPU rate ${cells[0]}`);
      rates.set(cells[0], rate);
    }
  }
  if (rates.size !== 3) throw new Error('Google explicit per-GPU hourly price table is incomplete');
  const rows = [];
  for (const host of baseRows.filter(row => row.provider === 'gcp' && row.region === REGION && /^n1-(standard|highcpu|highmem)-\d+$/.test(row.name))) {
    if (!(host.hourlyUsd > 0) || !(host.vcpus > 0) || !(host.ramGiB > 0) || !Number.isFinite(Date.parse(host.observedAt))) continue;
    const observedAt = new Date(Math.min(Date.parse(host.observedAt), Date.parse(now))).toISOString();
    for (const [gpu, perGpuRate] of rates) {
      const definition = definitions[gpu];
      for (const [gpuCount, maxCpu, maxRam] of definition.limits) {
        if (host.vcpus > maxCpu || host.ramGiB > maxRam) continue;
        const name = `${host.name} + ${gpuCount}× ${definition.code}`, vramGiB = gpuCount * definition.capacity;
        rows.push({ id: `gcp:${name}`, provider: 'gcp', name, baseMachineName: host.name, region: REGION,
          family: `n1-${definition.code.toLowerCase()}`, vcpus: host.vcpus, ramGiB: host.ramGiB,
          cpuTenancy: 'dedicated-vCPU', acceleratorKind: 'gpu', gpu, gpuCount, vramGiB,
          hourlyUsd: host.hourlyUsd + gpuCount * perGpuRate, observedAt,
          priceSourceUrl: GOOGLE_GPU_PRICE_URL, specSourceUrl: GOOGLE_GPU_SPEC_URL,
          gpuSpecificationsStatus: 'sourced', billingKind: 'on-demand-composed',
          vramCapacity: { value: vramGiB, unit: 'GB', basis: 'provider-published accelerator capacity; provider defines GB as binary GiB', sourceUrl: GOOGLE_GPU_SPEC_URL },
          cpuBenchmarkName: host.name, cpuBenchmarkBasis: 'exact-underlying-host-shape',
          cpuBenchmarkNote: 'Measured underlying N1 host shape; GPU attachment preserves the listed host vCPU and RAM. The paired benchmark was not run with these GPUs attached.',
          cpuBenchmarkSpecSourceUrl: GOOGLE_GPU_SPEC_URL,
          priceFormula: 'host VM hourly rate + GPU count × published per-GPU hourly add-on',
          priceComponents: [{ name: host.name, hourlyUsd: host.hourlyUsd, observedAt: host.observedAt, sourceUrl: host.priceSourceUrl },
            { name: `${gpuCount}× ${gpu}`, quantity: gpuCount, unitHourlyUsd: perGpuRate, hourlyUsd: gpuCount * perGpuRate, observedAt: now, sourceUrl: GOOGLE_GPU_PRICE_URL }],
          includes: 'Documented predefined N1 host plus its permitted GPU count. No GPU workstation license, discount or separate storage. Multi-GPU performance is not inferred.' });
      }
    }
  }
  return rows;
}

/** Return only new configurations. The caller supplies shared base parsers to avoid circular imports. */
export async function augmentGoogleCatalog(baseRows, fetcher, now, { parsePage, readHTML, htmlByPage = {} } = {}) {
  if (typeof parsePage !== 'function' || typeof readHTML !== 'function') throw new Error('Google augmentation requires the shared page parser and HTML reader');
  async function getPage(key, url) {
    const cached = htmlByPage instanceof Map ? htmlByPage.get(key) : htmlByPage[key];
    if (typeof cached === 'string') return cached;
    const response = await fetcher(url, { headers: { accept: 'text/html', 'accept-language': 'en-US' }, signal: AbortSignal.timeout(55000) });
    return readHTML(response);
  }
  const general = await getPage('general-purpose', GOOGLE_PRICING_ROOT + 'general-purpose');
  // These are ordinary published table headers, not synthetic resource configurations.
  const normalized = general.replace(/>\s*VM Shape\s*</g, '>Machine type<');
  const generalRows = parsePage(normalized, now, 'general-purpose');
  const network = parseGoogleNetworkPrices(await getPage('network-optimized', GOOGLE_PRICING_ROOT + 'network-optimized'), now);
  if (network.length < 20) throw new Error(`Google network pricing unexpectedly incomplete (${network.length})`);
  const gpuRows = composeGoogleMultiGpu(baseRows, await getPage('gpus-pricing', GOOGLE_GPU_PRICE_URL), now);
  const existing = new Set(baseRows.map(row => row.id)), extras = new Map();
  for (const row of [...generalRows, ...network, ...gpuRows]) {
    if (existing.has(row.id)) continue;
    if (extras.has(row.id) && JSON.stringify(extras.get(row.id)) !== JSON.stringify(row)) throw new Error(`Duplicate Google augmentation ${row.name}`);
    extras.set(row.id, row);
  }
  return [...extras.values()].sort((a, b) => a.name.localeCompare(b.name));
}
