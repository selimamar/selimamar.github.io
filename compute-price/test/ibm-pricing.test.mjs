import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseIBMDeploymentPrice, ibmProfileSpecifications } from '../scripts/providers/ibm.mjs';
const profiles = JSON.parse(await readFile(new URL('fixtures/ibm.json', import.meta.url), 'utf8')).profiles;
const now = '2026-09-29T07:00:00.000Z';
const fixture = profiles['bx4-2x8'];
const baseMetric = data => data.resources[0].metrics.find(metric => metric.charge_unit_name === 'INSTANCE_HOURS_MULTI_TENANT');

test('IBM selects complete Dallas Linux base rate and documented exact profile specifications', () => {
  const row = parseIBMDeploymentPrice(fixture.plan, fixture.deployment, now);
  assert.equal(row.hourlyUsd, 0.1019898);
  assert.equal(row.vcpus, 2);
  assert.equal(row.ramGiB, 8);
  assert.equal(row.region, 'us-south · Dallas');
  assert.equal(row.priceEffectiveAt, '2026-09-01T00:00:00Z');
  assert.match(row.metricId, /instance-hours-bx4-2x8$/);
  assert.equal(row.geekbench6Multi, undefined);
});

test('IBM rejects nonpublic, disabled, other-region and select-availability profile families', () => {
  for (const modification of [{ active: false }, { disabled: true }, { visibility: { restrictions: 'private' } },
    { geo_tags: ['us-east'] }, { name: 'gx3d-24x120x1a100p' }, { name: 'gx3d-160x1792x8h100' },
    { name: 'bx3dc-2x10' }, { name: 'nxf-1x1' }, { name: 'research-nlp-a100' }]) {
    assert.equal(ibmProfileSpecifications({ ...fixture.plan, ...modification }), null);
  }
});

test('IBM price filters exclude expired, future, tiered, licensed, reserved and fractional-share rates', () => {
  assert.equal(parseIBMDeploymentPrice(fixture.plan, fixture.deployment, '2026-10-01T00:00:00Z'), null);
  assert.equal(parseIBMDeploymentPrice(fixture.plan, fixture.deployment, '2026-08-31T23:00:00Z'), null);
  for (const modification of [{ charge_unit_name: 'INSTANCE_MULTI_TENANT_50_PERCENT' },
    { charge_unit_name: 'WINDOWS_VCPU_HOURS' }, { charge_unit_name: 'INSTANCE_HOURS_RESERVATION' },
    { charge_unit_quantity: 2 }, { charge_unit: 'Virtual Processor Core-Hour' }, { tier_model: 'Simple Tier' },
    { effective_from: '2027-01-01T00:00:00Z' }, { metric_id: 'part-is.instance-hours-other-profile' }]) {
    const data = structuredClone(fixture.deployment); Object.assign(baseMetric(data), modification);
    assert.equal(parseIBMDeploymentPrice(fixture.plan, data, now), null);
  }
  const foreign = structuredClone(fixture.deployment);
  baseMetric(foreign).amounts = baseMetric(foreign).amounts.filter(amount => amount.country !== 'USA');
  assert.equal(parseIBMDeploymentPrice(fixture.plan, foreign, now), null);
});

test('IBM permits identical API duplicates but never chooses the cheapest conflicting meter', () => {
  const identical = structuredClone(fixture.deployment);
  identical.resources.push({ ...structuredClone(identical.resources[0]), deployment_id: 'another-identical-deployment' });
  const row = parseIBMDeploymentPrice(fixture.plan, identical, now);
  assert.equal(row.deploymentIds.length, 2);
  baseMetric({ resources: [identical.resources[1]] }).amounts.find(amount => amount.country === 'USA').prices[0].price = 0.001;
  assert.throws(() => parseIBMDeploymentPrice(fixture.plan, identical, now), /Ambiguous/);
});

test('IBM GPU specifications preserve exact L4 model, device count and source capacity without score inference', () => {
  const gpu = profiles['gx3-16x80x1l4'];
  const row = parseIBMDeploymentPrice(gpu.plan, gpu.deployment, now);
  assert.equal(row.gpu, 'NVIDIA L4');
  assert.equal(row.gpuCount, 1);
  assert.equal(row.vramGiB, 24);
  assert.equal(row.vramUnit, 'GB');
  assert.equal(row.vramCapacity.byteConvention, 'unspecified');
  assert.equal(row.vramCapacity.unit, 'GB');
  assert.equal(row.vcpus, 16);
  assert.equal(row.ramGiB, 80);
  assert.equal(row.geekbenchGpu, undefined);
  const flex = profiles['bxf-2x8'];
  const parsed = parseIBMDeploymentPrice(flex.plan, flex.deployment, now);
  assert.equal(parsed.cpuTenancy, 'full-share-flex-vCPU');
  assert.equal(parsed.hourlyUsd, baseMetric(flex.deployment).amounts.find(amount => amount.country === 'USA').prices[0].price);
});
