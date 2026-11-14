const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const positive = value => Number.isFinite(value) && value > 0;
const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = value => new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Keep real dates and gaps; no annual values are interpolated into the data. */
export function historyPlotPoints(history, kind) {
  if (!['cpu', 'gpu'].includes(kind)) return [];
  const dated = (history?.points ?? []).filter(point => Number.isFinite(Date.parse(point.date)))
    .map(point => ({ ...point, timestamp: Date.parse(point.date), value: positive(point[kind]?.hourlyUsd) ? point[kind].hourlyUsd : null }))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!dated.length) return [];
  const cutoff = new Date(dated.at(-1).timestamp);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 10);
  return dated.filter(point => point.timestamp >= cutoff.getTime());
}

function chartSvg(points, kind, first, last, layout) {
  const available = points.filter(point => positive(point.value));
  const mobile = layout === 'mobile';
  const width = mobile ? 460 : 980, height = mobile ? 260 : 280;
  const left = mobile ? 61 : 68, right = mobile ? 21 : 23, top = 21, bottom = 42;
  const maximum = Math.max(...available.map(point => point.value));
  const roughStep = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= roughStep) * magnitude;
  const ceiling = Math.ceil(maximum * 1.08 / step) * step;
  const x = timestamp => left + (timestamp - first.getTime()) / (last.getTime() - first.getTime()) * (width - left - right);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  const priceTicks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step);
  const yearTicks = [{ timestamp: first.getTime(), label: first.getUTCFullYear() }];
  for (let year = first.getUTCFullYear() + 2; year < last.getUTCFullYear(); year += 2) yearTicks.push({ timestamp: Date.UTC(year, 0, 1), label: year });
  yearTicks.push({ timestamp: last.getTime(), label: last.getUTCFullYear() });
  const segments = [];
  let segment = [];
  for (const point of points) {
    if (positive(point.value)) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  const titleId = `${kind}-history-${layout}-title`, descId = `${kind}-history-${layout}-desc`;
  const plotted = available.map(point => {
    const fit = point[kind];
    const label = `${dateLabel(point.date)}: ${money(point.value)} per hour; ${fit.sampleCount ?? 0} ${kind.toUpperCase()} configurations, ${fit.familyCount ?? 0} machine families. AWS-only retrospective fit.`;
    const px = x(point.timestamp), py = y(point.value), tooltipWidth = 208, tooltipHeight = 71;
    const tx = Math.max(left, Math.min(width - right - tooltipWidth, px - tooltipWidth / 2));
    const ty = py - tooltipHeight - 13 >= top ? py - tooltipHeight - 13 : Math.min(height - bottom - tooltipHeight, py + 13);
    return `<g class="history-mark" tabindex="0" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle class="history-point" cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${mobile ? 4.5 : 4}"/><g class="history-tooltip" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)})" aria-hidden="true"><rect width="${tooltipWidth}" height="${tooltipHeight}" rx="3"/><text class="history-tooltip-date" x="12" y="19">${esc(dateLabel(point.date))}</text><text class="history-tooltip-price" x="12" y="39">${money(point.value)} / hour</text><text class="history-tooltip-detail" x="12" y="58">${fit.sampleCount ?? 0} configurations · ${fit.familyCount ?? 0} families</text></g></g>`;
  }).join('');
  return `<svg class="history-chart history-chart--${layout}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">Historical estimate of the reference ${kind.toUpperCase()} machine price</title><desc id="${descId}">AWS US East N. Virginia on-demand prices, reconstructed from dated archives using later benchmark measurements. ${available.length} dated estimates. The y axis is nominal USD per hour. Line segments connect estimates; intervening dates are not observations. This is separate from the current multi-provider reference price.</desc>${priceTicks.map(value => `<line class="history-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text class="history-tick" x="${left-10}" y="${y(value)+4}" text-anchor="end">$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</text>`).join('')}${yearTicks.map(tick => `<text class="history-tick" x="${x(tick.timestamp)}" y="${height-bottom+24}" text-anchor="${tick.timestamp === last.getTime() ? 'end' : 'middle'}">${tick.label}</text>`).join('')}${segments.filter(group => group.length > 1).map(group => `<path class="history-line" d="${group.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ')}"/>`).join('')}<text class="history-axis" transform="translate(14 ${(top+height-bottom)/2}) rotate(-90)" text-anchor="middle">USD / hour</text>${plotted}</svg>`;
}

export function renderReferenceHistory(history, kind) {
  const points = historyPlotPoints(history, kind), available = points.filter(point => positive(point.value));
  if (!available.length) return '<section id="reference-history" class="history-section"><h3>Reference price over time</h3><p class="history-note">Historical estimates are not available for this snapshot.</p></section>';
  const last = new Date(points.at(-1).timestamp), first = new Date(last);
  first.setUTCFullYear(first.getUTCFullYear() - 10);
  return `<section id="reference-history" class="history-section" aria-labelledby="${kind}-history-heading"><div class="history-heading"><h3 id="${kind}-history-heading">Reference price over time</h3><span>${first.getUTCFullYear()}–${last.getUTCFullYear()} · AWS reconstruction</span></div><p class="history-reference">${kind === 'cpu' ? '16 GiB RAM · 20,000 Geekbench CPU score' : '1 GPU at 300 GB/s · 16 GiB RAM · 20,000 Geekbench CPU score'}</p>${chartSvg(points, kind, first, last, 'desktop')}${chartSvg(points, kind, first, last, 'mobile')}<p class="history-note">Archived AWS prices fitted with later Geekbench measurements. This AWS-only reconstruction is separate from the multi-provider price above. Early samples are small and the reference requires extrapolation; lines connect dated estimates.</p><div class="history-links"><a id="download-history" href="./data/reference-history.json" download>History data ↓</a><a href="./output/pdf/compute-price-methodology.pdf" target="_blank" rel="noopener">Methodology PDF ↗</a></div></section>`;
}
