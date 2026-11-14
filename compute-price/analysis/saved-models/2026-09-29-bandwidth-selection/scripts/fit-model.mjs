import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fitModels } from '../lib/model.js';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`data/${name}.json`, root), 'utf8'));
const catalog = await read('price-catalog');
const sources = await Promise.all(['benchmarks', 'cpu-benchmarks-expanded', 'gpu-cpu-benchmarks', 'sparecores-benchmarks'].map(read));
const gpuModels = await read('gpu-model-benchmarks');
const report = fitModels(catalog, sources, gpuModels);
if (!report.eligibleCount) throw new Error('No fresh prices matched compatible benchmark records; previous model preserved.');
await writeFile(new URL('data/model.json', root), JSON.stringify(report, null, 2) + '\n');
await mkdir(new URL('analysis/', root), { recursive: true });
const f = n => Number.isFinite(n) ? n.toFixed(6) : 'Unavailable';
const percent = n => Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : 'Unavailable';
const powerLaw = fit => `${f(fit.A)} × ${fit.keys.map((key, i) => `(${key}/${fit.reference[key]})^${f(fit.slopes[i])}`).join(' × ')}`;
const equation = fit => fit.kind === 'cpu-plus-gpu'
  ? `P_VM = [${powerLaw(fit.cpuFit)}] + [${powerLaw(fit.gpuFit)}] USD/hour`
  : `P = ${powerLaw(fit)} USD/hour`;
const rawFeatures = { ramGiB: 'R', cpuScore: 'C', vramGiB: 'V', gpuScore: 'G' };

let summary = `# Compute Price: fitted VM price models\n\nModel version: ${report.modelVersion ?? '4.0.0'}. Prices observed: ${report.priceUpdatedAt}. Model generated: ${report.generatedAt}.\n\n${report.catalogCount} public-price configurations; ${report.eligibleCount} configurations actually included in the fits. Equal configuration weights during fitting, one selected US region per provider; no region duplication. GPU method selection weights inner validation families equally.\n\n`;
for (const type of ['cpu', 'gpu']) {
  const m = report[type];
  summary += `## ${m.label}\n\n${m.sampleCount} configurations, ${m.familyCount} provider × machine families; providers: ${m.providers.join(', ')}.\n\n`;
  if (!m.fit) { summary += m.explanation + '\n\n'; continue; }
  summary += `**${m.quality}.** ${m.explanation}\n\n`;
  if (type === 'gpu' && m.selection?.chosen) {
    summary += `Selected method: **${m.fit.methodLabel}** (${m.fit.methodId}). Ridge penalty: ${f(m.fit.lambda)}; nonnegative exponent constraint: ${m.fit.nonnegative ? 'yes' : 'no'}.\n\nSelection criterion: ${m.selection.criterion}\n\n`;
  }
  summary += `Reference configuration: ${Object.entries(m.reference).map(([key, value]) => `${key}=${value}`).join(', ')}. Its fitted complete-VM price is ${f(m.fit.A)} USD/hour.\n\n\`${equation(m.fit)}\`\n\n`;
  if (m.fit.kind === 'cpu-plus-gpu') {
    summary += `The first term estimates CPU and RAM from CPU-only VMs; the second estimates the positive remaining GPU price. These are modeled contributions, not provider component charges. Nonpositive residual prices reject the candidate fit rather than being filtered out. The CPU term uses its own 16-GiB RAM reference.\n\nUnnormalized form: P_VM = ${m.rawScaleCoefficients.cpuA} × R^α × C^β + ${m.rawScaleCoefficients.gpuB} × V^γ × G^δ.\n\n`;
  } else {
    summary += `Unnormalized form: P = ${m.rawScaleA} × ${m.fit.keys.map((key, i) => `${rawFeatures[key]}^${f(m.fit.slopes[i])}`).join(' × ')}.\n\n`;
  }
  summary += '| Parameter | Estimate | 95% family-bootstrap interval |\n|---|---:|---:|\n';
  for (const parameter of m.parameters) summary += `| ${parameter.symbol} (${parameter.label ?? parameter.key}) | ${f(parameter.value)} | ${parameter.interval ? parameter.interval.map(f).join(' to ') : 'Unavailable'} |\n`;
  const validation = m.validation;
  summary += `\nTraining log R²: ${f(m.fit.logR2)}. Maximum VIF: ${f(m.fit.maxVif)}.\n\n### ${type === 'gpu' && validation.foldSelections ? 'Headline validation: nested method selection' : 'Family-held-out validation'}\n\n${validation.method}\n\n- Tested ${validation.testedCount}/${m.sampleCount} configurations across ${validation.completedGroups}/${validation.groups} families.\n- Held-out mean absolute percentage error: **${percent(validation.mape)}**.\n- Held-out median absolute percentage error: ${percent(validation.medianApe)}.\n- Held-out log R²: ${f(validation.logR2)}.\n- Held-out dollar R²: ${f(validation.priceR2)}.\n- Held-out RMS log error: ${f(validation.rmsle)}.\n- Within ±20%: ${percent(validation.within20)}.\n- ${validation.baselineLabel ?? 'RAM-only baseline'} mean percentage error (${validation.baselineTestedCount} tested predictions): ${percent(validation.baselineMape)}.\n- Skipped families: ${validation.skippedGroups.join(', ') || 'None'}.\n\n`;
  if (Number.isFinite(validation.familyMape)) summary += `Averaging each family's mean percentage error equally gives ${percent(validation.familyMape)}. The headline error above averages tested configurations equally.\n\n`;
  if (validation.methodComparisons?.length) {
    summary += '### Fixed-method comparisons\n\nEvery candidate uses the same eligible GPU sample and family holdout boundaries; the table reports any unavailable predictions. These comparisons explain method choice. Selecting a candidate after inspecting this table does not make its error an independent estimate of the selection procedure. The nested result above remains the headline validation.\n\n| Fixed method | Tested / sample | Families tested | Mean price error | Family-mean price error | Log R² | RMS log error |\n|---|---:|---:|---:|---:|---:|---:|\n';
    for (const comparison of validation.methodComparisons) {
      summary += `| ${comparison.label} | ${comparison.testedCount}/${m.sampleCount} | ${comparison.completedGroups}/${comparison.groups} | ${percent(comparison.mape)} | ${percent(comparison.familyMape)} | ${f(comparison.logR2)} | ${f(comparison.rmsle)} |\n`;
    }
    const common = validation.commonComparison;
    if (common) summary += `\nOn the intersection of ${common.testedCount} tested configurations, the original joint candidate has ${percent(common.originalMape)} error, the selected ${common.selectedMethodId} candidate has ${percent(common.selectedMape)} fixed-method error, and nested selection has ${percent(common.nestedMape)} error. The nested procedure is rated **${m.quality}**; the fixed-method comparison does not replace that result.\n\n`;

  }
  if (validation.foldSelections?.length) {
    summary += '### Choices made inside each outer holdout\n\nThe withheld family does not contribute to its choice of method or penalty. CPU-baseline training excludes that outer family and each inner held-out family.\n\n| Outer withheld family | Training GPU rows | Test rows | Selected method | Inner family-mean squared log error |\n|---|---:|---:|---|---:|\n';
    for (const fold of validation.foldSelections) summary += `| ${fold.family} | ${fold.trainingRows} | ${fold.testRows} | ${fold.methodId ?? 'Unavailable'} | ${f(fold.innerFamilyLogMse)} |\n`;
    summary += '\n';
  }
  summary += m.warnings.map(warning => `- ${warning}`).join('\n') + '\n\n';
  summary += `Confidence intervals use ${m.bootstrap?.repeats ?? 400} deterministic resamples of entire families (${m.bootstrap?.successful ?? 0} valid fits). They are withheld if fewer than 80% of resamples identify valid fits. They do not cover benchmark measurement error or omitted-variable bias.${m.bootstrap?.conditionalOnSelectedMethod ? ' GPU intervals are conditional on the selected method and ridge penalty; they do not include uncertainty from model selection. Shared CPU/GPU families use the same bootstrap multiplicity; remaining CPU-only families are resampled separately.' : ''}\n\n`;
}
summary += '## Data and limits\n\n' + report.benchmarkBasis.cpu + '. ' + report.benchmarkBasis.gpu + '.\n\n';
summary += 'Prices: [AWS](https://aws.amazon.com/ec2/pricing/on-demand/), [Microsoft Azure](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [Google Cloud Compute Engine](https://cloud.google.com/products/compute/pricing), [Alibaba Cloud](https://www.alibabacloud.com/en/product/ecs/pricing), [Oracle Cloud](https://www.oracle.com/cloud/compute/pricing/), [IBM Cloud](https://cloud.ibm.com/docs/account?topic=account-getting-pricing-api). CPU benchmarks: exact VM runs from [Spare Cores](https://github.com/SpareCores/sc-inspector-data) (adapted under CC BY-SA 4.0) and directly linked Geekbench Browser results. GPU proxies: [official Geekbench 7 OpenCL chart](https://browser.geekbench.com/opencl-benchmarks). Per-record provenance lives in the JSON datasets and model report.\n\n';
summary += 'Both models require measured CPU performance and matching nominal host vCPU/RAM. GPU VM prices include the bundled CPU and RAM; the GPU model also requires sourced VRAM and a matching Geekbench GPU-model proxy. Google N1 plus GPU rows may use the measured exact underlying N1 host shape, clearly labeled as paired host measurements; the benchmark was not run with that GPU attached. No CPU performance is imputed from processor names or core counts. Multi-GPU machines are excluded: single-device scores are never multiplied. Prices older than 36 hours, missing benchmarks and incompatible runs are excluded. Cloud hardware and historical benchmark regions may differ from the priced region.\n\n';
summary += 'Memory follows the source definition: Google Cloud binary GB are preserved as GiB; explicitly decimal GB are converted using 10⁹/2³⁰. Original capacities and source units remain recorded. Catalog rows with an unspecified nominal GB byte convention retain their original values and units and remain outside the fit. Provider memory-label conventions limit comparison and do not establish differences in usable device memory.\n\n';
summary += 'Resource exponents are conditional statistical associations, not provider line items or causal prices. Estimated CPU/GPU contributions are not observed component charges. RAM, CPU, VRAM and GPU performance covary, and included storage, networking, provider margins and hardware generation are omitted. A high training R² or the best fixed-method comparison alone does not establish reliable generalization.\n\n';
summary += 'Exclusions:\n\n' + Object.entries(report.exclusions).map(([key, value]) => `- ${key}: ${value}`).join('\n') + '\n';
await writeFile(new URL('analysis/model-report.md', root), summary);
const brief = model => ({ n: model.sampleCount, method: model.fit?.methodId ?? 'cpu-ols', parameters: model.parameters,
  quality: model.quality, validation: model.validation && { mape: model.validation.mape, logR2: model.validation.logR2,
    tested: model.validation.testedCount, method: model.validation.method, methodComparisons: model.validation.methodComparisons,
    foldSelections: model.validation.foldSelections } });
console.log(JSON.stringify({ catalogCount: report.catalogCount, eligibleCount: report.eligibleCount, cpu: brief(report.cpu), gpu: brief(report.gpu) }, null, 2));
