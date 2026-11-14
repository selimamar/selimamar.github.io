import { predictPrice } from './model.js';
import { MODEL_REFERENCE, REFERENCE_MACHINE } from './reference-machine.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = (value, digits = 3) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : '—';
const count = value => number(value, 0);
const positive = value => Number.isFinite(value) && value > 0;

/** Select the genuinely one-input fit, whose validation refits only bandwidth. */
export const displayedGpuResourceModel = report => report?.singleResourceComparison?.variants?.find(variant => variant.id === 'gpu-bandwidth-linear');

/** Configuration-weighted Pearson correlations of per-device specs, not totals. */
export function gpuMemoryCorrelation(rows = []) {
  const pairs = rows.filter(row => positive(row.bandwidthPerGpuGBps) && positive(row.vramPerGpuGiB))
    .map(row => [row.bandwidthPerGpuGBps, row.vramPerGpuGiB]);
  const pearson = values => {
    if (values.length < 2) return null;
    const means = [0, 1].map(index => values.reduce((sum, pair) => sum + pair[index], 0) / values.length);
    let covariance = 0, varianceX = 0, varianceY = 0;
    for (const [x, y] of values) {
      const dx = x - means[0], dy = y - means[1];
      covariance += dx * dy; varianceX += dx * dx; varianceY += dy * dy;
    }
    if (!(varianceX > 0 && varianceY > 0)) return null;
    return Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
  };
  return { count: pairs.length, raw: pearson(pairs), log: pearson(pairs.map(pair => pair.map(Math.log))) };
}

function cpuEquation(fit) {
  const symbols = { ramGiB: 'R', cpuScore: 'C' };
  return `${number(fit.A, 5)}${(fit.keys ?? []).map((key, index) => ` × (${symbols[key] ?? esc(key)}/${count(fit.reference?.[key])})<sup>${number(fit.slopes?.[index], 5)}</sup>`).join('')}`;
}

function scatter(validation) {
  const points = (validation?.predictions ?? []).filter(point => positive(point.actual) && positive(point.predicted));
  if (!points.length) return '<p class="chart-caption">Price predictions are not yet available.</p>';
  const values = points.flatMap(point => [point.actual, point.predicted]);
  const min = Math.floor(Math.log10(Math.min(...values)));
  const max = Math.max(min + 1, Math.ceil(Math.log10(Math.max(...values))));
  const span = max - min, width = 450, height = 250, left = 56, top = 12, right = 16, bottom = 42;
  const x = value => left + (Math.log10(value) - min) / span * (width - left - right);
  const y = value => height - bottom - (Math.log10(value) - min) / span * (height - top - bottom);
  const dollars = value => `$${number(value, value < 1 ? 2 : 0)}`;
  const ticks = Array.from({ length: span + 1 }, (_, index) => 10 ** (min + index));
  return `<svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="gpu-bandwidth-scatter-title gpu-bandwidth-scatter-desc"><title id="gpu-bandwidth-scatter-title">Listed versus predicted hourly prices</title><desc id="gpu-bandwidth-scatter-desc">Both axes are logarithmic. Each of the ${count(points.length)} dots compares a listed hourly price with a prediction made without that machine family. The CPU baseline and GPU bandwidth coefficient are refitted for each withheld family. The dashed line shows perfect agreement.</desc>${ticks.map(value => `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height-bottom}" stroke="#e2e3db"/><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e2e3db"/><text x="${x(value)}" y="${height-bottom+17}" text-anchor="middle" font-size="10" fill="#747872">${dollars(value)}</text><text x="${left-8}" y="${y(value)+3}" text-anchor="end" font-size="10" fill="#747872">${dollars(value)}</text>`).join('')}<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${top}" stroke="#b8492c" stroke-dasharray="4 4"/>${points.map(point => `<circle cx="${x(point.actual).toFixed(2)}" cy="${y(point.predicted).toFixed(2)}" r="2.8" fill="#728269" fill-opacity=".5"><title>${esc(point.name ?? point.id)}: listed ${money(point.actual)}, predicted ${money(point.predicted)}</title></circle>`).join('')}<text x="${(left+width-right)/2}" y="${height-3}" text-anchor="middle" font-size="10" fill="#747872">Listed USD/hour · log scale</text><text transform="translate(12 ${(top+height-bottom)/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#747872">Predicted USD/hour · log scale</text></svg>`;
}

/** Display the selected price equation and its family-held-out predictions. */
export function renderGpuBandwidthModel(report) {
  const model = displayedGpuResourceModel(report);
  if (!model?.fit?.cpuFit) return '<div class="empty-model"><h3>Price model unavailable</h3><p>There is not yet enough compatible data to fit this equation.</p></div>';
  const fit = model.fit, bandwidthIndex = fit.resourceKeys?.indexOf('bandwidthPerGpuGBps') ?? 0;
  const coefficient = fit.rawCoefficients?.[bandwidthIndex];
  const hostPrice = predictPrice({ ...fit.cpuFit, logA: fit.cpuFit.logA ?? Math.log(fit.cpuFit.A) }, MODEL_REFERENCE);
  const gpuPrice = Number.isFinite(coefficient) ? coefficient * MODEL_REFERENCE.gpuCount * MODEL_REFERENCE.bandwidthPerGpuGBps : null;
  const referencePrice = Number.isFinite(hostPrice) && Number.isFinite(gpuPrice) ? hostPrice + gpuPrice : null;
  const bandwidths = (report.rows ?? []).map(row => row.bandwidthPerGpuGBps).filter(positive);
  const extrapolates = bandwidths.length > 0 && (MODEL_REFERENCE.bandwidthPerGpuGBps < Math.min(...bandwidths)
    || MODEL_REFERENCE.bandwidthPerGpuGBps > Math.max(...bandwidths));
  const referenceNote = extrapolates ? 'Estimated cloud cost · bandwidth extrapolated.' : 'Estimated cloud cost for this reference basket.';
  const reference = `<section class="reference-summary" aria-labelledby="gpu-reference-title"><div><h3 id="gpu-reference-title">${esc(REFERENCE_MACHINE.gpuReferenceLabel)}</h3><p class="reference-amount">${money(referencePrice)} <span>USD/hour</span></p></div><div class="reference-details"><p><a href="${esc(REFERENCE_MACHINE.gpuSpecificationSourceUrl)}" target="_blank" rel="noopener">1 H100 SXM · ${count(MODEL_REFERENCE.bandwidthPerGpuGBps)} GB/s bandwidth</a></p><p>${esc(REFERENCE_MACHINE.memoryLabel)} · host RAM</p><p><a href="${esc(REFERENCE_MACHINE.cpuBenchmark.sourceUrl)}" target="_blank" rel="noopener">${count(MODEL_REFERENCE.cpuScore)} Geekbench 6 CPU score</a></p><p>${money(gpuPrice)} GPU contribution + ${money(hostPrice)} CPU/RAM host</p><p class="reference-note">${referenceNote}</p></div></section>`;
  return `${reference}<div id="gpu-bandwidth-model" class="model-layout"><section class="model-equation" aria-labelledby="gpu-equation-title"><h3 id="gpu-equation-title">Price equation</h3><p class="equation-line">P = H + ${number(coefficient, 7)} × n × B</p><p class="equation-line equation-baseline">H = ${cpuEquation(fit.cpuFit)}</p><dl class="variable-list"><dt>P</dt><dd>Estimated full machine price, in USD/hour</dd><dt>H</dt><dd>Estimated CPU and RAM contribution, in USD/hour</dd><dt>n</dt><dd>Number of GPUs</dd><dt>B</dt><dd>Memory bandwidth per GPU, in GB/s</dd><dt>R</dt><dd>Host RAM, in GiB</dd><dt>C</dt><dd>Geekbench 6 CPU multi-core score</dd></dl></section><figure id="gpu-bandwidth-fit" class="model-plot"><h3>Listed vs. predicted price</h3>${scatter(model.validation)}<figcaption class="chart-caption">Each dot compares a listed hourly price with a prediction made without that machine family. Dashed line: perfect agreement.</figcaption></figure></div>`;
}

// Compatibility for clients that imported the previous comparison renderer.
export const renderGpuResourceExperiments = renderGpuBandwidthModel;
