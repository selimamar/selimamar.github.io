import { readFile, writeFile } from 'node:fs/promises';
import { residualDiagnostics } from '../lib/residuals.js';
import { displayedGpuResourceModel } from '../lib/gpu-resource-view.js';

const root = new URL('../', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const [cpuReport, gpuReport] = await Promise.all([read('data/experiments.json'), read('data/gpu-resource-experiments.json')]);
const cpuModel = cpuReport.cpu.displayed, gpuModel = displayedGpuResourceModel(gpuReport);
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), models: {
  cpu: { model: cpuModel.id, priceUpdatedAt: cpuReport.priceUpdatedAt, ...residualDiagnostics(cpuModel.validation) },
  gpu: { model: gpuModel.id, priceUpdatedAt: gpuReport.priceUpdatedAt, ...residualDiagnostics(gpuModel.validation) },
} };
await writeFile(new URL('data/residual-diagnostics.json', root), JSON.stringify(result, null, 2) + '\n');
const format = value => Number.isFinite(value) ? value.toFixed(6) : 'Unavailable';
let text = '# Residual diagnostics for displayed price models\n\n';
text += 'Uses the same family-held-out whole-machine predictions as the website fit plots. Every eligible configuration has equal weight; no tails or outliers are discarded. Historical AWS index reconstructions are not pooled into these diagnostics.\n\n';
text += 'The residual is `ln(listed price) - ln(held-out predicted price)`. Positive errors mean underprediction. Gaussian mean and standard deviation use maximum likelihood (variance divisor n), without forcing the mean to zero. Histogram density integrates to one; the Gaussian curve uses the same density scale.\n\n';
text += '| Model | Price snapshot | Configurations | Families | Gaussian mean | Gaussian sigma | Skewness | Excess kurtosis | Mean absolute price error |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
for (const [kind, stats] of Object.entries(result.models)) {
  text += `| ${kind.toUpperCase()} / ${stats.model} | ${stats.priceUpdatedAt} | ${stats.sampleCount} | ${stats.familyCount} | ${format(stats.mean)} | ${format(stats.sigma)} | ${format(stats.skewness)} | ${format(stats.excessKurtosis)} | ${format(stats.mape * 100)}% |\n`;
}
text += '\nA fitted bell curve does not certify a useful model. Inspect zero-centering, systematic patterns, variation across price levels, distribution shape and held-out error magnitude. Repeated sizes and shared training folds induce dependence; no iid normality p-value or calibrated prediction interval is claimed. The GPU equation was chosen after exploratory comparisons, so its reported held-out checks are not an independent validation of that selection.\n\n';
text += 'Reference: [NIST residual analysis](https://www.itl.nist.gov/div898/handbook/pri/section2/pri24.htm).\n\nReproduce with `npm run diagnostics`; normal fit/refresh commands also regenerate these saved diagnostics. Browser plots and downloads recompute directly from the active displayed model, including newer live prices.\n';
await writeFile(new URL('analysis/residual-report.md', root), text);
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.models).map(([kind, { rows, ...stats }]) => [kind, stats])), null, 2));
