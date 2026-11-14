import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fitGpuResourceExperiments } from '../lib/gpu-resource-models.js';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`data/${name}.json`, root), 'utf8'));
const [catalog, sources, gpuModels, fp32, bandwidth] = await Promise.all([
  read('price-catalog'), Promise.all(['benchmarks', 'cpu-benchmarks-expanded', 'gpu-cpu-benchmarks', 'sparecores-benchmarks'].map(read)),
  read('gpu-model-benchmarks'), read('gpu-fp32'), read('gpu-bandwidth'),
]);
const report = fitGpuResourceExperiments(catalog, sources, gpuModels, fp32, bandwidth);
const num = value => Number.isFinite(value) ? value.toFixed(6) : 'Unavailable';
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Unavailable';
const metricRow = (variant, validation) => `| ${variant.label} | ${validation?.testedCount ?? 0}/${variant.sampleCount} | ${pct(validation?.mape)} | ${pct(validation?.familyMape)} | ${num(validation?.logR2)} |`;
let markdown = `# GPU resource models: sum versus product\n\nPrices: ${report.priceUpdatedAt}. Generated: ${report.generatedAt}. Model version: ${report.resourceModelVersion}.\n\n`;
markdown += 'Both models include a RAM + CPU Geekbench host baseline. GPU inputs F (dense FP32 TFLOPS), B (memory bandwidth in decimal GB/s), and V (source-normalized VRAM GiB) are per device. n is the whole identical GPU count.\n\n';
markdown += '- Additive GPU contribution: `P = P_host + n × [aF + bB + cV]`.\n- Multiplicative GPU contribution: `P = P_host + n × A(F/30)^alpha(B/1000)^beta(V/40)^gamma`.\n\n';
markdown += 'These are fixed, prespecified forms on the same eligible configurations. Their held-out results are exploratory comparisons, not an independent validation of choosing the lower-error model afterward.\n\n';
for (const [key,value] of Object.entries(report.methodology ?? {})) markdown += `**${key}:** ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`;
markdown += '## Coverage\n\n```json\n' + JSON.stringify(report.coverage,null,2) + '\n```\n\n';
for (const [heading,key] of [['Whole machine families held out','validation'],['Whole GPU models held out','gpuModelValidation']]) {
  markdown += `## ${heading}\n\n| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |\n|---|---:|---:|---:|---:|\n${report.variants.map(variant=>metricRow(variant,variant[key])).join('\n')}\n\n`;
}
if (report.singleResourceComparison) {
  const comparison = report.singleResourceComparison;
  markdown += `## VRAM only versus bandwidth only\n\n${comparison.sampleCount} identical configurations, ${comparison.familyCount} families, ${comparison.gpuModelCount} GPU models. All four retain the RAM + CPU Geekbench host baseline and apply GPU count once.\n\n${comparison.note ?? ''}\n\n`;
  for (const [heading,key,commonKey] of [['Whole machine families held out','validation','commonValidation'],['Whole GPU models held out','gpuModelValidation','commonGpuModelValidation']]) {
    markdown += `### ${heading}\n\n| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |\n|---|---:|---:|---:|---:|\n${comparison.variants.map(variant=>metricRow(variant,variant[commonKey] ?? variant[key])).join('\n')}\n\n`;
  }
  for (const variant of comparison.variants) {
    const fit = variant.fit;
    const key = fit?.resourceKeys?.[0];
    const symbol = key === 'bandwidthPerGpuGBps' ? 'B' : 'V';
    const formula = !fit ? 'Fit unavailable' : fit.kind === 'additive'
      ? `P = P_host + n × ${num(fit.rawCoefficients[0])} × ${symbol}`
      : `P = P_host + n × ${num(fit.A)} × (${symbol}/${num(fit.reference[key])})^${num(fit.slopes[0])}`;
    markdown += `### ${variant.label}\n\n\`${formula}\`\n\n${variant.quality}. B = per-GPU memory bandwidth GB/s; V = per-GPU source-normalized VRAM GiB. CPU baseline as above; prices in USD/hour.\n\n| Parameter | Fitted value |\n|---|---:|\n${(variant.parameters ?? []).map(parameter=>`| ${parameter.label ?? parameter.key} | ${num(parameter.value)} |`).join('\n')}\n\n`;
  }
  markdown += 'Reduced equations are refitted inside every fold; earlier three-input models could use different nonzero inputs in their validation folds. All below-baseline price rows remain in the objective. Common-prediction errors and full-cohort completion are disclosed; comparisons are exploratory, without an independently validated winner selection.\n\n';
}
if (report.baselineComparison) {
  const baseline = report.baselineComparison;
  markdown += `## Previous model on the same configurations\n\n${baseline.label}: ${baseline.sampleCount} rows, ${baseline.familyCount} families, ${baseline.validation.testedCount} tested; mean error **${pct(baseline.validation.mape)}**, log R² **${num(baseline.validation.logR2)}**. ${baseline.note}\n\n`;
}
for (const variant of report.variants) {
  markdown += `## ${variant.label}\n\n${variant.quality}. Status: ${variant.status}.\n\n`;
  markdown += `| Parameter | Fitted value |\n|---|---:|\n${(variant.parameters ?? []).map(parameter=>`| ${parameter.label ?? parameter.key} | ${num(parameter.value)} |`).join('\n')}\n\n`;
  markdown += 'Full fitted structure and solver diagnostics:\n\n```json\n' + JSON.stringify(variant.fit,null,2) + '\n```\n\n';
  markdown += `Training diagnostics: ${JSON.stringify(variant.training)}\n\n`;
  for (const warning of variant.warnings ?? []) markdown += `- ${warning}\n`;
  markdown += '\n';
}
markdown += '## Sources and reproduction\n\nPublic prices and CPU measurements retain their original provenance. Exact GPU FP32 mappings are in data/gpu-fp32.json; memory-bandwidth variants and primary source links are in data/gpu-bandwidth.json. Unverified variants and missing required metrics are excluded rather than estimated. These hardware peaks are not measured application throughput. Complete cohort rows, predictions and fold fits are in data/gpu-resource-experiments.json.\n';
await mkdir(new URL('analysis/',root),{recursive:true});
await writeFile(new URL('data/gpu-resource-experiments.json',root),JSON.stringify(report,null,2)+'\n');
await writeFile(new URL('analysis/gpu-resource-report.md',root),markdown);
console.log(JSON.stringify({coverage:report.coverage,variants:[...report.variants,...(report.singleResourceComparison?.variants ?? [])].map(variant=>({id:variant.id,quality:variant.quality,parameters:variant.parameters,validation:{mape:variant.validation?.mape,logR2:variant.validation?.logR2,tested:variant.validation?.testedCount},gpuModelValidation:{mape:variant.gpuModelValidation?.mape,logR2:variant.gpuModelValidation?.logR2,tested:variant.gpuModelValidation?.testedCount}}))},null,2));
