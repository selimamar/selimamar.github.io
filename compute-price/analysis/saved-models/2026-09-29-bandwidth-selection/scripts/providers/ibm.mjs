/** Public IBM Global Catalog prices. No credentials, estimates or OS-license add-ons. */
export const IBM_CATALOG_ROOT = 'https://globalcatalog.cloud.ibm.com/api/v1/';
export const IBM_PLANS_URL = IBM_CATALOG_ROOT + 'is.instance/plan?_limit=100';
export const IBM_SPEC_URL = 'https://cloud.ibm.com/docs/vpc?topic=vpc-profiles';
export const IBM_GPU_SPEC_URL = 'https://cloud.ibm.com/docs/vpc?topic=vpc-accelerated-profile-family';
const REGION = 'us-south · Dallas';
// Ordinary published profiles only. Excludes nano/shared options, confidential/high-frequency and select-availability accelerators.
const CPU_PROFILE = /^((?:[bcm]x(?:[34]d?|f)|vx3d))-(\d+)x(\d+)$/;
const GPU_PROFILE = /^(gx3)-(\d+)x(\d+)x(\d+)(l4|l40s)$/;

export function ibmProfileSpecifications(plan) {
  if (plan?.active !== true || plan.disabled !== false || plan.visibility?.restrictions !== 'public'
    || !plan.geo_tags?.includes('us-south') || plan.kind !== 'plan' || plan.parent_id !== 'is.instance'
    || !/^[0-9a-f-]{36}$/.test(plan.id ?? '')) return null;
  const cpu = CPU_PROFILE.exec(plan.name ?? ''), gpu = GPU_PROFILE.exec(plan.name ?? '');
  const matched = cpu ?? gpu;
  if (!matched) return null;
  const [, family, cores, memory] = matched;
  const vcpus = Number(cores), ramGiB = Number(memory);
  if (!(vcpus > 0) || !(ramGiB > 0)) return null;
  const result = { name: plan.name, family, vcpus, ramGiB, ramUnit: 'GiB', architecture: 'X86_64',
    cpuTenancy: family.endsWith('f') ? 'full-share-flex-vCPU' : 'dedicated-vCPU',
    acceleratorKind: gpu ? 'gpu' : null, specSourceUrl: IBM_SPEC_URL,
    specBasis: 'Exact publicly listed profile; IBM documents its name suffix as vCPU count × RAM in GiB.' };
  if (gpu) {
    const gpuCount = Number(gpu[4]), model = gpu[5] === 'l4' ? 'NVIDIA L4' : 'NVIDIA L40S';
    const capacityGB = gpuCount * (gpu[5] === 'l4' ? 24 : 48);
    Object.assign(result, { gpu: model, gpuCount, vramGiB: capacityGB, vramUnit: 'GB',
      gpuSpecificationsStatus: 'sourced', gpuSpecSourceUrl: IBM_GPU_SPEC_URL,
      vramCapacity: { value: capacityGB, unit: 'GB', byteConvention: 'unspecified', basis: 'provider-published nominal accelerator capacity', sourceUrl: IBM_GPU_SPEC_URL } });
  }
  return result;
}

function currentPeriod(value, now) {
  const from = Date.parse(value?.effective_from ?? ''), until = value?.effective_until ? Date.parse(value.effective_until) : Infinity;
  return Number.isFinite(from) && from <= now && until >= now;
}

export function parseIBMDeploymentPrice(plan, data, observedAt) {
  const spec = ibmProfileSpecifications(plan);
  if (!spec) return null;
  if (!Array.isArray(data?.resources)) throw new Error(`Malformed IBM deployment prices for ${plan.name}`);
  const now = Date.parse(observedAt);
  if (!Number.isFinite(now)) throw new Error('Invalid IBM price observation time');
  const candidates = [];
  for (const deployment of data.resources) {
    if (deployment.deployment_region !== 'us-south' || deployment.deployment_location !== 'us-south'
      || deployment.type !== 'Paid' || deployment.origin !== 'pricing_catalog' || !currentPeriod(deployment, now)) continue;
    for (const metric of deployment.metrics ?? []) {
      if (metric.charge_unit_name !== 'INSTANCE_HOURS_MULTI_TENANT' || metric.charge_unit !== 'Instance-Hour'
        || metric.charge_unit_quantity !== 1 || metric.tier_model !== 'Linear Tier'
        || metric.metric_id !== `part-is.instance-hours-${plan.name}` || !currentPeriod(metric, now)) continue;
      const amounts = (metric.amounts ?? []).filter(amount => amount.country === 'USA' && amount.currency === 'USD');
      if (amounts.length !== 1 || amounts[0].prices?.length !== 1) continue;
      const price = amounts[0].prices[0];
      if (price.quantity_tier !== 1 || !Number.isFinite(price.price) || price.price <= 0) continue;
      candidates.push({ hourlyUsd: price.price, metricId: metric.metric_id, deploymentId: deployment.deployment_id,
        effectiveFrom: metric.effective_from, effectiveUntil: metric.effective_until ?? null });
    }
  }
  if (!candidates.length) return null;
  const signatures = new Set(candidates.map(candidate => JSON.stringify([candidate.hourlyUsd, candidate.metricId, candidate.effectiveFrom, candidate.effectiveUntil])));
  if (signatures.size !== 1) throw new Error(`Ambiguous IBM public rate for ${plan.name}`);
  const price = candidates[0];
  return { id: `ibm:${plan.name}`, provider: 'ibm', ...spec, region: REGION,
    hourlyUsd: price.hourlyUsd, observedAt, billingKind: 'on-demand',
    priceSourceUrl: `${IBM_CATALOG_ROOT}${plan.id}/pricing/deployment`,
    planId: plan.id, metricId: price.metricId, deploymentIds: [...new Set(candidates.map(candidate => candidate.deploymentId))],
    priceEffectiveAt: price.effectiveFrom, priceEffectiveUntil: price.effectiveUntil,
    includes: 'Complete public multi-tenant VM hourly base rate with full CPU share. Linux without paid OS add-ons; bundled instance storage remains included. Separate boot/data volumes, public IPs, traffic and tax excluded.' };
}

async function getJSON(url, fetcher) {
  if (new URL(url).origin !== 'https://globalcatalog.cloud.ibm.com') throw new Error('Unexpected IBM catalog pagination host');
  const response = await fetcher(url, { signal: AbortSignal.timeout(35000) });
  if (!response.ok) throw new Error(`IBM public catalog returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchIBMCatalog(fetcher = fetch, now = new Date().toISOString()) {
  const plans = [], ids = new Set();
  let url = IBM_PLANS_URL;
  for (let page = 0; url && page < 10; page++) {
    const data = await getJSON(url, fetcher);
    if (!Array.isArray(data.resources)) throw new Error('IBM catalog returned no plan list');
    for (const plan of data.resources) {
      if (ids.has(plan.id)) throw new Error('Duplicate IBM plan across catalog pages');
      ids.add(plan.id); plans.push(plan);
    }
    url = data.next ?? null;
  }
  if (url) throw new Error('IBM catalog exceeded pagination limit');
  const eligible = plans.filter(plan => ibmProfileSpecifications(plan));
  const instances = []; let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, eligible.length) }, async () => {
    while (cursor < eligible.length) {
      const plan = eligible[cursor++];
      let next = `${IBM_CATALOG_ROOT}${plan.id}/pricing/deployment`, resources = [];
      for (let page = 0; next && page < 10; page++) {
        const data = await getJSON(next, fetcher);
        if (!Array.isArray(data.resources)) throw new Error(`Malformed IBM prices for ${plan.name}`);
        resources.push(...data.resources); next = data.next ?? null;
      }
      if (next) throw new Error('IBM deployment prices exceeded pagination limit');
      const row = parseIBMDeploymentPrice(plan, { resources }, now);
      if (row) instances.push(row);
    }
  }));
  if (instances.length < 50) throw new Error(`IBM catalog unexpectedly incomplete (${instances.length} eligible rates)`);
  return { instances: instances.sort((a, b) => a.name.localeCompare(b.name)), metadata: {
    publicPlansObserved: plans.length, eligiblePlans: eligible.length, pricedShapes: instances.length,
    sourceUrl: IBM_PLANS_URL, specSourceUrl: IBM_SPEC_URL, observedAt: now,
    scope: 'Dallas regional public USD full-share multi-tenant Linux base prices for exact named profiles. Public plans are filtered to ordinary-access CPU and generally available L4/L40S GPU families.',
    exclusions: 'Generic component plans, reserved/Spot/dedicated-host/fractional-share meters, paid OS add-ons, nano/confidential/high-frequency profiles and select-availability accelerators. No prices inferred from another profile.',
  } };
}
