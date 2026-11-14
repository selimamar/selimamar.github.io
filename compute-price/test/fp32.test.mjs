import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { attachFP32 } from '../lib/fp32.js';

const data = JSON.parse(await readFile(new URL('../data/gpu-fp32.json', import.meta.url)));

test('cloud-specific variants retain their actual published FP32 rating', () => {
  assert.equal(attachFP32({provider:'aws', name:'g5.xlarge', gpu:'NVIDIA A10G', gpuCount:1}, data).gpuFp32Tflops, 35);
  assert.equal(attachFP32({provider:'oracle', gpu:'NVIDIA A10', gpuCount:1}, data).gpuFp32Tflops, 31.2);
  assert.equal(attachFP32({provider:'gcp', family:'n1-v100', gpu:'NVIDIA V100', gpuCount:1}, data).gpuFp32Tflops, 15.6);
  assert.equal(attachFP32({provider:'aws', name:'p3.2xlarge', gpu:'NVIDIA V100', gpuCount:1}, data).gpuFp32Tflops, 15.7);
});

test('whole-device aggregation is explicitly hardware capacity, not benchmark scaling', () => {
  const result = attachFP32({provider:'ibm', gpu:'NVIDIA L40S', gpuCount:4, specSourceUrl:'https://cloud.ibm.com/docs/vpc'}, data);
  assert.equal(result.gpuFp32Tflops, 366.4);
  assert.equal(result.fp32PerGpuTflops, 91.6);
  assert.equal(result.fp32Provenance.measuredBenchmark, false);
  assert.equal(result.fp32Provenance.cloudClockVerified, false);
  assert.ok(result.fp32SourceUrls.includes('https://cloud.ibm.com/docs/vpc'));
});

test('fractional, missing, and conflicting hardware is excluded rather than imputed', () => {
  for (const gpuCount of [undefined, null, 0, -1, 0.5, 1.5, '1', NaN, Infinity]) {
    assert.equal(attachFP32({provider:'aws', gpu:'NVIDIA L4', gpuCount}, data), null);
  }
  assert.equal(attachFP32({provider:'aws', name:'unknown', gpu:'NVIDIA H100', gpuCount:1}, data), null);
  assert.equal(attachFP32({provider:'alibaba', family:'ecs.gn9gc', gpu:'L20N 72G', gpuCount:1}, data), null);
  assert.equal(attachFP32({provider:'oracle', gpu:'NVIDIA V100', gpuCount:1}, data), null);
  assert.equal(attachFP32({provider:'unknown', gpu:'NVIDIA T4', gpuCount:1}, data), null);
  assert.equal(attachFP32({provider:'aws', gpu:'NVIDIA L4', gpuCount:1, gpuAllocation:'fractional'}, data), null);
  assert.equal(attachFP32({provider:'azure', gpu:'NVIDIA A10', gpuCount:1, gpuSpecificationsStatus:'unverified-gpu-count'}, data), null);
});

test('FP32 fields cannot silently accept tensor or sparse specifications', () => {
  const instance = {provider:'aws', gpu:'NVIDIA T4', gpuCount:1};
  assert.equal(attachFP32(instance, {...data, metric:'TF32 tensor peak'}), null);
  assert.equal(attachFP32(instance, {...data, unit:'GFLOPS'}), null);
  const t4 = data.records.find(record => record.id === 'nvidia-t4');
  assert.equal(attachFP32(instance, {...data, records:[{...t4,metric:'FP16 sparse tensor'}]}), null);
  assert.equal(attachFP32(instance, {...data, records:[t4,t4]}), null);
});

test('all published records carry primary sources and explicit units', () => {
  assert.equal(new Set(data.records.map(record=>record.id)).size, data.records.length);
  for (const record of data.records) {
    assert.equal(record.metric, 'FP32 dense vector peak');
    assert.equal(record.unit, 'TFLOPS');
    assert.ok(record.perGpuTflops > 0);
    assert.ok(Number.isFinite(Date.parse(record.retrievedAt)));
    assert.ok(record.sourceUrls.every(url=>url.startsWith('https://')));
  }
});
