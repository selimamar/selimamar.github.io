export const METRICS = {
  ram: { label: 'Memory', resource: 'RAM', short: 'RAM', unit: 'GiB-hour', divisor: 'GiB of RAM' },
  vram: { label: 'GPU memory', resource: 'VRAM', short: 'VRAM', unit: 'GiB-hour', divisor: 'GiB of VRAM' },
  cpu: { label: 'CPU performance', resource: 'Geekbench 6', short: 'CPU', unit: '1k points-hour', divisor: 'Geekbench 6 multi-core score ÷ 1,000' },
};

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function metricValue(instance, metric) {
  const hourly = instance.hourlyUsd;
  if (!Number.isFinite(hourly) || hourly <= 0) return null;
  if (metric === 'ram' && (instance.gpu || instance.vramGiB > 0)) return null;
  const divisor = metric === 'ram' ? instance.ramGiB : metric === 'vram' ? instance.vramGiB : metric === 'cpu' ? instance.geekbench6Multi?.score / 1000 : null;
  if (!Number.isFinite(divisor) || divisor <= 0) return null;
  if (metric === 'cpu' && !instance.geekbench6Multi?.url) return null;
  return hourly / divisor;
}

export function eligibleInstances(instances, metric) {
  return instances.filter(instance => metricValue(instance, metric) !== null);
}

export function summarizeMetric(instances, metric) {
  const eligible = eligibleInstances(instances, metric);
  const values = eligible.map(instance => metricValue(instance, metric)).sort((a, b) => a - b);
  return { value: median(values), values, count: values.length, providers: new Set(eligible.map(instance => instance.provider)).size, min: values[0] ?? null, max: values.at(-1) ?? null };
}

export function sortInstances(instances, metric, order = 'unit-asc') {
  return [...instances].sort((a, b) => {
    const aValue = order === 'hourly-asc' ? a.hourlyUsd : metricValue(a, metric);
    const bValue = order === 'hourly-asc' ? b.hourlyUsd : metricValue(b, metric);
    return (order === 'unit-desc' ? bValue - aValue : aValue - bValue) || a.name.localeCompare(b.name);
  });
}

export function freshness(snapshot, now = Date.now()) {
  const timestamp = Date.parse(snapshot.updatedAt);
  const isOld = value => !Number.isFinite(Date.parse(value)) || now - Date.parse(value) > 36 * 60 * 60 * 1000;
  const stale = !Number.isFinite(timestamp) || now - timestamp > 36 * 60 * 60 * 1000
    || (snapshot.providers || []).some(provider => provider.checkedAt && isOld(provider.checkedAt))
    || (snapshot.providers || []).some(provider => provider.lastSuccessAt && isOld(provider.lastSuccessAt))
    || (snapshot.instances || []).some(instance => instance.observedAt && isOld(instance.observedAt));
  const failed = (snapshot.providers || []).filter(provider => provider.error || ['error', 'failed', 'stale'].includes(provider.status));
  return { stale, failed };
}
