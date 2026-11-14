function matches(instance, mapping) {
  if (!mapping.providers?.includes(instance.provider)) return false;
  if (mapping.gpuNames && !mapping.gpuNames.includes(instance.gpu)) return false;
  if (mapping.namePattern && !new RegExp(mapping.namePattern).test(instance.name || '')) return false;
  if (mapping.familyPattern && !new RegExp(mapping.familyPattern).test(instance.family || '')) return false;
  return true;
}

/** Attach sourced hardware capacity; this never scales a measured benchmark. */
export function attachFP32(instance, dataset) {
  if (!Number.isInteger(instance?.gpuCount) || instance.gpuCount <= 0 || !instance.gpu) return null;
  if (/fraction|partition|shared/i.test(instance.gpuAllocation ?? '')
    || instance.gpuSpecificationsStatus === 'unverified-gpu-count') return null;
  if (dataset?.metric !== 'FP32 dense vector peak' || dataset?.unit !== 'TFLOPS') return null;
  const candidates = (dataset.records || []).filter(record =>
    record.metric === dataset.metric && record.unit === dataset.unit &&
    Number.isFinite(record.perGpuTflops) && record.perGpuTflops > 0 &&
    record.sourceUrls?.length && record.matches?.some(mapping => matches(instance, mapping))
  );
  // Ambiguous matches fail closed instead of taking whichever record appears first.
  if (candidates.length !== 1) return null;
  const record = candidates[0];
  const hardwareSourceUrl = instance.gpuSpecSourceUrl || instance.specSourceUrl || null;
  const sourceUrls = [...new Set([...record.sourceUrls, ...(record.mappingSourceUrls || []), ...(hardwareSourceUrl ? [hardwareSourceUrl] : [])])];
  return {
    gpuFp32Tflops: record.perGpuTflops * instance.gpuCount,
    fp32PerGpuTflops: record.perGpuTflops,
    fp32SourceUrl: record.sourceUrls[0],
    fp32SourceUrls: sourceUrls,
    fp32HardwareVariant: record.hardwareVariant,
    fp32Metric: dataset.metric,
    fp32Provenance: {
      recordId: record.id,
      datasetVersion: dataset.version,
      retrievedAt: record.retrievedAt,
      sourceType: record.sourceType,
      sourceUrls,
      metric: dataset.metric,
      unit: dataset.unit,
      perGpuTflops: record.perGpuTflops,
      gpuCount: instance.gpuCount,
      aggregation: 'per-GPU theoretical FP32 peak × full identical GPU count',
      measuredBenchmark: false,
      cloudClockVerified: false,
      notes: record.notes,
    },
  };
}
