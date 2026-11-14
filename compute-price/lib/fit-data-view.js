import { displayedGpuResourceModel } from './gpu-resource-view.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const providerNames = { aws: 'AWS', azure: 'Microsoft Azure', gcp: 'Google Cloud', alibaba: 'Alibaba Cloud', oracle: 'Oracle Cloud', ibm: 'IBM Cloud' };
const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '—';

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function firstSafeUrl(values) {
  return values.map(safeUrl).find(Boolean) ?? null;
}

function sourceLink(value, url, title) {
  const label = escapeHtml(value), href = safeUrl(url);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${label}</a>` : label;
}

/** Exact displayed-model cohorts, enriched with source metadata rather than extra catalog rows. */
export function getFitDataRows(report, resourceReport, annotatedRows = [], kind = 'cpu') {
  const model = kind === 'gpu' ? displayedGpuResourceModel(resourceReport) : report?.cpu?.displayed;
  const rows = kind === 'gpu' ? (model?.fit ? resourceReport?.rows : []) : model?.rows;
  const sourceRows = new Map((annotatedRows ?? []).map(row => [row.id, row]));
  const predictions = new Map((model?.validation?.predictions ?? []).map(row => [row.id, row.predicted]));
  return (rows ?? []).map(row => ({
    ...sourceRows.get(row.id), ...row,
    // GPU values must come from the restricted bandwidth model's held-out tests.
    heldOutPrice: predictions.has(row.id) ? predictions.get(row.id) : kind === 'cpu' ? row.heldOutPrice ?? null : null,
  }));
}

/** Provider/search filters and ordering never mutate the saved fitting sample. */
export function filterFitDataRows(rows = [], { provider = 'all', search = '', sort = 'price-asc' } = {}) {
  const query = String(search).trim().toLocaleLowerCase('en-US');
  const filtered = rows.filter(row => (!provider || provider === 'all' || row.provider === provider) && (!query ||
    [row.name, row.region, row.gpu, row.provider, providerNames[row.provider]].some(value => String(value ?? '').toLocaleLowerCase('en-US').includes(query))));
  const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en-US', { numeric: true });
  return filtered.sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (!Number.isFinite(a.hourlyUsd)) return Number.isFinite(b.hourlyUsd) ? 1 : byName(a, b);
    if (!Number.isFinite(b.hourlyUsd)) return -1;
    return (sort === 'price-desc' ? b.hourlyUsd - a.hourlyUsd : a.hourlyUsd - b.hourlyUsd) || byName(a, b);
  });
}

export function fitDataHead(kind = 'cpu') {
  return `<tr><th scope="col">Provider / configuration</th><th scope="col">RAM <span>GiB</span></th><th scope="col">CPU <span>Geekbench 6</span></th>${kind === 'gpu' ? '<th scope="col">Bandwidth <span>GB/s per GPU</span></th>' : ''}<th scope="col">Listed price <span>USD/hour</span></th><th scope="col">Predicted price <span>USD/hour · held out</span></th><th scope="col">Source</th></tr>`;
}

/** Table body only. The caller owns filtering, controls, and the table's accessible label. */
export function renderFitDataRows(rows = [], kind = 'cpu', { limit = 25 } = {}) {
  const visible = rows.slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : undefined);
  if (!visible.length) return `<tr><td class="fit-data-empty" colspan="${kind === 'gpu' ? 7 : 6}">No configurations match this view. Try another provider or search.</td></tr>`;
  return visible.map(row => {
    const cpuSource = firstSafeUrl((row.cpuBenchmarks ?? []).flatMap(benchmark => [benchmark.url, benchmark.browserUrl]));
    const bandwidth = row.bandwidthProvenance;
    const bandwidthSource = firstSafeUrl([
      bandwidth?.bandwidthSourceUrl, ...(bandwidth?.bandwidthSourceUrls ?? []),
      ...(bandwidth?.bandwidthProvenance?.sourceUrls ?? []),
      row.bandwidthSourceUrl, ...(row.bandwidthSourceUrls ?? []),
    ]);
    const provider = providerNames[row.provider] ?? row.provider ?? 'Provider unavailable';
    const details = [row.region, kind === 'gpu' ? `${number(row.gpuCount, 0)} × ${row.gpu ?? 'GPU model unavailable'}` : null].filter(Boolean);
    return `<tr><td class="fit-data-machine"><span class="fit-data-provider">${escapeHtml(provider)}</span><strong>${escapeHtml(row.name ?? 'Configuration unavailable')}</strong>${details.map(detail => `<span class="fit-data-meta">${escapeHtml(detail)}</span>`).join('')}</td><td class="fit-data-number">${number(row.ramGiB)}</td><td class="fit-data-number">${sourceLink(number(row.cpuScore, 0), Number.isFinite(row.cpuScore) ? cpuSource : null, 'Open the CPU Geekbench source')}</td>${kind === 'gpu' ? `<td class="fit-data-number">${sourceLink(number(row.bandwidthPerGpuGBps), Number.isFinite(row.bandwidthPerGpuGBps) ? bandwidthSource : null, 'Open the GPU memory bandwidth source')}</td>` : ''}<td class="fit-data-number">${money(row.hourlyUsd)}</td><td class="fit-data-number">${money(row.heldOutPrice)}</td><td class="fit-data-source">${safeUrl(row.priceSourceUrl) ? sourceLink('Public price ↗', row.priceSourceUrl, 'Open the provider’s public price source') : '—'}</td></tr>`;
  }).join('');
}
