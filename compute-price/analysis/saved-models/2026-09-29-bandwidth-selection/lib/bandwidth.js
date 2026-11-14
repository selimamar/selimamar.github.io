function matches(instance, mapping) {
  if (!mapping.providers?.includes(instance.provider)) return false;
  if (mapping.gpuNames && !mapping.gpuNames.includes(instance.gpu)) return false;
  if (mapping.namePattern && !new RegExp(mapping.namePattern).test(instance.name || '')) return false;
  if (mapping.familyPattern && !new RegExp(mapping.familyPattern).test(instance.family || '')) return false;
  return true;
}

/** Sourced on-device memory bandwidth; never PCIe, NVLink, or network bandwidth. */
export function attachBandwidth(instance, dataset) {
  if (!Number.isInteger(instance?.gpuCount) || instance.gpuCount <= 0 || !instance.gpu) return null;
  if (/fraction|partition|shared/i.test(instance.gpuAllocation ?? '')
    || instance.gpuSpecificationsStatus === 'unverified-gpu-count') return null;
  if (dataset?.metric !== 'GPU on-device memory bandwidth' || dataset?.unit !== 'GB/s') return null;
  const candidates = (dataset.records || []).filter(record =>
    record.metric === dataset.metric && record.unit === dataset.unit &&
    Number.isFinite(record.perGpuGBps) && record.perGpuGBps > 0 &&
    record.sourceUrls?.length && record.matches?.some(mapping => matches(instance, mapping))
  );
  if (candidates.length !== 1) return null;
  const record = candidates[0];
  const hardwareSourceUrl = instance.gpuSpecSourceUrl || instance.specSourceUrl || null;
  const sourceUrls = [...new Set([...record.sourceUrls, ...(record.mappingSourceUrls || []), ...(hardwareSourceUrl ? [hardwareSourceUrl] : [])])];
  return {
    bandwidthPerGpuGBps: record.perGpuGBps,
    gpuMemoryBandwidthGBps: record.perGpuGBps * instance.gpuCount,
    bandwidthSourceUrl: record.sourceUrls[0],
    bandwidthSourceUrls: sourceUrls,
    bandwidthHardwareVariant: record.hardwareVariant,
    bandwidthMetric: dataset.metric,
    bandwidthProvenance: {
      recordId: record.id,
      datasetVersion: dataset.version,
      retrievedAt: record.retrievedAt,
      sourceType: record.sourceType,
      sourceUrls,
      metric: dataset.metric,
      unit: dataset.unit,
      perGpuGBps: record.perGpuGBps,
      gpuCount: instance.gpuCount,
      aggregation: 'sum of separate full GPUs\' on-device peak memory bandwidth; not a unified memory pool or application throughput',
      measuredBenchmark: false,
      cloudClockVerified: false,
      hardwareMemoryPerGpuGB: record.hardwareMemoryPerGpuGB ?? null,
      hardwareMemoryByteConvention: 'manufacturer nominal GB; not a conversion to provider usable GiB',
      notes: record.notes,
    },
  };
}
