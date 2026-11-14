import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALIBABA_LOADER_URL, ALIBABA_REGION, fetchAlibabaCatalog, parseAlibabaCatalog, parseAlibabaLoader } from '../scripts/providers/alibaba.mjs';

const fixture = name => readFile(new URL(`./fixtures/alibaba/${name}`, import.meta.url), 'utf8');
const [prices, definitions, loader, displayText] = await Promise.all([
  fixture('prices.js'), fixture('definitions.js'), fixture('loader.js'), fixture('display-excerpts.txt'),
]);
const now = '2026-09-29T05:40:00.000Z';
const sources = parseAlibabaLoader(loader);
const context = { ...sources, displayText, now };
const parse = (priceText = prices, specText = definitions, overrides = {}) => parseAlibabaCatalog(priceText, specText, { ...context, ...overrides });
const priceObject = () => JSON.parse(prices.split('=').slice(1).join('=').trim().replace(/;$/, ''));
const encode = data => `var instanceTypePrice_2 = ${JSON.stringify(data)};`;
const virginiaRecords = data => Object.values(data.linux['us-east-1']).filter(value => value?.vpc).flatMap(value => Object.values(value.vpc).flat());

test('official loader discovers a matching international price/specification version', () => {
  assert.match(sources.priceSourceUrl, /ecs-price-info-intl\/2\.0\.421\/.*instanceTypePrice_2\.js$/);
  assert.match(sources.specSourceUrl, /ecs-price-info-intl\/2\.0\.421\/.*instanceTypeDefinition\.js$/);
  assert.throws(() => parseAlibabaLoader(loader.replaceAll('ecs-price-info-intl', 'ecs-price-info')), /international/);
  assert.throws(() => parseAlibabaLoader(loader.replace('2.0.421/price/js_price/filter_price/instanceTypeDefinition', '2.0.420/price/js_price/filter_price/instanceTypeDefinition')), /versions differ/);
});

test('uses only Virginia Linux VPC hourly list prices from real public feed excerpts', () => {
  const rows = parse();
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.provider, 'alibaba'); assert.equal(row.region, ALIBABA_REGION);
    assert.equal(row.currency, 'USD'); assert.equal(row.operatingSystem, 'Linux');
    assert.equal(row.billingKind, 'on-demand'); assert.equal(row.observedAt, now);
    assert.ok(row.hourlyUsd > 0); assert.deepEqual(row.priceRecordPath.slice(0, 2), ['linux', 'us-east-1']);
    assert.equal(row.priceRecordPath[3], 'vpc'); assert.equal(row.priceSourceUrl, sources.priceSourceUrl);
  }
  const t4 = rows.find(row => row.name === 'ecs.gn6i-c4g1.xlarge');
  assert.equal(t4.vcpus, 4); assert.equal(t4.ramGiB, 15);
  assert.equal(t4.hourlyUsd, 1.118);
});

test('list-rate extraction ignores discounted rates, subscription totals, Windows and other regions', () => {
  const data = priceObject(), target = virginiaRecords(data).find(row => row[0] === 'ecs.g7.large');
  target[6][0] = '0.0001'; target[8][1] = '9999999';
  const expected = Number(target[8][0]);
  assert.equal(parse(encode(data)).find(row => row.name === target[0]).hourlyUsd, expected);
  delete data.linux['us-east-1'];
  assert.throws(() => parse(encode(data)), /Virginia Linux/);
});

test('USD, hourly and memory-unit declarations must remain verified', () => {
  assert.throws(() => parse(prices, definitions, { displayText: displayText.replace('"USD"', '"CNY"') }), /currency/);
  assert.throws(() => parse(prices, definitions, { displayText: displayText.replace('Pay-as-you-go Hourly Price', 'Monthly Price') }), /hourly/);
  assert.throws(() => parse(prices, definitions, { priceSourceUrl: sources.priceSourceUrl.replace('-intl/', '/') }), /international USD/);
  assert.throws(() => parse(prices, definitions, { displayText: displayText.replace('MEM (GiB)', 'MEM (GB)') }), /memory-unit/);
});

test('GPU model, device count and per-device nominal GB are preserved without treating partitions as full GPUs', () => {
  const rows = parse(), t4 = rows.find(row => row.name === 'ecs.gn6i-c4g1.xlarge');
  assert.equal(t4.gpu, 'NVIDIA T4'); assert.equal(t4.gpuCount, 1); assert.equal(t4.gpuAllocation, 'full');
  assert.equal(t4.vramCapacity.value, 16); assert.equal(t4.vramCapacity.unit, 'GB');
  assert.equal(t4.vramGiB, 16); assert.equal(t4.vramUnit, 'GB');
  assert.equal(t4.vramCapacity.byteConvention, 'unspecified');
  const two = rows.find(row => row.name === 'ecs.gn7i-2x.8xlarge');
  assert.equal(two.gpuCount, 2); assert.equal(two.vramCapacity.value, 48);
  const part = rows.find(row => row.name === 'ecs.sgn7i-vws-m2s.xlarge');
  assert.equal(part.gpu, 'NVIDIA A10*1/12'); assert.equal(part.gpuCount, 1 / 12);
  assert.equal(part.gpuAllocation, 'fractional'); assert.equal(part.vramCapacity.value, 2);
});

test('burstable and bare-metal CPU semantics are explicit', () => {
  const rows = parse();
  assert.equal(rows.find(row => row.name === 'ecs.t6-c1m2.large').cpuTenancy, 'burstable');
  assert.equal(rows.find(row => row.name === 'ecs.ebmg6.26xlarge').cpuTenancy, 'bare-metal');
  assert.equal(rows.find(row => row.name === 'ecs.g7.large').cpuTenancy, 'dedicated-vCPU');
});

test('mismatched capacity fails closed rather than joining the wrong hardware', () => {
  const data = priceObject(); virginiaRecords(data)[0][4] *= 2;
  assert.throws(() => parse(encode(data)), /price\/specification mismatch/);
});

test('invalid or absent hourly rates are excluded instead of derived from monthly prices', () => {
  const data = priceObject(), records = virginiaRecords(data), excluded = records.slice(0, 3).map(row => row[0]);
  records[0][8][0] = ''; records[1][8][0] = '-1'; records[2][8][0] = null;
  assert.equal(parse(encode(data)).filter(row => excluded.includes(row.name)).length, 0);
});

test('conflicting duplicate public rates fail instead of selecting the cheapest', () => {
  const data = priceObject(), group = Object.values(data.linux['us-east-1']).find(value => value?.vpc?.true?.length);
  const duplicate = structuredClone(group.vpc.true[0]); duplicate[8][0] = '0.00001';
  group.vpc.true.push(duplicate);
  assert.throws(() => parse(encode(data)), /ambiguous rate/);
});

test('remote assignments are decoded as JSON without evaluating executable text', () => {
  assert.throws(() => parse(`${prices}\nglobalThis.unexpected = true;`), /invalid JSON/);
  assert.equal(globalThis.unexpected, undefined);
  assert.throws(() => parse(prices.replace('var instanceTypePrice_2', 'var other')), /missing JSON assignment/);
});

test('fetch follows only verified official loader URLs and rejects source failures', async () => {
  const responses = new Map([[ALIBABA_LOADER_URL, loader], [sources.priceSourceUrl, prices],
    [sources.specSourceUrl, definitions], [sources.displaySourceUrl, displayText]]);
  const called = [];
  const fetcher = async url => { called.push(url); assert.ok(responses.has(url)); return new Response(responses.get(url)); };
  assert.deepEqual(await fetchAlibabaCatalog(fetcher, now), parse());
  assert.equal(called[0], ALIBABA_LOADER_URL); assert.equal(called.length, 4);
  await assert.rejects(fetchAlibabaCatalog(async () => new Response('', { status: 503 }), now), /HTTP 503/);
});
