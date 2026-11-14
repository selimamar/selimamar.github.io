import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildReferenceHistory } from '../lib/reference-history.js';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const [archive, mapping, catalog, previous] = await Promise.all([
  read('data/historical-aws-prices.json'), read('data/historical-benchmark-mapping.json'),
  read('data/price-catalog.json'), read('data/reference-history.json').catch(error => { if (error.code === 'ENOENT') return null; throw error; }),
]);
const report = buildReferenceHistory(archive, mapping, catalog, { previous });
const num = (value, digits = 5) => Number.isFinite(value) ? value.toFixed(digits) : 'Unavailable';
let text = '# Historical reference-machine price reconstruction\n\n';
text += `Generated ${report.generatedAt}. Model version ${report.modelVersion}.\n\n`;
text += 'AWS US East (N. Virginia), Linux on-demand nominal USD/hour. This historical series is separate from the headline multi-provider reference.\n\n';
text += `Reference: ${report.referenceMachine.label}, ${report.reference.ramGiB} GB RAM, Geekbench 6 multi-core score ${report.reference.cpuScore.toLocaleString('en-US')}. GPU reference adds one ${report.referenceMachine.gpuKind} with ${report.reference.bandwidthPerGpuGBps.toLocaleString('en-US')} GB/s on-device memory bandwidth. This is a hypothetical comparison basket.\n\n`;
for (const [key, value] of Object.entries(report.methodology)) text += `**${key}:** ${value}\n\n`;
text += '| Actual observation date | Source | CPU $/h | GPU whole VM $/h | GPU increment $/h | CPU shapes / families | GPU shapes / families | Extrapolation |\n|---|---|---:|---:|---:|---:|---:|---|\n';
for (const p of report.points) text += `| ${p.date} | [${p.kind}](${p.sourceUrl}) | ${num(p.cpu.hourlyUsd)} | ${num(p.gpu.hourlyUsd)} | ${num(p.gpu.gpuHourlyUsd)} | ${p.cpu.sampleCount} / ${p.cpu.familyCount} | ${p.gpu.sampleCount} / ${p.gpu.familyCount} | ${p.cpu.extrapolated ? 'CPU ' : ''}${p.gpu.extrapolated ? 'GPU' : ''} |\n`;
for (const p of report.points) {
  text += `\n## ${p.date} — ${p.kind}\n\n`;
  text += `Published: ${p.publicationDate}. Archive SHA-256: ${p.sourceSha256 ?? 'Not an archived download'}.\n\n`;
  text += `CPU: A=${num(p.cpu.fit?.A)}, RAM exponent=${num(p.cpu.fit?.slopes?.[0])}, Geekbench exponent=${num(p.cpu.fit?.slopes?.[1])}. GPU k=${num(p.gpu.k, 9)} USD/hour per GB/s.\n\n`;
  text += `Observed CPU score range ${JSON.stringify(p.cpu.scoreRange)}; RAM range ${JSON.stringify(p.cpu.ramRange)} GiB; per-device bandwidth range ${JSON.stringify(p.gpu.bandwidthRange)} GB/s. Rejected rows: ${p.coverage.rejectedCount}.\n\n`;
  for (const warning of p.warnings) text += `- ${warning}\n`;
}
text += '\n## Reproduction and audit\n\nRun `node scripts/fit-reference-history.mjs`. Immutable matched historical price records and archive hashes are in `data/historical-aws-prices.json`; frozen benchmark provenance is in `data/historical-benchmark-mapping.json`. The JSON report preserves every fitted price row, source, exclusion, coefficient and in-sample diagnostic. No historical predictive-accuracy claim is made.\n';
await mkdir(new URL('analysis/', root), { recursive: true });
await writeFile(new URL('data/reference-history.json', root), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('analysis/reference-history-report.md', root), text);
console.log(JSON.stringify(report.points.map(p => ({ date: p.date, kind: p.kind, cpu: p.cpu.hourlyUsd, gpu: p.gpu.hourlyUsd,
  cpuCount: p.cpu.sampleCount, gpuCount: p.gpu.sampleCount, rejected: p.coverage.rejectedCount, warnings: p.warnings })), null, 2));
