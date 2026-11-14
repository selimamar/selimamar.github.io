import reference from '../data/reference-machine.json' with { type: 'json' };

export const REFERENCE_MACHINE = Object.freeze(reference);
export const MODEL_REFERENCE = Object.freeze({ ramGiB: reference.ramGiB, cpuScore: reference.cpuScore,
  gpuCount: reference.gpuCount, bandwidthPerGpuGBps: reference.bandwidthPerGpuGBps });

export function referenceDescription(kind) {
  const cpu = `${reference.memoryLabel} · ${reference.cpuScore.toLocaleString('en-US')} Geekbench 6 CPU score`;
  return kind === 'gpu' ? `${reference.gpuReferenceLabel} · ${cpu} · ${reference.bandwidthPerGpuGBps.toLocaleString('en-US')} GB/s bandwidth` : `${reference.label} · ${cpu}`;
}
