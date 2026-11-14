import { renderGpuResourceCharts } from './gpu-resource-charts.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = (value, digits = 3) => Number.isFinite(value) ? Math.abs(value) >= 1e6 || value !== 0 && Math.abs(value) < 0.00001 ? value.toExponential(3) : value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const percent = value => Number.isFinite(value) ? `${number(value * 100, 1)}%` : '—';
const count = value => number(value, 0);
const providerName = id => ({ aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud', alibaba: 'Alibaba Cloud', oracle: 'Oracle Cloud', ibm: 'IBM Cloud' })[id] ?? id;
const inputNames = { ramGiB: 'Host RAM', cpuScore: 'CPU Geekbench', fp32PerGpuTflops: 'FP32 throughput', bandwidthPerGpuGBps: 'GPU memory bandwidth', vramPerGpuGiB: 'VRAM', gpuCount: 'GPU count', A: 'Reference GPU contribution' };
const additiveUnits = { fp32PerGpuTflops: 'USD/hour per TFLOPS', bandwidthPerGpuGBps: 'USD/hour per GB/s', vramPerGpuGiB: 'USD/hour per GiB' };

function cpuEquation(fit) {
  if (!fit) return 'Not fitted';
  const symbols = { ramGiB: 'R', cpuScore: 'C' };
  return `${number(fit.A, 5)}${(fit.keys ?? []).map((key, index) => ` × (${symbols[key] ?? esc(key)}/${count(fit.reference?.[key])})<sup>${number(fit.slopes?.[index], 5)}</sup>`).join('')}`;
}

function parameterTable(variant) {
  if (!variant.fit) return '<p class="small-copy">The available data do not support this fit.</p>';
  const parameters = variant.parameters ?? [];
  return `<table class="parameter-table"><thead><tr><th>Parameter</th><th>Estimate</th></tr></thead><tbody>${parameters.map(parameter => {
    const unit = parameter.unit ?? (variant.fit.kind === 'additive' ? additiveUnits[parameter.key] : parameter.key === 'A' ? 'USD/hour for one reference GPU' : 'Exponent');
    return `<tr><td>${parameter.symbol ? `<span class="parameter-symbol">${esc(parameter.symbol)}</span> ` : ''}${esc(parameter.label ?? inputNames[parameter.key] ?? parameter.key)}${unit ? `<span class="cell-subtitle">${esc(unit)}</span>` : ''}</td><td>${number(parameter.value, 7)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function completion(validation, sampleCount) {
  if (!validation) return 'No valid holdouts';
  const tested = validation.testedCount ?? 0;
  const groups = validation.groups;
  const completed = validation.completedGroups;
  return `${count(tested)} / ${count(sampleCount)} rows${Number.isFinite(groups) && Number.isFinite(completed) ? `<span class="cell-subtitle">${count(completed)} / ${count(groups)} groups</span>` : ''}`;
}

function validationTable(variants, key, groupLabel, commonKey) {
  return `<div class="table-scroll"><table class="comparison-table"><thead><tr><th>GPU equation</th><th class="numeric">Mean price error</th><th class="numeric">Log R²</th><th class="numeric">Completed ${esc(groupLabel)}</th></tr></thead><tbody>${variants.map(variant => {
    const validation = variant[key], errors = variant[commonKey] ?? validation;
    return `<tr><td>${esc(variant.label)}${key === 'validation' && variant.quality ? `<span class="cell-subtitle">${esc(variant.quality)}</span>` : ''}${errors?.mape > 1000 ? '<span class="cell-note">Unstable held-out predictions</span>' : ''}</td><td class="numeric">${percent(errors?.mape)}</td><td class="numeric">${number(errors?.logR2, 3)}</td><td class="numeric">${completion(validation, variant.sampleCount)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function modelCard(variant) {
  const additive = variant.id === 'gpu-resource-additive';
  return `<div><p class="eyebrow">${additive ? '01 · ADD THE GPU RESOURCES' : '02 · MULTIPLY THE GPU RESOURCES'}</p><h3>${esc(variant.label)}</h3><p class="equation">P = P<sub>CPU</sub> + n × ${additive ? '(aF + bB + cV)' : 'A × (F/30)<sup>α</sup><br />× (B/1,000)<sup>β</sup> × (V/40)<sup>γ</sup>'}</p><p class="small-copy">${additive ? 'a, b and c are fitted hourly coefficients for one GPU’s FP32 throughput, memory bandwidth and VRAM.' : 'A is the fitted hourly GPU contribution at 30 TFLOPS, 1,000 GB/s and 40 GiB. The exponents describe conditional relationships within that contribution.'}</p>${parameterTable(variant)}<p class="small-copy parameter-note">${variant.fit ? `Training log R²: ${number(variant.training?.logR2, 3)}. This measures training fit, not prediction accuracy.` : esc(variant.status ?? 'Insufficient data')}</p></div>`;
}

function fittedInterpretation(variants) {
  const additive = variants.find(variant => variant.id === 'gpu-resource-additive');
  const multiplicative = variants.find(variant => variant.id === 'gpu-resource-multiplicative');
  if (!additive?.fit || !multiplicative?.fit) return '';
  const additiveError = additive.commonValidation?.mape;
  const multiplicativeError = multiplicative.commonValidation?.mape;
  const boundary = additive.fit.rawCoefficients?.[0] === 0 && additive.fit.rawCoefficients?.[2] === 0
    && multiplicative.fit.slopes?.[0] === 0 && multiplicative.fit.slopes?.[2] === 0;
  return `<p class="small-copy parameter-note">${Number.isFinite(additiveError) && Number.isFinite(multiplicativeError) ? `On matching family holdouts, mean price error is <strong>${percent(additiveError)} for the additive form</strong> and <strong>${percent(multiplicativeError)} for the multiplicative form</strong>. ` : ''}${boundary ? 'Both full-sample fits put the FP32 and VRAM terms at the zero constraint, leaving bandwidth to explain the GPU contribution. This is a pattern in these correlated data, not evidence that compute throughput or VRAM has no value.' : 'These fitted resource relationships are conditional on this sample and its correlated hardware specifications.'}</p>`;
}

function singleResourceComparison(comparison) {
  if (!comparison?.variants?.length) return '';
  const rows = comparison.variants;
  const value = row => row.commonValidation ?? row.validation;
  const formula = row => {
    const fit = row.fit;
    if (!fit) return 'Fit unavailable';
    const key = row.id.includes('bandwidth') ? 'bandwidthPerGpuGBps' : 'vramPerGpuGiB';
    const symbol = key === 'bandwidthPerGpuGBps' ? 'B' : 'V';
    return fit.kind === 'additive'
      ? `P<sub>CPU</sub> + n × ${number(fit.rawCoefficients?.[0], 7)}${symbol}`
      : `P<sub>CPU</sub> + n × ${number(fit.A, 5)}(${symbol}/${number(fit.reference?.[key], 0)})<sup>${number(fit.slopes?.[0], 5)}</sup>`;
  };
  return `<section class="method-comparison" id="gpu-vram-comparison" aria-labelledby="gpu-vram-heading"><h3 id="gpu-vram-heading">Does VRAM predict prices better than memory bandwidth?</h3><p class="small-copy experiment-intro">Each GPU contribution uses exactly one resource. All four equations keep the RAM + CPU Geekbench host baseline and use the same ${count(comparison.sampleCount)} configurations, ${count(comparison.familyCount)} machine families and ${count(comparison.gpuModelCount)} GPU models. Linear forms fix the resource exponent at 1; power forms fit a nonnegative exponent.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>GPU input / function</th><th>Fitted whole-VM price</th><th class="numeric">Family-held-out error</th><th class="numeric">Log R²</th><th class="numeric">Unseen-GPU error</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.label)}</td><td>${formula(row)}</td><td class="numeric">${percent(value(row)?.mape)}<span class="cell-subtitle">${count(row.validation?.testedCount)}/${count(comparison.sampleCount)} tested</span></td><td class="numeric">${number(value(row)?.logR2, 3)}</td><td class="numeric">${percent((row.commonGpuModelValidation ?? row.gpuModelValidation)?.mape)}<span class="cell-subtitle">${count(row.gpuModelValidation?.testedCount)}/${count(comparison.sampleCount)} tested</span></td></tr>`).join('')}</tbody></table></div><p class="small-copy">B = memory bandwidth in GB/s per GPU; V = VRAM in source-normalized GiB per GPU; n = whole GPU count. P<sub>CPU</sub> is the same benchmark-based host baseline used below. Coefficients shown use all eligible data; validation refits both stages without the test host families.</p><p class="small-copy parameter-note">The bandwidth-only equations are refitted as one-input models in every fold. They can have different validation errors from the earlier three-input models, even when those full-sample fits gave FP32 and VRAM zero coefficients. ${count(comparison.commonTestedCount)} family-held-out and ${count(comparison.commonGpuModelTestedCount)} GPU-held-out predictions are shared by all four comparisons.</p><p class="small-copy parameter-note">These are exploratory comparisons on an existing sample, not an independent validation of choosing the lowest-error model afterward. All parameters and held-out predictions are included in the model download.</p></section>`;
}

/** Render the two prespecified GPU resource equations without choosing a winner. */
export function renderGpuResourceExperiments(report) {
  if (!report) return '<div class="empty-model"><h3>GPU resource comparison unavailable.</h3><p>The comparison needs sourced FP32 throughput, GPU memory bandwidth, VRAM and compatible CPU benchmarks.</p></div>';
  const coverage = report.coverage ?? {}, variants = report.variants ?? [];
  const cpuFit = variants.find(variant => variant.fit?.cpuFit)?.fit.cpuFit;
  const warnings = [...new Set(variants.flatMap(variant => variant.warnings ?? []))].filter(warning => /rank deficient|below|validation folds|VRAM/i.test(warning));
  const missing = Object.entries(coverage.missingMetrics ?? {}).filter(([, value]) => Number.isFinite(value) && value > 0);
  const commonFamilyCount = report.commonTestedCount;
  const commonGpuCount = report.commonGpuModelTestedCount ?? variants[0]?.commonGpuModelValidation?.testedCount;
  const baseline = report.baselineComparison;
  return `<div class="gpu-resource-comparison"><p class="eyebrow">GPU RESOURCES · TWO EQUATIONS, THE SAME SAMPLE</p><p class="experiment-insight">Both models keep a measured-performance CPU baseline and model the GPU contribution with <strong>FP32 throughput, memory bandwidth and VRAM</strong>. They use the same ${count(coverage.eligibleCount)} complete GPU configurations. Neither equation is selected as a universal winner.</p>
  <div class="coverage-line"><span>${count(coverage.eligibleCount)} GPU configurations · ${count(coverage.familyCount)} machine families · ${count(coverage.gpuModelCount)} GPU models</span><span>${esc((coverage.providers ?? []).map(providerName).join(', '))}</span></div>
  ${fittedInterpretation(variants)}
  ${singleResourceComparison(report.singleResourceComparison)}
  ${renderGpuResourceCharts(report)}
  <div class="equation-panel"><p class="eyebrow">THE SHARED CPU BASELINE</p><p class="equation">P<sub>CPU</sub> = ${cpuEquation(cpuFit)}</p><p>R = host RAM in GiB · C = measured Geekbench 6 CPU multi-core score<br />Fitted on ${count(coverage.cpuBaselineCount)} CPU-only configurations. This baseline estimates the bundled host; it is not a provider component charge.</p></div>
  <div class="fit-grid">${variants.map(modelCard).join('')}</div>
  <p class="small-copy parameter-note">P = whole-machine USD/hour · n = allocated whole GPU count · F = dense FP32 TFLOPS per GPU · B = GPU memory bandwidth in decimal GB/s per GPU · V = source-normalized GiB of VRAM per GPU. GPU memory bandwidth is different from network bandwidth.</p>
  <p class="small-copy parameter-note">Both forms constrain the GPU coefficients or exponents to be nonnegative and minimize the same whole-machine log-price error, weighting machine families equally. Prices below the estimated CPU baseline are retained. The displayed values describe the full-cohort fits; validation refits the parameters in every fold.</p>
  <div class="method-comparison"><h3>Do these equations predict unseen machines?</h3><p class="small-copy experiment-intro">The comparison starts from one complete-data cohort. Every size of a provider’s machine family stays together in validation. Each held-out prediction refits both the CPU baseline and GPU contribution without the withheld family.</p>${validationTable(variants, 'validation', 'family holdouts', 'commonValidation')}<p class="small-copy">${Number.isFinite(commonFamilyCount) ? `Both error columns use the same ${count(commonFamilyCount)} successfully predicted configurations. ` : ''}Mean price error is the mean absolute percentage error on whole-machine prices; lower is better. Held-out log R² can be negative. Completion counts retain the full cohort so failed folds stay visible; an incomplete comparison may omit difficult families.</p>
  ${baseline ? `<p class="small-copy parameter-note">For context, the previous joint RAM + CPU Geekbench + VRAM + FP32 equation has <strong>${percent(baseline.validation?.mape)}</strong> mean held-out error on ${count(baseline.validation?.testedCount)} configurations from this cohort. Model structure and the fitting objective also changed; this does not isolate the effect of adding bandwidth.</p>` : ''}
  <details class="experiment-details"><summary>Can the equations generalize to an unseen GPU model?</summary><p class="small-copy">These holdouts remove an entire GPU hardware model, including its configurations across providers. They are a stricter transfer check than holding out machine families.${Number.isFinite(commonGpuCount) ? ` Error columns use the same ${count(commonGpuCount)} successfully predicted configurations.` : ''}</p>${validationTable(variants, 'gpuModelValidation', 'GPU-model holdouts', 'commonGpuModelValidation')}</details></div>
  <div class="limitations"><strong>Coverage and interpretation</strong><ul><li>${count(coverage.eligibleCount)} of ${count(coverage.catalogGpuCount)} fresh, otherwise eligible GPU configurations have every required input. Missing hardware data or compatible CPU benchmarks are never filled in.</li><li>FP32 and bandwidth are advertised hardware specifications, not cloud workload benchmarks. Operating clocks, power limits, memory access patterns and communication can change actual performance.</li><li>Multiplying the fitted GPU contribution by GPU count is a price-model assumption. It does not predict linear application speedup.</li><li>Coefficients and exponents describe correlated bundles; they are not separate resource charges or causal prices. Zero at the fitted boundary does not mean that resource has no cost.</li>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul>${missing.length ? `<details class="experiment-details"><summary>Missing-input counts</summary><p class="small-copy">${missing.map(([key, value]) => `${esc(inputNames[key] ?? key)}: ${count(value)}`).join(' · ')}. Categories can overlap.</p></details>` : ''}</div>
  <p class="small-copy parameter-note"><a id="download-gpu-resource-model" href="./data/gpu-resource-experiments.json" download>Download both fits and every holdout ↓</a> · <a href="./data/gpu-bandwidth.json" download>Download sourced GPU bandwidth specifications ↓</a></p></div>`;
}
