import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPERIMENT_VERSION, experimentDataSignature } from '../lib/experiments.js';
import { GPU_RESOURCE_MODEL_VERSION, resourceDataSignature } from '../lib/gpu-resource-models.js';

export const PUBLICATION_FILES = [
  'data/prices.json', 'data/price-catalog.json', 'data/model.json',
  'data/experiments.json', 'data/gpu-resource-experiments.json',
  'data/reference-history.json', 'data/residual-diagnostics.json',
  'analysis/model-report.md', 'analysis/experiments-report.md',
  'analysis/gpu-resource-report.md', 'analysis/reference-history-report.md',
  'analysis/residual-report.md', 'output/pdf/compute-price-methodology.pdf',
];
const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (directory, name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const positive = value => Number.isFinite(value) && value > 0;

/** Check the same signatures the browser checks, before a static deployment. */
export async function validatePublication(directory = root) {
  const names = ['price-catalog', 'benchmarks', 'cpu-benchmarks-expanded', 'gpu-cpu-benchmarks',
    'sparecores-benchmarks', 'gpu-model-benchmarks', 'gpu-fp32', 'gpu-bandwidth',
    'experiments', 'gpu-resource-experiments', 'reference-history', 'residual-diagnostics', 'reference-machine'];
  const [catalog, original, expanded, gpuCpu, spare, gpu, fp32, bandwidth, report, resources, history, residuals, reference] =
    await Promise.all(names.map(name => json(directory, `data/${name}.json`)));
  const sources = [original, expanded, gpuCpu, spare];
  assert(Array.isArray(catalog.instances) && catalog.instances.length > 0, 'The price catalog is empty.');
  assert(report.priceUpdatedAt === catalog.updatedAt && resources.priceUpdatedAt === catalog.updatedAt,
    'Price and model dates differ; refusing to publish a mixed snapshot.');
  assert(report.experimentVersion === EXPERIMENT_VERSION && report.sourceDataSignature === experimentDataSignature(catalog, sources, gpu, fp32),
    'CPU models do not match the current price and benchmark inputs.');
  assert(resources.resourceModelVersion === GPU_RESOURCE_MODEL_VERSION && resources.sourceDataSignature === resourceDataSignature(catalog, sources, gpu, fp32, bandwidth),
    'GPU models do not match the current price and benchmark inputs.');
  const cpu = report.cpu?.displayed;
  const gpuModel = resources.singleResourceComparison?.variants?.find(model => model.id === 'gpu-bandwidth-linear');
  for (const [kind, model] of [['cpu', cpu], ['gpu', gpuModel]]) {
    assert(model?.fit && model.sampleCount > 0 && model.validation?.testedCount === model.sampleCount,
      `The displayed ${kind.toUpperCase()} fit or its validation is incomplete.`);
    assert(model.validation.predictions.length === model.sampleCount && model.validation.predictions.every(row => positive(row.actual) && positive(row.predicted)),
      `The ${kind.toUpperCase()} plot contains incomplete or invalid held-out predictions.`);
    assert(residuals.models?.[kind]?.priceUpdatedAt === catalog.updatedAt && residuals.models[kind].sampleCount === model.sampleCount,
      `The ${kind.toUpperCase()} residuals belong to a different price snapshot.`);
  }
  assert(positive(cpu.fit.A) && gpuModel.fit.cpuFit?.A === cpu.fit.A,
    'The GPU host baseline differs from the displayed CPU model.');
  for (const key of ['ramGiB', 'cpuScore', 'gpuCount', 'bandwidthPerGpuGBps']) {
    assert(history.reference?.[key] === reference[key], 'Historical and current references differ.');
  }
  assert(history.points?.length > 0, 'The historical reference series is empty.');
  const pdf = await readFile(path.join(directory, 'output/pdf/compute-price-methodology.pdf'));
  assert(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 1000, 'The methodology PDF is missing or invalid.');
  return { priceUpdatedAt: catalog.updatedAt, catalogCount: catalog.instances.length,
    cpuCount: cpu.sampleCount, gpuCount: gpuModel.sampleCount };
}

async function runStep(directory, script, { python = false, tolerateFailure = false } = {}) {
  const executable = python ? process.env.PYTHON ?? 'python3' : process.execPath;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [script], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const capture = bytes => { tail = (tail + bytes.toString()).slice(-12000); };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 && !tolerateFailure) reject(new Error(`${script} failed (exit ${code}).\n${tail}`));
      else resolve({ code, output: tail });
    });
  });
}

/** Stage all network and fitting work. A failed step cannot alter the published data. */
export async function refreshForHugo({ directory = root, execute = runStep, now = () => new Date().toISOString(), log = console.log } = {}) {
  const attemptedAt = now();
  const staging = await mkdtemp(path.join(tmpdir(), 'compute-price-daily-'));
  let publishing = false;
  try {
    for (const folder of ['data', 'lib', 'scripts', 'output/pdf']) {
      await mkdir(path.dirname(path.join(staging, folder)), { recursive: true });
      await cp(path.join(directory, folder), path.join(staging, folder), { recursive: true });
    }
    log('Checking public cloud prices…');
    const refresh = await execute(staging, 'scripts/update-prices.mjs', { tolerateFailure: true });
    const catalog = await json(staging, 'data/price-catalog.json');
    const fresh = catalog.providers.filter(provider => provider.status === 'fresh'
      && Date.parse(provider.lastSuccessAt) >= Date.parse(attemptedAt));
    assert(fresh.length > 0 && Date.parse(catalog.updatedAt) >= Date.parse(attemptedAt),
      `No provider returned a new verified catalog.\n${refresh.output ?? ''}`);
    const failedProviders = catalog.providers.filter(provider => provider.status !== 'fresh').map(provider => provider.id);
    if (failedProviders.length) log(`Some sources are unavailable (${failedProviders.join(', ')}); retained prices keep their original dates.`);
    for (const [script, message] of [
      ['fit-model.mjs', 'Fitting saved price models…'],
      ['fit-experiments.mjs', 'Fitting the CPU model and saved comparisons…'],
      ['fit-gpu-resources.mjs', 'Fitting the GPU bandwidth model and comparisons…'],
      ['fit-reference-history.mjs', 'Updating the historical reference series…'],
      ['fit-residuals.mjs', 'Updating held-out residual diagnostics…'],
    ]) {
      log(message);
      await execute(staging, `scripts/${script}`);
    }
    log('Regenerating the one-page methodology…');
    await execute(staging, 'scripts/create-methodology-pdf.py', { python: true });
    const validated = await validatePublication(staging);
    const status = { schemaVersion: 1, status: failedProviders.length ? 'partial' : 'updated',
      attemptedAt, completedAt: now(), ...validated, freshProviders: fresh.map(provider => provider.id), failedProviders };
    await writeFile(path.join(staging, 'data/refresh-status.json'), JSON.stringify(status, null, 2) + '\n');

    // Keep a rollback copy until every prepared file has been promoted.
    const files = [...PUBLICATION_FILES, 'data/refresh-status.json'];
    const backup = path.join(staging, 'previous');
    for (const name of files) {
      const target = path.join(backup, name);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(directory, name), target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    publishing = true;
    try {
      for (const name of files) {
        const target = path.join(directory, name);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.join(staging, name), `${target}.daily-tmp`);
        await rename(`${target}.daily-tmp`, target);
      }
    } catch (error) {
      for (const name of files) {
        await cp(path.join(backup, name), path.join(directory, name)).catch(rollbackError => {
          if (rollbackError.code !== 'ENOENT') throw rollbackError;
        });
      }
      throw error;
    }
    log(`Published a complete ${validated.priceUpdatedAt} snapshot: ${validated.cpuCount} CPU and ${validated.gpuCount} GPU fit rows.`);
    return status;
  } catch (error) {
    const previous = await json(directory, 'data/price-catalog.json').catch(() => null);
    await mkdir(path.join(directory, 'data'), { recursive: true });
    await writeFile(path.join(directory, 'data/refresh-status.json'), JSON.stringify({
      schemaVersion: 1, status: 'retained', attemptedAt, completedAt: now(),
      priceUpdatedAt: previous?.updatedAt ?? null,
      message: 'The automatic refresh did not complete. The last complete price snapshot has been retained.',
    }, null, 2) + '\n');
    log(`Daily refresh failed${publishing ? ' during promotion' : ''}; retained the previous complete publication.`);
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--validate')) console.log(JSON.stringify(await validatePublication(), null, 2));
    else await refreshForHugo();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
