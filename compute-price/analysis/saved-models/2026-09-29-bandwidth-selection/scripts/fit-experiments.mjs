import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fitExperiments } from '../lib/experiments.js';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`data/${name}.json`, root), 'utf8'));
const [catalog, sources, gpuModels, fp32] = await Promise.all([
  read('price-catalog'), Promise.all(['benchmarks', 'cpu-benchmarks-expanded', 'gpu-cpu-benchmarks', 'sparecores-benchmarks'].map(read)),
  read('gpu-model-benchmarks'), read('gpu-fp32'),
]);
const report = fitExperiments(catalog, sources, gpuModels, fp32);
if (!report.cpu.displayed.fit || !report.cpu.selected.fit || !report.gpu.selected.fit) throw new Error('No eligible identifiable displayed or saved primary fit; previous experiment report preserved.');
// Historical nested validation is a descriptive comparison only. It does not
// turn a changed training cohort and feature-selection procedure into an ablation.
try {
  const legacy = await read('model');
  if (legacy.priceUpdatedAt === catalog.updatedAt && legacy.gpu.validation?.predictions) {
    const old = legacy.gpu.validation.predictions;
    const current = report.gpu.selected.validation.predictions;
    const common = old.filter(row => current.some(other => other.id === row.id));
    const currentMap = new Map(current.map(row => [row.id, row]));
    const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
    report.gpu.legacyComparison = { sampleCount: common.length,
      legacyMethod: legacy.gpu.fit?.methodLabel, legacyMape: common.length ? mean(common.map(row => Math.abs(row.predicted / row.actual - 1))) : null,
      selectedMape: common.length ? mean(common.map(row => { const next = currentMap.get(row.id); return Math.abs(next.predicted / next.actual - 1); })) : null,
      note: 'Nested-validation predictions on shared test configurations. The new FP32 procedure trains on a larger cohort and selects from different feature sets; this does not isolate FP32’s causal contribution. Use matched-cohort fixed-feature comparisons for feature ablations.' };
  }
} catch { /* A historical report is optional and never substitutes for fitting. */ }
await mkdir(new URL('analysis/', root), { recursive: true });
await writeFile(new URL('data/experiments.json', root), JSON.stringify(report, null, 2) + '\n');
const num = value => Number.isFinite(value) ? value.toFixed(6) : 'Unavailable';
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Unavailable';
const equation = result => result.fit ? `P = ${num(result.fit.A)} × ${result.fit.keys.map((key, i) => `(${key}/${result.fit.reference[key]})^${num(result.fit.slopes[i])}`).join(' × ')} USD/hour` : 'Not identifiable';
const metricRow = result => {
  const v = result.commonValidation ?? result.validation;
  return `| ${result.label} | ${result.sampleCount} | ${result.familyCount} | ${v.testedCount} | ${pct(v.mape)} | ${pct(v.familyMape)} | ${num(v.logR2)} | ${num(v.familyLogMse)} |`;
};
let markdown = `# FP32 and missing-benchmark experiments\n\nVersion ${report.experimentVersion}; prices ${report.priceUpdatedAt}; generated ${report.generatedAt}. Source signature ${report.sourceDataSignature}.\n\n`;
for (const [name, description] of Object.entries(report.methodology)) markdown += `**${name}:** ${description}\n\n`;
const displayedCpu = report.cpu.displayed;
markdown += `## CPU: displayed Geekbench performance model\n\n**${displayedCpu.label}: ${displayedCpu.quality}.** ${displayedCpu.sampleCount} configurations across ${displayedCpu.familyCount} families and ${displayedCpu.providers.length} providers (${displayedCpu.providers.join(', ')}).\n\n\`${equation(displayedCpu)}\`\n\n${displayedCpu.displayReason}\n\n`;
markdown += `Fixed-form family-held-out MAPE **${pct(displayedCpu.validation.mape)}**; equal-family MAPE ${pct(displayedCpu.validation.familyMape)}; log R² **${num(displayedCpu.validation.logR2)}**. Tested ${displayedCpu.validation.testedCount}/${displayedCpu.sampleCount} rows; ${displayedCpu.validation.completedGroups}/${displayedCpu.validation.groups} families. Training log R² ${num(displayedCpu.fit.logR2)}.\n\nValidation: ${displayedCpu.validation.method}\n\n`;
markdown += `Parameters are refitted to all eligible benchmarked configurations and normalized to the references in the equation. The fixed feature set is chosen for performance comparability, not by minimizing held-out error.\n\n| Parameter | Value |\n|---|---:|\n${displayedCpu.parameters.map(parameter => `| ${parameter.key} | ${num(parameter.value)} |`).join('\n')}\n\n`;
markdown += `Provider-held-out fixed-feature diagnostic: MAPE ${pct(displayedCpu.diagnostics.providerHoldout.mape)}, log R² ${num(displayedCpu.diagnostics.providerHoldout.logR2)}, ${displayedCpu.diagnostics.providerHoldout.testedCount}/${displayedCpu.sampleCount} rows.\n\n${displayedCpu.warnings.map(warning => `- ${warning}`).join('\n')}\n\n`;
for (const type of ['cpu', 'gpu']) {
  const section = report[type], selected = section.selected;
  markdown += `## ${type.toUpperCase()}: ${type === 'cpu' ? 'saved broad-coverage capacity model' : 'primary broad-coverage model'}\n\n**${selected.label}: ${selected.quality}.** ${selected.sampleCount} configurations across ${selected.familyCount} families and ${selected.providers.length} providers (${selected.providers.join(', ')}).\n\n\`${equation(selected)}\`\n\n`;
  markdown += `Parameters are normalized to the references shown in the equation. The selected feature set is refitted to all eligible rows for this equation; its honest headline error comes from nested training-only selection, where the selected feature set can differ between outer folds.${type === 'cpu' ? ' This saved capacity model is retained for comparison; the website displays the fixed Geekbench model above.' : ''}\n\n`;
  markdown += `Nested held-out MAPE **${pct(selected.validation.mape)}**; equal-family MAPE ${pct(selected.validation.familyMape)}; log R² **${num(selected.validation.logR2)}**. Tested ${selected.validation.testedCount}/${selected.sampleCount} rows; ${selected.validation.completedGroups}/${selected.validation.groups} families. Training log R² ${num(selected.fit.logR2)}.\n\n`;
  markdown += `Selection: ${selected.selection.criterion}\n\nCandidates: ${selected.selection.candidates.map(candidate => `${candidate.label} (inner family log MSE ${num(candidate.selectionLoss)})`).join('; ')}.\n\n`;
  markdown += `Provider-held-out fixed-feature diagnostic: MAPE ${pct(selected.diagnostics.providerHoldout.mape)}, log R² ${num(selected.diagnostics.providerHoldout.logR2)}, ${selected.diagnostics.providerHoldout.testedCount}/${selected.sampleCount} rows.\n\n`;
  if (selected.diagnostics.gpuModelHoldout) markdown += `GPU-model-held-out fixed-feature diagnostic: MAPE ${pct(selected.diagnostics.gpuModelHoldout.mape)}, log R² ${num(selected.diagnostics.gpuModelHoldout.logR2)}, ${selected.diagnostics.gpuModelHoldout.testedCount}/${selected.sampleCount} rows. All names for the same physical GPU model are grouped together even when memory or cloud-published peak ratings differ.\n\n`;
  markdown += `### Each feature set on its own available data\n\nThese rows intentionally have different coverage. Error differences here cannot by themselves establish that adding a variable improved prediction.\n\n| Feature set | Eligible rows | Families | Tested | MAPE | Family MAPE | Log R² | Family log MSE |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${section.variants.map(metricRow).join('\n')}\n\n`;
  for (const comparison of section.comparisons) {
    markdown += `### ${comparison.label}\n\n${comparison.sampleCount} identical eligible rows; ${comparison.familyCount} families. Metrics below use the ${comparison.commonTestedCount} test rows predicted by every compared model. ${comparison.note}\n\n| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${comparison.variants.map(metricRow).join('\n')}\n\n`;
  }
  markdown += `### Parameters and selection stability\n\n| Parameter | Value |\n|---|---:|\n${selected.parameters.map(parameter => `| ${parameter.key} | ${num(parameter.value)} |`).join('\n')}\n\n`;
  const choices = {};
  for (const fold of selected.validation.foldSelections) choices[fold.candidateId ?? 'unavailable'] = (choices[fold.candidateId ?? 'unavailable'] ?? 0) + 1;
  markdown += `Outer-fold choices: ${Object.entries(choices).map(([id, count]) => `${id}: ${count}`).join('; ')}.\n\n${selected.warnings.map(warning => `- ${warning}`).join('\n')}\n\n`;
}
if (report.gpu.legacyComparison) markdown += `## Comparison with the previous selected GPU procedure\n\n${report.gpu.legacyComparison.sampleCount} shared test configurations. Prior nested procedure MAPE ${pct(report.gpu.legacyComparison.legacyMape)}; new broad FP32 nested procedure MAPE ${pct(report.gpu.legacyComparison.selectedMape)}. ${report.gpu.legacyComparison.note}\n\n`;
markdown += `## Coverage and sources\n\n${JSON.stringify(report.coverage, null, 2)}\n\nAll price and benchmark provenance remains in the catalog and benchmark JSON records. FP32 provenance: data/gpu-fp32.json version ${report.fp32Version}; each mapped row retains source URLs in the FP32 attachment. Manufacturer peak specifications are hardware-model proxies, not VM measurements; cloud clocks are not verified. Missing peaks and unknown variants are excluded rather than imputed.\n`;
await writeFile(new URL('analysis/experiments-report.md', root), markdown);
console.log(JSON.stringify({ catalogCount: report.catalogCount, coverage: report.coverage,
  cpuDisplayed: { chosen: displayedCpu.id, sampleCount: displayedCpu.sampleCount, quality: displayedCpu.quality, parameters: displayedCpu.parameters, validation: { mape: displayedCpu.validation.mape, logR2: displayedCpu.validation.logR2 }, displayReason: displayedCpu.displayReason },
  cpu: { chosen: report.cpu.selected.id, sampleCount: report.cpu.selected.sampleCount, quality: report.cpu.selected.quality, parameters: report.cpu.selected.parameters, validation: { mape: report.cpu.selected.validation.mape, logR2: report.cpu.selected.validation.logR2 } },
  gpu: { chosen: report.gpu.selected.id, sampleCount: report.gpu.selected.sampleCount, quality: report.gpu.selected.quality, parameters: report.gpu.selected.parameters, validation: { mape: report.gpu.selected.validation.mape, logR2: report.gpu.selected.validation.logR2 } } }, null, 2));
