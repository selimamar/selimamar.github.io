import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PUBLICATION_FILES, refreshForHugo, validatePublication } from '../scripts/refresh-for-hugo.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (root, name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const fixture = async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'compute-publication-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['data', 'lib', 'scripts', 'output/pdf', 'analysis']) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await cp(path.join(source, name), path.join(directory, name), { recursive: true,
      filter: filename => !filename.includes(`${path.sep}saved-models${path.sep}`) && !filename.endsWith(`${path.sep}saved-models`) });
  }
  return directory;
};

test('the bundled Hugo publication matches its catalog, benchmark signatures, held-out predictions and references', async () => {
  const result = await validatePublication(source);
  assert.ok(result.catalogCount > 0 && result.cpuCount > 0 && result.gpuCount > 0);
});

test('a fitting failure after new price writes preserves every file in the previous publication', async t => {
  const directory = await fixture(t);
  const before = await Promise.all(PUBLICATION_FILES.map(name => readFile(path.join(directory, name))));
  const now = new Date().toISOString();
  const execute = async (staging, script) => {
    if (script.endsWith('update-prices.mjs')) {
      const catalog = await readJson(staging, 'data/price-catalog.json');
      catalog.updatedAt = now;
      catalog.providers[0] = { ...catalog.providers[0], status: 'fresh', lastSuccessAt: now };
      await writeFile(path.join(staging, 'data/price-catalog.json'), JSON.stringify(catalog));
      return { code: 1, output: 'One source failed after partial success.' };
    }
    throw new Error('Simulated fitting failure after new prices were written.');
  };
  await assert.rejects(refreshForHugo({ directory, execute, now: () => now, log: () => {} }), /Simulated fitting failure/);
  for (const [i, name] of PUBLICATION_FILES.entries()) assert.deepEqual(await readFile(path.join(directory, name)), before[i], name);
  assert.equal((await readJson(directory, 'data/refresh-status.json')).status, 'retained');
  await validatePublication(directory);
});

test('a mixed price/model snapshot is refused before promotion even when processing exits successfully', async t => {
  const directory = await fixture(t);
  const previous = await readFile(path.join(directory, 'data/price-catalog.json'));
  const now = new Date().toISOString();
  const execute = async (staging, script) => {
    if (script.endsWith('update-prices.mjs')) {
      const catalog = await readJson(staging, 'data/price-catalog.json');
      catalog.updatedAt = now;
      catalog.providers[0] = { ...catalog.providers[0], status: 'fresh', lastSuccessAt: now };
      await writeFile(path.join(staging, 'data/price-catalog.json'), JSON.stringify(catalog));
    }
    return { code: 0 };
  };
  await assert.rejects(refreshForHugo({ directory, execute, now: () => now, log: () => {} }), /Price and model dates differ/);
  assert.deepEqual(await readFile(path.join(directory, 'data/price-catalog.json')), previous);
});

test('an outage with retained old dates never produces a new publication or reaches fitting', async t => {
  const directory = await fixture(t);
  let steps = 0;
  const execute = async staging => {
    steps++;
    const catalog = await readJson(staging, 'data/price-catalog.json');
    catalog.providers = catalog.providers.map(provider => ({ ...provider, status: 'stale' }));
    await writeFile(path.join(staging, 'data/price-catalog.json'), JSON.stringify(catalog));
    return { code: 1, output: 'All providers unavailable.' };
  };
  await assert.rejects(refreshForHugo({ directory, execute, log: () => {} }), /No provider returned a new verified catalog/);
  assert.equal(steps, 1);
  await validatePublication(directory);
});

test('a partial provider refresh still promotes a complete validated publication and records failed sources', async t => {
  const directory = await fixture(t);
  const catalog = await readJson(directory, 'data/price-catalog.json');
  const now = catalog.updatedAt;
  const steps = [];
  const execute = async (staging, script) => {
    steps.push(script);
    if (script.endsWith('update-prices.mjs')) {
      catalog.providers[0] = { ...catalog.providers[0], status: 'fresh', lastSuccessAt: now };
      catalog.providers[1] = { ...catalog.providers[1], status: 'stale' };
      await writeFile(path.join(staging, 'data/price-catalog.json'), JSON.stringify(catalog));
      return { code: 1, output: 'One provider was unavailable.' };
    }
    if (script.endsWith('create-methodology-pdf.py')) {
      // Supply the complete matching report outputs that real fitting steps write.
      await cp(path.join(directory, 'analysis'), path.join(staging, 'analysis'), { recursive: true });
    }
    return { code: 0 };
  };
  const result = await refreshForHugo({ directory, execute, now: () => now, log: () => {} });
  assert.equal(result.status, 'partial');
  assert.ok(result.failedProviders.includes(catalog.providers[1].id));
  assert.equal(steps.length, 7);
  assert.equal(steps.at(-1), 'scripts/create-methodology-pdf.py');
  assert.equal((await readJson(directory, 'data/refresh-status.json')).status, 'partial');
  assert.equal((await readJson(directory, 'data/price-catalog.json')).providers[1].status, 'stale');
  await validatePublication(directory);
});
