import { predictPrice } from './model.js';
import { MODEL_REFERENCE, REFERENCE_MACHINE } from './reference-machine.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const num = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : '—';
const features = {
  ramGiB: { symbol: 'R', definition: 'RAM, in GiB' },
  vramGiB: { symbol: 'V', definition: 'VRAM, in GiB' },
  vcpus: { symbol: 'N', definition: 'Allocated vCPU count' },
  cpuScore: { symbol: 'C', definition: 'Geekbench 6 CPU multi-core score' },
  gpuScore: { symbol: 'G', definition: 'Geekbench GPU OpenCL score' },
  gpuFp32Tflops: { symbol: 'F', definition: 'Total dense FP32 throughput, in TFLOPS' },
  gpuCount: { symbol: 'D', definition: 'Allocated whole GPU count' },
};

export const displayedExperiment = (report, kind) => kind === 'cpu' ? report.cpu?.displayed : report[kind]?.selected;
const equationFor = fit => `${num(fit.A, 5)} × ${fit.keys.map((key, index) => `(${features[key]?.symbol ?? esc(key)}/${num(fit.reference[key])})<sup>${num(fit.slopes[index], 5)}</sup>`).join(' × ')}`;

function scatter(validation, kind) {
  const points = (validation?.predictions ?? []).filter(point => Number.isFinite(point.actual) && point.actual > 0 && Number.isFinite(point.predicted) && point.predicted > 0);
  if (!points.length) return '<p class="chart-caption">Price predictions are not yet available.</p>';
  const values = points.flatMap(point => [point.actual, point.predicted]);
  const min = Math.floor(Math.log10(Math.min(...values)));
  const max = Math.max(min + 1, Math.ceil(Math.log10(Math.max(...values))));
  const span = max - min, width = 450, height = 250, left = 56, top = 12, right = 16, bottom = 42;
  const x = value => left + (Math.log10(value) - min) / span * (width - left - right);
  const y = value => height - bottom - (Math.log10(value) - min) / span * (height - top - bottom);
  const dollars = value => `$${num(value, value < 1 ? 2 : 0)}`;
  const ticks = Array.from({ length: span + 1 }, (_, index) => 10 ** (min + index));
  const titleId = `${esc(kind)}-price-scatter-title`, descId = `${esc(kind)}-price-scatter-desc`;
  return `<svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">Listed versus predicted hourly prices</title><desc id="${descId}">Both axes are logarithmic. Each of the ${num(points.length)} dots compares a listed hourly price with a prediction made without that machine family. The dashed line shows perfect agreement.</desc>${ticks.map(value => `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height-bottom}" stroke="#e2e3db"/><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e2e3db"/><text x="${x(value)}" y="${height-bottom+17}" text-anchor="middle" font-size="10" fill="#747872">${dollars(value)}</text><text x="${left-8}" y="${y(value)+3}" text-anchor="end" font-size="10" fill="#747872">${dollars(value)}</text>`).join('')}<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${top}" stroke="#b8492c" stroke-dasharray="4 4"/>${points.map(point => `<circle cx="${x(point.actual).toFixed(2)}" cy="${y(point.predicted).toFixed(2)}" r="2.8" fill="#728269" fill-opacity=".35"><title>${esc(point.name ?? point.id)}: listed ${money(point.actual)}, predicted ${money(point.predicted)}</title></circle>`).join('')}<text x="${(left+width-right)/2}" y="${height-3}" text-anchor="middle" font-size="10" fill="#747872">Listed USD/hour · log scale</text><text transform="translate(12 ${(top+height-bottom)/2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#747872">Predicted USD/hour · log scale</text></svg>`;
}

export function renderExperiment(report, kind) {
  const model = displayedExperiment(report, kind);
  if (!model?.fit) return '<div class="empty-model"><h3>Price model unavailable</h3><p>There is not yet enough compatible data to fit this equation.</p></div>';
  const fit = model.fit, keys = fit.keys ?? model.featureKeys;
  const referencePrice = kind === 'cpu' ? predictPrice({ ...fit, logA: fit.logA ?? Math.log(fit.A) }, MODEL_REFERENCE) : null;
  const reference = kind === 'cpu' ? `<section class="reference-summary" aria-labelledby="cpu-reference-title"><div><h3 id="cpu-reference-title">${esc(REFERENCE_MACHINE.label)} · CPU reference</h3><p class="reference-amount">${money(referencePrice)} <span>USD/hour</span></p></div><div class="reference-details"><p><a href="${esc(REFERENCE_MACHINE.specificationSourceUrl)}" target="_blank" rel="noopener">${esc(REFERENCE_MACHINE.memoryLabel)}</a></p><p><a href="${esc(REFERENCE_MACHINE.cpuBenchmark.sourceUrl)}" target="_blank" rel="noopener">${num(MODEL_REFERENCE.cpuScore)} Geekbench 6 CPU score</a></p><p class="reference-note">Estimated cloud cost at this reference.</p></div></section>` : '';
  return `${reference}<div class="model-layout"><section class="model-equation" aria-labelledby="${esc(kind)}-equation-title"><h3 id="${esc(kind)}-equation-title">Price equation</h3><p class="equation-line">P = ${equationFor(fit)}</p><dl class="variable-list"><dt>P</dt><dd>Estimated full machine price, in USD/hour</dd>${keys.map(key => `<dt>${features[key]?.symbol ?? esc(key)}</dt><dd>${features[key]?.definition ?? esc(key)}</dd>`).join('')}</dl></section><figure class="model-plot"><h3>Listed vs. predicted price</h3>${scatter(model.validation, kind)}<figcaption class="chart-caption">Each dot compares a listed hourly price with a prediction made without that machine family. Dashed line: perfect agreement.</figcaption></figure></div>`;
}
