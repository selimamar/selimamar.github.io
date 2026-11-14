const positive = value => Number.isFinite(value) && value > 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const percent = value => Number.isFinite(value) ? `${number(value * 100, 1)}%` : '—';
const modelLabel = variant => variant.fit?.kind === 'additive' || variant.id === 'gpu-resource-additive' ? 'Additive GPU resources' : 'Multiplicative GPU resources';
const modelClass = variant => variant.fit?.kind === 'additive' || variant.id === 'gpu-resource-additive' ? 'gpu-log-additive' : 'gpu-log-multiplicative';

function cpuPrice(fit, row) {
  if (!fit || !positive(fit.A)) return null;
  let price = fit.A;
  for (let index = 0; index < (fit.keys ?? []).length; index++) {
    const key = fit.keys[index];
    if (!positive(row[key]) || !positive(fit.reference?.[key]) || !Number.isFinite(fit.slopes?.[index])) return null;
    price *= (row[key] / fit.reference[key]) ** fit.slopes[index];
  }
  return positive(price) ? price : null;
}

/** The plotted curves are per GPU at F=30 TFLOPS and V=40 GiB. */
export function gpuContributionAtBandwidth(fit, bandwidth) {
  if (!fit || !positive(bandwidth)) return null;
  const reference = fit.reference ?? {};
  const values = [30, bandwidth, 40];
  const keys = ['fp32PerGpuTflops', 'bandwidthPerGpuGBps', 'vramPerGpuGiB'];
  if (keys.some(key => !positive(reference[key]))) return null;
  const ratios = values.map((value, index) => value / reference[keys[index]]);
  const result = fit.kind === 'additive'
    ? ratios.reduce((total, ratio, index) => total + ratio * fit.coefficients?.[index], 0)
    : fit.A * ratios.reduce((total, ratio, index) => total * ratio ** fit.slopes?.[index], 1);
  return positive(result) ? result : null;
}

/** Bounds and projection reject nonpositive numbers before any logarithm. */
export function positiveLogDomain(values) {
  const finite = values.filter(positive);
  if (!finite.length) return null;
  const min = Math.min(...finite), max = Math.max(...finite);
  const low = Math.log10(min), high = Math.log10(max);
  const padding = Math.max(0.04, (high - low) * 0.045);
  const lower = 10 ** (low - padding), upper = 10 ** (high + padding);
  return [positive(lower) ? lower : min, positive(upper) ? upper : max];
}

export function logPosition(value, domain) {
  if (!positive(value) || !domain || !positive(domain[0]) || !positive(domain[1]) || !(domain[1] > domain[0])) return null;
  return (Math.log10(value) - Math.log10(domain[0])) / (Math.log10(domain[1]) - Math.log10(domain[0]));
}

/** Prepare independent plotting samples; log-panel exclusions never alter fits. */
export function prepareGpuResourceCharts(report) {
  const variants = (report?.variants ?? []).filter(variant => variant.fit);
  const firstCpu = variants[0]?.fit.cpuFit;
  const signature = fit => JSON.stringify([fit?.A, fit?.keys, fit?.reference, fit?.slopes]);
  const commonCpu = firstCpu && variants.every(variant => signature(variant.fit.cpuFit) === signature(firstCpu));
  const residual = { points: [], curves: [], excludedNonpositive: 0, excludedInvalid: 0, inputCount: report?.rows?.length ?? 0, commonCpu: Boolean(commonCpu), conditional: false, bandwidthExponents: [], xDomain: null, yDomain: null };
  if (commonCpu) {
    for (const row of report.rows ?? []) {
      const baseline = cpuPrice(firstCpu, row);
      if (!positive(baseline) || !Number.isInteger(row.gpuCount) || row.gpuCount < 1 || !positive(row.hourlyUsd) || !positive(row.bandwidthPerGpuGBps)) { residual.excludedInvalid++; continue; }
      const inferred = (row.hourlyUsd - baseline) / row.gpuCount;
      if (!positive(inferred)) { residual.excludedNonpositive++; continue; }
      residual.points.push({ id: row.id, name: row.name, provider: row.provider, bandwidth: row.bandwidthPerGpuGBps, inferred, actual: row.hourlyUsd, cpuBaseline: baseline, gpuCount: row.gpuCount });
    }
    residual.xDomain = positiveLogDomain(residual.points.map(point => point.bandwidth));
    if (residual.xDomain) {
      const minBandwidth = Math.min(...residual.points.map(point => point.bandwidth));
      const maxBandwidth = Math.max(...residual.points.map(point => point.bandwidth));
      for (const variant of variants) {
        const points = Array.from({ length: 100 }, (_, index) => {
          const bandwidth = minBandwidth * (maxBandwidth / minBandwidth) ** (index / 99);
          return { bandwidth, contribution: gpuContributionAtBandwidth(variant.fit, bandwidth) };
        }).filter(point => positive(point.contribution));
        residual.curves.push({ id: variant.id, label: modelLabel(variant), className: modelClass(variant), points });
        const weights = variant.fit.kind === 'additive' ? variant.fit.coefficients : variant.fit.slopes;
        residual.conditional ||= weights?.[0] !== 0 || weights?.[2] !== 0;
        residual.bandwidthExponents.push(variant.fit.kind === 'additive' ? 1 : weights?.[1]);
      }
      residual.yDomain = positiveLogDomain([...residual.points.map(point => point.inferred), ...residual.curves.flatMap(curve => curve.points.map(point => point.contribution))]);
    }
  }
  const panels = variants.map(variant => {
    const original = variant.validation?.predictions ?? [];
    const points = original.filter(point => positive(point.actual) && positive(point.predicted));
    return { id: variant.id, label: modelLabel(variant), className: modelClass(variant), points, totalCount: variant.sampleCount ?? 0,
      excludedInvalid: original.length - points.length, mape: variant.validation?.mape, logR2: variant.validation?.logR2 };
  });
  const validationDomain = positiveLogDomain(panels.flatMap(panel => panel.points.flatMap(point => [point.actual, point.predicted])));
  return { residual, panels, validationDomain };
}

function ticks(domain) {
  if (!domain) return [];
  const values = [];
  for (let power = Math.floor(Math.log10(domain[0])); power <= Math.ceil(Math.log10(domain[1])); power++) {
    for (const multiple of [1, 2, 5]) {
      const value = multiple * 10 ** power;
      if (value >= domain[0] && value <= domain[1]) values.push(value);
    }
  }
  if (values.length <= 7) return values;
  return values.filter(value => Math.abs(Math.log10(value) - Math.round(Math.log10(value))) < 1e-8);
}

const tickLabel = value => value >= 1000 ? `${number(value / 1000, 1)}k` : value < 0.01 ? value.toPrecision(1) : number(value, value < 1 ? 3 : 1);
function frame(width, height, xDomain, yDomain, xLabel, yLabel, moneyX = false) {
  const margin = width > 500 ? { left: 68, right: 20, top: 16, bottom: 53 } : { left: 68, right: 25, top: 15, bottom: 43 };
  const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
  const x = value => margin.left + logPosition(value, xDomain) * plotWidth;
  const y = value => margin.top + plotHeight - logPosition(value, yDomain) * plotHeight;
  const grid = `${ticks(xDomain).map(value => `<line class="gpu-log-grid" x1="${x(value)}" x2="${x(value)}" y1="${margin.top}" y2="${height-margin.bottom}"/><text class="gpu-log-tick" x="${x(value)}" y="${height-margin.bottom+18}" text-anchor="middle">${moneyX ? '$' : ''}${tickLabel(value)}</text>`).join('')}${ticks(yDomain).map(value => `<line class="gpu-log-grid" x1="${margin.left}" x2="${width-margin.right}" y1="${y(value)}" y2="${y(value)}"/><text class="gpu-log-tick" x="${margin.left-9}" y="${y(value)+4}" text-anchor="end">$${tickLabel(value)}</text>`).join('')}<text class="gpu-log-axis-title" x="${margin.left+plotWidth/2}" y="${height-5}" text-anchor="middle">${esc(xLabel)}</text><text class="gpu-log-axis-title" transform="translate(15 ${margin.top+plotHeight/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  return { x, y, grid };
}

function residualPlot(residual) {
  if (!residual.commonCpu) return '<p class="small-copy">A shared residual plot requires identical fitted CPU baselines for both equations.</p>';
  if (!residual.points.length || !residual.xDomain || !residual.yDomain) return '<p class="small-copy">There are no positive inferred GPU prices to place on logarithmic axes. Model fits and validation retain their original samples.</p>';
  const width = 640, height = 330, { x, y, grid } = frame(width, height, residual.xDomain, residual.yDomain, 'GPU memory bandwidth (GB/s per GPU)', 'Inferred GPU USD/hour');
  const curves = residual.curves.map(curve => `<path class="gpu-log-curve ${curve.className}" d="${curve.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.bandwidth).toFixed(2)},${y(point.contribution).toFixed(2)}`).join(' ')}"><title>${esc(curve.label)}: full-cohort fit, per GPU at F=30 TFLOPS and V=40 GiB</title></path>`).join('');
  const points = residual.points.map(point => `<circle class="gpu-log-data" cx="${x(point.bandwidth).toFixed(2)}" cy="${y(point.inferred).toFixed(2)}" r="3.4"><title>${esc(point.id)}: bandwidth ${number(point.bandwidth)} GB/s; inferred GPU price $${number(point.inferred, 4)}/GPU/hour = ($${number(point.actual, 4)} whole VM − $${number(point.cpuBaseline, 4)} estimated CPU baseline) / ${point.gpuCount} GPU(s)</title></circle>`).join('');
  return `<figure class="gpu-log-figure gpu-log-wide"><figcaption><h4>The fitted GPU contributions</h4><p>Full-cohort GPU fits · both axes logarithmic</p></figcaption><div class="gpu-log-legend"><span><i class="gpu-log-dot"></i>Inferred per-GPU price</span><span><i class="gpu-log-line gpu-log-additive"></i>Additive fit</span><span><i class="gpu-log-line gpu-log-multiplicative"></i>Multiplicative fit</span></div><svg class="gpu-log-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="gpu-residual-title gpu-residual-desc"><title id="gpu-residual-title">Inferred per-GPU hourly price versus GPU memory bandwidth, on logarithmic axes</title><desc id="gpu-residual-desc">${residual.points.length} positive residual points and both full-cohort fitted GPU curves. These residuals subtract an estimated CPU baseline from public whole-machine prices; they are not separately observed provider GPU charges.</desc>${grid}${points}${curves}</svg><p class="gpu-log-caption">Points show (actual VM price − fitted CPU baseline) / GPU count. ${number(residual.points.length, 0)} of ${number(residual.inputCount, 0)} points are shown. ${number(residual.excludedNonpositive, 0)} zero or negative residual${residual.excludedNonpositive === 1 ? ' is' : 's are'} excluded <strong>only from this log panel</strong>; ${residual.excludedNonpositive === 1 ? 'it remains' : 'they remain'} in fitting and held-out validation.${residual.excludedInvalid ? ` ${residual.excludedInvalid} further points lack valid plotting inputs.` : ''}</p><p class="gpu-log-caption">${residual.conditional ? 'The lines are conditional curves at 30 FP32 TFLOPS and 40 GiB VRAM per GPU; individual plotted machines can have different values.' : `Both current fits give FP32 and VRAM zero weight, so the curves depend only on bandwidth, with log-log slopes ${residual.bandwidthExponents.map(value => number(value, 3)).join(' and ')}.`} The curves stop at the observed bandwidth range. Fitting minimizes log <strong>whole-VM</strong> price errors, not log residual errors. These residuals are estimates, not provider component charges.</p></figure>`;
}

function validationPlot(panel, domain) {
  if (!domain || !panel.points.length) return `<figure class="gpu-log-figure"><figcaption><h4>${esc(panel.label)}</h4></figcaption><p class="small-copy">No positive held-out predictions are available for this chart.</p></figure>`;
  const width = 460, height = 425, { x, y, grid } = frame(width, height, domain, domain, 'Actual whole-VM USD/hour', 'Held-out predicted USD/hour', true);
  const titleId = `${panel.id}-log-title`;
  return `<figure class="gpu-log-figure"><figcaption><h4>${esc(panel.label)}</h4><p><strong>${percent(panel.mape)}</strong> mean held-out price error · log R² ${number(panel.logR2, 3)}</p></figcaption><svg class="gpu-log-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${esc(titleId)}"><title id="${esc(titleId)}">${esc(panel.label)}: actual versus family-held-out predicted whole-machine prices. Logarithmic axes are shared with the other model.</title>${grid}<line class="gpu-log-ideal" x1="${x(domain[0])}" y1="${y(domain[0])}" x2="${x(domain[1])}" y2="${y(domain[1])}"><title>Perfect prediction</title></line>${panel.points.map(point => `<circle class="gpu-log-prediction ${panel.className}" cx="${x(point.actual).toFixed(2)}" cy="${y(point.predicted).toFixed(2)}" r="3.7"><title>${esc(point.id ?? point.name)}: actual $${number(point.actual, 4)}/hour; family-held-out prediction $${number(point.predicted, 4)}/hour</title></circle>`).join('')}</svg><p class="gpu-log-caption">${number(panel.points.length, 0)} / ${number(panel.totalCount, 0)} configurations. Dashed line = perfect prediction.${panel.excludedInvalid ? ` ${panel.excludedInvalid} nonpositive or invalid predictions cannot appear on log axes.` : ''}</p></figure>`;
}

export function renderGpuResourceCharts(report) {
  const data = prepareGpuResourceCharts(report);
  if (!data.panels.length) return '';
  return `<section class="gpu-log-plots" id="gpu-log-plots" aria-labelledby="gpu-log-heading"><h3 id="gpu-log-heading">The two models, plotted against the data.</h3>${residualPlot(data.residual)}<div class="gpu-log-validation-intro"><h4>How they predict families they have not seen</h4><p>Each point below uses a separately refitted model that excludes its entire machine family. Both plots use identical logarithmic axes and include the full whole-machine price, including the CPU host.</p></div><div class="gpu-log-pair">${data.panels.map(panel => validationPlot(panel, data.validationDomain)).join('')}</div></section>`;
}
