import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchOracleCatalog, parseOracleCatalog, oracleRate, ORACLE_PRICE_URL, ORACLE_SHAPES_URL, ORACLE_PRICE_LIST_URL } from '../scripts/providers/oracle.mjs';

const dir = new URL('./fixtures/oracle/', import.meta.url);
const products = JSON.parse(await readFile(new URL('products.json', dir), 'utf8'));
const shapes = await readFile(new URL('shapes.html', dir), 'utf8');
const priceList = await readFile(new URL('price-list.html', dir), 'utf8');
const now = '2026-09-29T05:00:00.000Z';
const parse = (p = products, s = shapes, l = priceList) => parseOracleCatalog(p, s, l, now);
const parsed = parse();
const instance = name => parsed.instances.find(item => item.name === name);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const product = (data, id) => data.items.find(item => item.partNumber === id);
const tier = (data, id) => product(data, id).currencyCodeLocalizations[0].prices;

test('Oracle flex rent includes all CPU and RAM components with a disclosed finite grid', () => {
  const row = instance('VM.Standard.E4.Flex (2 OCPU, 16 GB)');
  assert.equal(row.vcpus, 4);
  assert.equal(row.ramGiB, 16);
  assert.equal(row.ramUnit, 'GB');
  assert.equal(row.ramCapacity.byteConvention, 'unspecified');
  near(row.hourlyUsd, 2 * 0.025 + 16 * 0.0015);
  assert.deepEqual(row.priceComponents.map(c => [c.partNumber, c.quantity]), [['B93113', 2], ['B93114', 16]]);
  assert.match(row.configurationBasis, /Analyst-selected samples, not provider defaults/);
  assert.deepEqual(parsed.metadata.flexGrid, { ocpus: [1, 2, 4, 8], memoryGBPerOcpu: 8 });
  assert.equal(parsed.instances.filter(i => i.configurationBasis.startsWith('Representative legal')).length, 44);
});

test('Oracle Arm generations use their documented distinct OCPU-to-vCPU factors', () => {
  const a1 = instance('VM.Standard.A1.Flex (2 OCPU, 16 GB)');
  const a2 = instance('VM.Standard.A2.Flex (2 OCPU, 16 GB)');
  const a4 = instance('VM.Standard.A4.Flex (2 OCPU, 16 GB)');
  assert.equal(a1.vcpus, 2);
  assert.equal(a2.vcpus, 4);
  assert.equal(a4.vcpus, 4);
  near(a1.hourlyUsd, 2 * 0.01 + 16 * 0.0015);
  near(a2.hourlyUsd, 2 * 0.014 + 16 * 0.002);
  assert.match(a1.priceComponents[0].priceBasis, /paid marginal/);
  assert.equal(instance('BM.Standard.A1.160').vcpus, 160);
  assert.equal(instance('BM.Standard.A4.48').vcpus, 96);
});

test('fixed bare metal includes its entire published CPU and memory allocation', () => {
  const row = instance('BM.Standard.E5.192');
  assert.equal(row.deploymentType, 'bare-metal');
  assert.equal(row.vcpus, 384);
  assert.equal(row.ramGiB, 2304);
  near(row.hourlyUsd, 192 * 0.03 + 2304 * 0.002);
});

test('dense-I/O rent includes compulsory local NVMe, not just CPU and RAM', () => {
  const row = instance('VM.DenseIO.E4.Flex (8 OCPU, 128 GB)');
  near(row.hourlyUsd, 8 * 0.025 + 128 * 0.0015 + 6.8 * 0.0612);
  assert.equal(row.priceComponents.length, 3);
  assert.equal(row.priceComponents[2].unit, 'NVMe Terabyte Per Hour');
  near(instance('BM.DenseIO.E4.128').hourlyUsd, 128 * 0.025 + 2048 * 0.0015 + 54.4 * 0.0612);
});

test('per-GPU Oracle SKUs bill the complete host and multiply by the allocated GPU count', () => {
  const row = instance('VM.GPU.A10.2');
  assert.equal(row.vcpus, 60);
  assert.equal(row.ramGiB, 480);
  assert.equal(row.vramGiB, 48);
  assert.equal(row.vramUnit, 'GB');
  assert.equal(row.gpuCount, 2);
  assert.equal(row.hourlyUsd, 4);
  assert.equal(row.priceComponents.length, 1);
  assert.equal(row.priceComponents[0].partNumber, 'B95909');
  assert.equal(instance('BM.GPU.H100.8').hourlyUsd, 80);
  assert.equal(instance('BM.GPU.RTXPRO.8').vramGiB, 768);
  assert.ok(!('geekbenchGpu' in row));
});

test('every published record preserves official price/spec provenance and scope', () => {
  assert.equal(parsed.instances.length, 71);
  assert.equal(new Set(parsed.instances.map(row => row.id)).size, 71);
  for (const row of parsed.instances) {
    assert.equal(row.provider, 'oracle');
    assert.equal(row.region, 'us-ashburn-1');
    assert.equal(row.observedAt, now);
    assert.equal(row.priceSourceUrl, ORACLE_PRICE_URL);
    assert.equal(row.specSourceUrl, ORACLE_SHAPES_URL);
    assert.equal(row.priceCompositionSourceUrl, ORACLE_PRICE_LIST_URL);
    assert.match(row.regionScope, /availability and capacity are not guaranteed/);
    assert.match(row.memoryUnitBasis, /without numerical conversion/);
    assert.ok(row.hourlyUsd > 0 && row.vcpus > 0 && row.ramGiB > 0);
    near(row.hourlyUsd, row.priceComponents.reduce((sum, part) => sum + part.hourlyUsd, 0));
  }
  assert.ok(parsed.instances.every(row => !/GPU2\.|Standard\.E3|HPC/.test(row.name)));
  assert.ok(parsed.instances.every(row => !/GB200|GB300|B300|MI355X/.test(row.name)));
});

test('refresh uses changed public rate values instead of freezing fixture prices', () => {
  const revised = structuredClone(products);
  tier(revised, 'B93113')[0].value = 0.04;
  const row = parse(revised).instances.find(row => row.name === 'VM.Standard.E4.Flex (2 OCPU, 16 GB)');
  near(row.hourlyUsd, 2 * 0.04 + 16 * 0.0015);
});

test('missing, duplicate or repurposed SKU data fail closed', () => {
  const missing = structuredClone(products);
  missing.items = missing.items.filter(item => item.partNumber !== 'B93113');
  assert.throws(() => parse(missing), /missing or duplicated/);
  const duplicate = structuredClone(products);
  duplicate.items.push(structuredClone(product(duplicate, 'B93113')));
  assert.throws(() => parse(duplicate), /missing or duplicated/);
  const wrongName = structuredClone(products);
  product(wrongName, 'B93113').displayName = 'Compute Cloud@Customer - E4';
  assert.throws(() => parse(wrongName), /name or billing unit changed/);
  const wrongUnit = structuredClone(products);
  product(wrongUnit, 'B93113').metricName = 'OCPU Per Month';
  assert.throws(() => parse(wrongUnit), /name or billing unit changed/);
});

test('wrong currency, negotiated-only rates and invalid values are rejected', () => {
  for (const change of [
    data => { product(data, 'B93113').currencyCodeLocalizations[0].currencyCode = 'EUR'; },
    data => { tier(data, 'B93113')[0].model = 'MONTHLY_FLEX'; },
    data => { tier(data, 'B93113')[0].value = ''; },
    data => { tier(data, 'B93113')[0].value = Infinity; },
    data => { tier(data, 'B93113')[0].value = 0; },
  ]) {
    const copy = structuredClone(products); change(copy);
    assert.throws(() => parse(copy), /USD price|invalid on-demand rates/);
  }
});

test('free allowance is never reported as free unlimited compute; ambiguous tiers reject', () => {
  assert.equal(oracleRate(products, 'B93297').unitHourlyUsd, 0.01);
  const ambiguous = structuredClone(products);
  tier(ambiguous, 'B93297').push({ model: 'PAY_AS_YOU_GO', value: 0.005, rangeMin: 10000, rangeMax: 999999999 });
  assert.throws(() => parse(ambiguous), /ambiguous or invalid/);
  const gap = structuredClone(products);
  tier(gap, 'B93297')[1].rangeMin = 4000;
  assert.throws(() => parse(gap), /unrecognized pricing tiers/);
});

test('the older officially documented currency wrapper remains readable', () => {
  const old = structuredClone(products);
  for (const item of old.items) {
    item.prices = item.currencyCodeLocalizations;
    delete item.currencyCodeLocalizations;
    for (const localization of item.prices) for (const p of localization.prices) p.value = String(p.value);
  }
  assert.deepEqual(parse(old), parsed);
});

test('changed hardware bounds, GPU SKU mappings and bundle billing definitions fail closed', () => {
  assert.throws(() => parse(products, shapes.replace('8 x 96 GB', '8 x 48 GB')), /total VRAM changed/);
  assert.throws(() => parse(products, shapes.replaceAll('64 GB per OCPU', '2 GB per OCPU')), /no longer legal/);
  assert.throws(() => parse(products, shapes, priceList.replaceAll('data-partnumber="B95909"', 'data-partnumber="CHANGED"')), /SKU mapping changed/);
  assert.throws(() => parse(products, shapes, priceList.replace('The server price per hour is calculated by multiplying the GPU price per hour by the number of GPUs.', 'Each GPU is an add-on.')), /billing definition is missing/);
});

test('adapter fetches all official inputs and attaches the actual observation timestamp', async () => {
  const requests = [];
  const sources = new Map([[ORACLE_PRICE_URL, JSON.stringify(products)], [ORACLE_SHAPES_URL, shapes], [ORACLE_PRICE_LIST_URL, priceList]]);
  const result = await fetchOracleCatalog(async (url, options) => {
    requests.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!options.headers.authorization);
    return new Response(sources.get(url), { status: 200 });
  }, now);
  assert.deepEqual(new Set(requests), new Set(sources.keys()));
  assert.deepEqual(result, parsed);
});

test('failed source fetch and invalid timestamps never produce a fresh partial catalog', async () => {
  await assert.rejects(fetchOracleCatalog(async () => new Response('Unavailable', { status: 503 }), now), /HTTP 503/);
  assert.throws(() => parseOracleCatalog(products, shapes, priceList, 'invalid'), /timestamp is invalid/);
});
