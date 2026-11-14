const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const num = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const fixed = value => Number.isFinite(value) ? Math.abs(value) >= 1e6 ? value.toExponential(2) : value.toFixed(3) : '—';
const pct = value => Number.isFinite(value) ? `${Math.abs(value) >= 1000 ? (value * 100).toExponential(2) : (value * 100).toFixed(1)}%` : '—';
const money = value => Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : '—';
const features = {
  ramGiB: { symbol: 'R', label: 'RAM', unit: 'GiB RAM', definition: 'RAM in GiB' },
  vramGiB: { symbol: 'V', label: 'VRAM', unit: 'GiB VRAM', definition: 'VRAM in GiB' },
  vcpus: { symbol: 'N', label: 'vCPU capacity', unit: 'vCPUs', definition: 'allocated vCPU count' },
  cpuScore: { symbol: 'C', label: 'CPU Geekbench', unit: 'CPU Geekbench points', definition: 'Geekbench 6 CPU multi-core score' },
  gpuScore: { symbol: 'G', label: 'GPU Geekbench', unit: 'GPU Geekbench points', definition: 'Geekbench 7 GPU OpenCL model score' },
  gpuFp32Tflops: { symbol: 'F', label: 'FP32 throughput', unit: 'FP32 TFLOPS', definition: 'total dense FP32 TFLOPS' },
  gpuCount: { symbol: 'D', label: 'GPU count', unit: 'GPUs', definition: 'allocated whole GPU count' },
};

export const displayedExperiment = (report, kind) => kind === 'cpu' ? report.cpu?.displayed : report[kind]?.selected;
const equationFor = fit => `${fixed(fit.A)} × ${fit.keys.map((key, index) => `(${features[key]?.symbol ?? esc(key)}/${num(fit.reference[key])})<sup>${fixed(fit.slopes[index])}</sup>`).join(' × ')}`;

function savedCapacityModel(section) {
  const model = section.selected;
  if (!model?.fit) return '';
  return `<details class="experiment-details"><summary>Saved alternative: ${esc(model.label)}</summary><p class="small-copy">This broader model is retained for rental-price comparison. vCPU count is an allocation, not standardized CPU performance. The main CPU equation uses measured Geekbench performance by design.</p><p class="equation">P = ${equationFor(model.fit)}</p><p class="small-copy">R = RAM in GiB; N = allocated vCPU count; P = USD/hour. ${num(model.sampleCount)} configurations · ${num(model.familyCount)} families. Mean held-out error: <strong>${pct(model.validation?.mape)}</strong>; log R²: <strong>${fixed(model.validation?.logR2)}</strong>. These errors include feature selection within training folds. Its coefficients, predictions and diagnostics remain in the model download.</p></details>`;
}

function variantTable(variants, { selectedId, paired = false, sampleCount } = {}) {
  return `<div class="table-scroll"><table class="comparison-table experiment-table"><thead><tr><th>Variables</th><th class="numeric">Configurations</th><th class="numeric">Families</th><th class="numeric">Mean error</th><th class="numeric">Log R²</th></tr></thead><tbody>${variants.map(model => {
    const validation = paired ? model.commonValidation : model.validation;
    const selected = model.id === selectedId;
    const tested = validation?.testedCount ?? 0;
    return `<tr${selected ? ' class="chosen-variant"' : ''}><td>${esc(model.label)}${selected ? '<span class="cell-subtitle">Displayed equation</span>' : ''}${!model.fit ? '<span class="cell-note">Insufficient independent data</span>' : validation?.mape > 1000 ? '<span class="cell-note">Unstable held-out predictions</span>' : ''}</td><td class="numeric">${num(paired ? sampleCount ?? model.sampleCount : model.sampleCount)}<span class="cell-subtitle">${num(tested)} tested</span></td><td class="numeric">${num(model.familyCount)}</td><td class="numeric">${pct(validation?.mape)}</td><td class="numeric">${fixed(validation?.logR2)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function scatter(validation) {
  const available = (validation?.predictions ?? []).filter(point => point.actual > 0 && point.predicted > 0);
  if (!available.length) return '';
  const points = available.filter((_, index) => index % Math.max(1, Math.ceil(available.length / 350)) === 0);
  const values = available.flatMap(point => [point.actual, point.predicted]);
  const min = Math.floor(Math.log10(Math.min(...values))), max = Math.ceil(Math.log10(Math.max(...values)));
  const span = Math.max(1, max - min), width = 450, height = 215, left = 52, top = 10, right = 15, bottom = 38;
  const x = value => left + (Math.log10(value) - min) / span * (width - left - right);
  const y = value => height - bottom - (Math.log10(value) - min) / span * (height - top - bottom);
  const dollars = value => `$${num(value, value < 1 ? 2 : 0)}`;
  const ticks = Array.from({ length: span + 1 }, (_, index) => 10 ** (min + index));
  return `<svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="Predicted versus actual hourly prices on logarithmic axes, with each prediction made while withholding its machine family. The dashed line is perfect agreement.">${ticks.map(value => `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height-bottom}" stroke="#e2e3db"/><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e2e3db"/><text x="${x(value)}" y="${height-bottom+16}" text-anchor="middle" font-size="9" fill="#747872">${dollars(value)}</text><text x="${left-8}" y="${y(value)+3}" text-anchor="end" font-size="9" fill="#747872">${dollars(value)}</text>`).join('')}<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${top}" stroke="#b8492c" stroke-dasharray="4 4"/>${points.map(point => `<circle cx="${x(point.actual).toFixed(2)}" cy="${y(point.predicted).toFixed(2)}" r="3" fill="#728269" fill-opacity=".5"><title>${esc(point.name ?? point.id)}: actual ${money(point.actual)}, predicted ${money(point.predicted)}</title></circle>`).join('')}<text x="${width/2}" y="${height-3}" text-anchor="middle" font-size="10" fill="#747872">Actual USD/hour · log scale</text><text transform="translate(11 ${height/2-10}) rotate(-90)" text-anchor="middle" font-size="10" fill="#747872">Predicted USD/hour</text></svg>${available.length > points.length ? `<p class="chart-caption">${num(points.length)} of ${num(available.length)} predictions shown. Metrics use every prediction.</p>` : ''}`;
}

function diagnostics(model) {
  const checks = [
    ['A provider not seen in training', model.diagnostics?.providerHoldout],
    ['A GPU model not seen in training', model.diagnostics?.gpuModelHoldout],
  ].filter(([, value]) => value);
  if (!checks.length) return '';
  return `<details class="experiment-details"><summary>Stricter transfer checks</summary><p class="small-copy">These hold out whole providers or GPU hardware models. ${model.displayReason ? 'They test the fixed RAM + Geekbench equation beyond machine families; no variable selection is performed.' : 'They test transfer beyond machine families, conditional on the equation chosen using all data; they do not repeat its selection.'} Small numbers of groups make results less stable.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>Prediction target</th><th>Mean error</th><th>Log R²</th><th>Tested</th></tr></thead><tbody>${checks.map(([label, value]) => `<tr><td>${label}</td><td>${pct(value.mape)}</td><td>${fixed(value.logR2)}</td><td>${num(value.testedCount)}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function comparisonSummary(section, kind) {
  const additive = kind === 'gpu' && section.comparisons?.find(row => row.id === 'gpu-existing-additive-fp32');
  if (additive?.commonTestedCount) {
    const error = id => additive.variants.find(row => row.id === id)?.commonValidation?.mape;
    const added = error('gpu-additive-add-fp32');
    return `<p class="experiment-insight">On the same ${num(additive.commonTestedCount)} configurations, keeping the previous CPU-baseline + GPU-contribution formula, replacing GPU Geekbench with FP32 gives <strong>${pct(error('gpu-additive-replace-geekbench'))}</strong> mean held-out error versus <strong>${pct(error('gpu-additive-geekbench'))}</strong> with Geekbench. Adding FP32 alongside Geekbench ${added > 1000 ? 'makes held-out predictions extremely unstable' : `gives ${pct(added)} error`}. These comparisons hold the model form fixed; the headline above includes model selection on a broader sample.</p>`;
  }
  const comparison = section.comparisons?.find(row => row.id === (kind === 'gpu' ? 'gpu-add-replace-fp32' : 'cpu-benchmark-ablation'));
  if (!comparison?.commonTestedCount) return '';
  const error = id => comparison.variants.find(row => row.id === id)?.commonValidation?.mape;
  if (kind === 'cpu') return `<p class="experiment-insight">On the same ${num(comparison.commonTestedCount)} configurations, RAM + vCPU count has <strong>${pct(error('cpu-capacity'))}</strong> mean held-out error, compared with <strong>${pct(error('cpu-geekbench'))}</strong> for RAM + CPU Geekbench.</p>`;
  const original = error('gpu-geekbench'), replacement = error('gpu-replace-geekbench'), added = error('gpu-add-fp32');
  return `<p class="experiment-insight">On the same ${num(comparison.commonTestedCount)} configurations, replacing GPU Geekbench with FP32 gives <strong>${pct(replacement)}</strong> mean held-out error versus <strong>${pct(original)}</strong> for the original four-variable equation. Adding FP32 alongside both benchmarks ${added > 1000 ? 'makes predictions extremely unstable' : `gives ${pct(added)} error`}. Wider FP32 coverage alone does not establish a better fit.</p>`;
}

export function renderExperiment(report, kind, { providerName = value => value } = {}) {
  const section = report[kind], model = displayedExperiment(report, kind);
  if (!model?.fit) return `<div class="empty-model"><p class="eyebrow">${kind === 'gpu' ? 'GPU' : 'CPU'} PRICE MODEL</p><h3>Not enough independent data.</h3><p>A model is only displayed when the available inputs support a fit and family holdouts. The public price catalog is still available below.</p></div>${variantTable(section?.variants ?? [])}`;
  const fit = model.fit, validation = model.validation ?? {}, keys = fit.keys ?? model.featureKeys;
  const equation = equationFor(fit);
  const reference = keys.map(key => `${num(fit.reference[key])} ${features[key]?.unit ?? esc(key)}`).join(' · ');
  const coverage = `${num(model.sampleCount)} configurations · ${num(model.familyCount)} machine families · ${(model.providers ?? []).map(providerName).join(', ')}`;
  const parameters = [{ key: 'A', value: fit.A }, ...keys.map((key, index) => ({ key, value: fit.slopes[index] }))];
  const negative = fit.slopes.some(value => value < 0);
  const comparisons = (section.comparisons ?? []).map(comparison => `<details class="experiment-details"><summary>${esc(comparison.label)} <span>${num(comparison.commonTestedCount ?? comparison.sampleCount)} comparable configurations</span></summary><p class="small-copy">${esc(comparison.note ?? 'Every model below is trained and tested on the same eligible configurations, withholding entire machine families.')}</p>${variantTable(comparison.variants ?? [], { paired: true, sampleCount: comparison.sampleCount })}<p class="small-copy">Errors use the same ${num(comparison.commonTestedCount ?? 0)} held-out predictions for every row. This comparison isolates the choice of variables; it does not add unmatched prices.</p></details>`).join('');
  return `<div class="model-hero"><div class="reference-price"><p class="eyebrow">FITTED REFERENCE MACHINE</p><p class="headline-price">${money(fit.A)}<span>/ hour</span></p><p class="reference-spec"><strong>${esc(reference)}</strong><br />A comparison basket, not a provider quote.</p></div><div class="equation-panel"><p class="eyebrow">${esc(model.label).toUpperCase()}</p><p class="equation">P = ${equation}</p><p>${keys.map(key => `${features[key]?.symbol ?? esc(key)} = ${features[key]?.definition ?? esc(key)}`).join('<br />')}<br />P = full machine price in USD/hour</p></div></div>
  <div class="coverage-line"><span>${esc(coverage)}</span><span class="quality-label">${esc(model.quality ?? 'See held-out validation below')}</span></div>
  <div class="fit-grid"><div><h3>The fitted parameters</h3><table class="parameter-table"><thead><tr><th>Input</th><th>Estimate</th></tr></thead><tbody>${parameters.map(parameter => `<tr><td>${parameter.key === 'A' ? 'Reference USD/hour' : `${esc(features[parameter.key]?.label ?? parameter.key)} exponent`}</td><td>${parameter.key === 'A' ? money(parameter.value) : fixed(parameter.value)}</td></tr>`).join('')}</tbody></table><p class="small-copy parameter-note">Fit uses natural logarithms. A 1% increase in an input corresponds to approximately its exponent % higher fitted price, with other included inputs fixed.</p><p class="small-copy parameter-note">Training log R²: <strong>${fixed(fit.logR2)}</strong>. Training accuracy is not the test of a good fit. Individual exponents can be unstable when resources are sold together.</p><p class="small-copy parameter-note">${kind === 'gpu' ? 'FP32 describes theoretical arithmetic capacity, not measured application speed. vCPU count describes allocation, not CPU benchmark performance.' : 'The displayed CPU model uses measured Geekbench performance and RAM. The saved vCPU model remains a rental-price comparison; equal vCPU counts do not imply equal speed.'} Resources omitted from an equation remain part of the full machine price and its prediction error.</p></div>
  <div><h3>Does it predict unseen families?</h3><div class="diagnostic-metrics"><div><p class="diagnostic-number">${pct(validation.mape)}</p><p class="diagnostic-label">Mean price error<br />${kind === 'cpu' ? 'fixed Geekbench equation' : 'including model selection'}</p></div><div><p class="diagnostic-number">${fixed(validation.logR2)}</p><p class="diagnostic-label">Held-out log R²<br />1.0 is perfect</p></div><div><p class="diagnostic-number">${num(validation.testedCount)}/${num(model.sampleCount)}</p><p class="diagnostic-label">Configurations<br />tested out of sample</p></div></div>${scatter(validation)}<p class="chart-caption">${kind === 'cpu' ? 'The RAM + Geekbench equation is fixed by design. Fitting excludes every family in the test fold; there is no variable selection in this headline.' : 'Both variable selection and fitting exclude the family being predicted.'} Family-average error: ${pct(validation.familyMape)}.${validation.skippedGroups?.length ? ` ${validation.skippedGroups.length} families could not be tested.` : ''}</p></div></div>
  ${kind === 'cpu' ? savedCapacityModel(section) : ''}<div class="method-comparison"><h3>${kind === 'gpu' ? 'Does FP32 help? Can we use fewer benchmarks?' : 'Do we need CPU benchmarks?'}</h3>${comparisonSummary(section, kind)}<p class="small-copy experiment-intro">Each equation below uses every fresh price with its required inputs. Removing a scarce metric can broaden coverage. Errors from different samples do not establish which variables improve prediction.</p>${variantTable(section.variants ?? [], { selectedId: model.id })}<p class="small-copy">${kind === 'cpu' ? 'These rows and the Geekbench headline evaluate fixed equations. The saved broader capacity model separately repeats variable selection inside each training fold. A smaller price error does not make vCPU a standardized performance measure.' : 'These rows evaluate fixed equations. The headline above also repeats the choice of equation inside each training fold, which avoids giving model selection credit for seeing the test prices.'}</p><div class="paired-comparisons"><p class="eyebrow">COMPARE THE SAME CONFIGURATIONS</p>${comparisons || '<p class="small-copy">Too few common configurations support a reliable comparison.</p>'}</div>${diagnostics(model)}</div>
  <div class="limitations"><strong>What this fit can tell us</strong><ul><li>${kind === 'gpu' ? 'FP32 values are dense theoretical peaks for sourced GPU variants. For whole multi-GPU allocations, peaks are added as hardware capacity; this assumes no linear application speedup.' : 'CPU benchmarks measure compatible exact VM shapes. Missing scores are never estimated from core counts.'}</li><li>${kind === 'cpu' ? 'The displayed equation prioritizes measured CPU performance and therefore uses the smaller benchmarked sample. The broader capacity model is preserved as an alternative.' : 'The headline model is selected within a common, broader pool. Benchmark comparisons use their own smaller matched pool; the tables disclose both.'}</li><li>Provider premiums, CPU generation, memory bandwidth, included disks and networking can affect prices beyond these inputs.</li>${negative ? '<li>A negative exponent is a conditional pattern in this sample. Correlated resources can make it unstable; it is not evidence that adding hardware reduces its causal cost.</li>' : ''}</ul></div>`;
}
