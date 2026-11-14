import { residualDiagnostics, residualHistogram, gaussianDensity } from './residuals.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const fixed = value => Number.isFinite(value) ? value.toFixed(4) : '—';
const money = value => `$${number(value, value < 1 ? 3 : 2)}`;
const percent = value => `${number(value * 100, 1)}%`;
const niceStep = rough => {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rough) * magnitude;
};

function residualRange(stats, includeGaussian = false) {
  let extent = Math.max(0.25, ...stats.rows.map(row => Math.abs(row.residual)));
  if (includeGaussian && stats.gaussian) extent = Math.max(extent,
    Math.abs(stats.mean - 3.5 * stats.sigma), Math.abs(stats.mean + 3.5 * stats.sigma));
  const step = niceStep(extent / 3);
  const bound = Math.ceil(extent * 1.03 / step) * step;
  return { min: -bound, max: bound, step };
}

function scatter(stats, kind) {
  const width = 480, height = 278, left = 55, right = 17, top = 17, bottom = 45;
  const range = residualRange(stats);
  const predictions = stats.rows.map(row => Math.log10(row.predicted));
  const min = Math.floor(Math.min(...predictions)), max = Math.max(min + 1, Math.ceil(Math.max(...predictions)));
  const x = price => left + (Math.log10(price) - min) / (max - min) * (width - left - right);
  const y = residual => height - bottom - (residual - range.min) / (range.max - range.min) * (height - top - bottom);
  const title = `${kind}-residual-scatter-title`, desc = `${kind}-residual-scatter-desc`;
  let grid = '';
  for (let i = 0; i <= Math.round((range.max - range.min) / range.step); i++) {
    const value = range.min + i * range.step;
    grid += `<line class="residual-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text class="residual-tick" x="${left-9}" y="${y(value)+4}" text-anchor="end">${number(value)}</text>`;
  }
  for (let exponent = min; exponent <= max; exponent++) {
    const value = 10 ** exponent;
    grid += `<text class="residual-tick" x="${x(value)}" y="${height-bottom+20}" text-anchor="middle">${money(value)}</text>`;
  }
  const points = stats.rows.map(row => `<circle class="residual-dot" cx="${x(row.predicted).toFixed(2)}" cy="${y(row.residual).toFixed(2)}" r="2.8"><title>${esc(row.name ?? row.id)}: listed ${money(row.actual)}, predicted ${money(row.predicted)}, log residual ${fixed(row.residual)}</title></circle>`).join('');
  return `<svg class="residual-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${title} ${desc}"><title id="${title}">Log-price residuals versus held-out predicted price</title><desc id="${desc}">${number(stats.sampleCount, 0)} configurations. A residual is the natural log of listed price divided by held-out predicted price. Zero means exact agreement; positive means the model underpredicted. The horizontal price axis is logarithmic.</desc>${grid}<line class="residual-zero" x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}"/>${points}<text class="residual-axis" x="${(left+width-right)/2}" y="${height-3}" text-anchor="middle">Predicted USD/hour · log scale</text><text class="residual-axis" transform="translate(13 ${(top+height-bottom)/2}) rotate(-90)" text-anchor="middle">Log-price residual</text></svg>`;
}

function histogram(stats, kind) {
  const width = 480, height = 278, left = 48, right = 17, top = 17, bottom = 45;
  const range = residualRange(stats, true);
  const bins = residualHistogram(stats.rows, { ...range, binCount: Math.min(36, Math.max(12, Math.round(Math.sqrt(stats.sampleCount)))) });
  const curve = stats.gaussian ? Array.from({ length: 201 }, (_, index) => {
    const value = range.min + index / 200 * (range.max - range.min);
    return { value, density: gaussianDensity(value, stats.gaussian) };
  }) : [];
  const maximum = Math.max(...bins.map(bin => bin.density), ...curve.map(point => point.density), 0.1);
  const step = niceStep(maximum / 3), ceiling = Math.ceil(maximum * 1.08 / step) * step;
  const x = value => left + (value - range.min) / (range.max - range.min) * (width - left - right);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  const title = `${kind}-residual-histogram-title`, desc = `${kind}-residual-histogram-desc`;
  let grid = '';
  for (let index = 0; index <= Math.round(ceiling / step); index++) {
    const value = index * step;
    grid += `<line class="residual-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text class="residual-tick" x="${left-8}" y="${y(value)+4}" text-anchor="end">${number(value)}</text>`;
  }
  for (let index = 0; index <= Math.round((range.max - range.min) / range.step); index++) {
    const value = range.min + index * range.step;
    grid += `<text class="residual-tick" x="${x(value)}" y="${height-bottom+20}" text-anchor="middle">${number(value)}</text>`;
  }
  const bars = bins.map(bin => `<rect class="residual-bin" x="${x(bin.low)+1}" y="${y(bin.density)}" width="${Math.max(0, x(bin.high)-x(bin.low)-2)}" height="${height-bottom-y(bin.density)}"><title>${number(bin.low, 3)} to ${number(bin.high, 3)}: ${bin.count} configurations</title></rect>`).join('');
  const path = curve.length ? `<path class="residual-gaussian" d="${curve.map((point, index) => `${index ? 'L' : 'M'}${x(point.value).toFixed(2)},${y(point.density).toFixed(2)}`).join(' ')}"/>` : '';
  return `<svg class="residual-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${title} ${desc}"><title id="${title}">Residual distribution with a fitted Gaussian density</title><desc id="${desc}">Bars show the normalized density of every valid held-out log-price residual. ${stats.gaussian ? `The orange line is a Gaussian fitted by maximum likelihood, with mean ${fixed(stats.mean)} and standard deviation ${fixed(stats.sigma)}.` : 'The sample has insufficient variation to fit a Gaussian.'} The curve is descriptive and does not certify the price model.</desc>${grid}${bars}<line class="residual-zero" x1="${x(0)}" y1="${top}" x2="${x(0)}" y2="${height-bottom}"/>${path}<text class="residual-axis" x="${(left+width-right)/2}" y="${height-3}" text-anchor="middle">Log-price residual</text><text class="residual-axis" transform="translate(12 ${(top+height-bottom)/2}) rotate(-90)" text-anchor="middle">Density</text></svg>`;
}

export function renderResidualDiagnostics(validation, kind) {
  const stats = residualDiagnostics(validation);
  if (!stats.sampleCount) return '';
  const shape = stats.gaussian
    ? `μ = ${fixed(stats.mean)} · σ = ${fixed(stats.sigma)}`
    : 'Not enough variation for a Gaussian fit.';
  return `<section id="residuals" class="residual-section" aria-labelledby="${kind}-residual-heading"><div class="residual-heading"><h3 id="${kind}-residual-heading">Residual check</h3><span>${number(stats.sampleCount, 0)} configurations · held-out predictions</span></div><p class="residual-intro">Residual = ln(listed price / predicted price). Zero is exact; positive means the prediction is too low.</p><div class="residual-panels"><figure><h4>Errors across price levels</h4>${scatter(stats, kind)}</figure><figure><h4>Residual distribution &amp; Gaussian fit</h4>${histogram(stats, kind)}<figcaption class="residual-legend"><span class="residual-bar-key">Observed errors</span><span class="residual-line-key">Fitted Gaussian</span></figcaption></figure></div><div class="residual-stats"><p><span>Gaussian mean &amp; spread</span><strong>${shape}</strong></p><p><span>Mean absolute prediction error</span><strong>${percent(stats.mape)}</strong></p></div><div class="residual-links"><a id="download-residuals" href="./data/residual-diagnostics.json" download>Residual data ↓</a></div></section>`;
}
