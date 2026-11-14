import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { attachBandwidth } from '../lib/bandwidth.js';

const data = JSON.parse(await readFile(new URL('../data/gpu-bandwidth.json', import.meta.url)));

test('A100 memory capacity and PCIe/SXM bandwidth remain distinct', () => {
  const gpu = {provider:'aws', gpu:'NVIDIA A100', gpuCount:8};
  assert.equal(attachBandwidth({...gpu,name:'p4d.24xlarge'}, data).bandwidthPerGpuGBps, 1555);
  assert.equal(attachBandwidth({...gpu,name:'p4de.24xlarge'}, data).bandwidthPerGpuGBps, 2039);
  assert.equal(attachBandwidth({provider:'azure',name:'Standard_NC24ads_A100_v4',gpu:'NVIDIA A100',gpuCount:1}, data).bandwidthPerGpuGBps, 1935);
  assert.equal(attachBandwidth({provider:'oracle',name:'BM.GPU.A100-v2.8',gpu:'NVIDIA A100 80GB',gpuCount:8}, data), null);
  assert.equal(attachBandwidth({...gpu,name:'unknown'}, data), null);
});

test('per-device bandwidth stays constant while capacity sums are explicitly labeled', () => {
  const result = attachBandwidth({provider:'ibm',gpu:'NVIDIA L40S',gpuCount:4,specSourceUrl:'https://cloud.ibm.com/docs/vpc'}, data);
  assert.equal(result.bandwidthPerGpuGBps,864);
  assert.equal(result.gpuMemoryBandwidthGBps,3456);
  assert.equal(result.bandwidthProvenance.measuredBenchmark,false);
  assert.equal(result.bandwidthProvenance.cloudClockVerified,false);
  assert.match(result.bandwidthProvenance.aggregation,/not a unified memory pool/);
  assert.ok(result.bandwidthSourceUrls.includes('https://cloud.ibm.com/docs/vpc'));
});

test('network/interconnect units and ambiguous or partial GPUs fail closed', () => {
  const instance={provider:'aws',gpu:'NVIDIA T4',gpuCount:1};
  for(const gpuCount of [0,0.5,1.5,-1,undefined,null,NaN,Infinity,'1']) {
    assert.equal(attachBandwidth({...instance,gpuCount},data),null);
  }
  assert.equal(attachBandwidth({...instance,gpuAllocation:'partitioned'},data),null);
  assert.equal(attachBandwidth({...instance,gpuSpecificationsStatus:'unverified-gpu-count'},data),null);
  assert.equal(attachBandwidth(instance,{...data,metric:'NVLink bandwidth'}),null);
  assert.equal(attachBandwidth(instance,{...data,unit:'Gb/s'}),null);
  const record=data.records.find(r=>r.id==='nvidia-t4');
  assert.equal(attachBandwidth(instance,{...data,records:[record,record]}),null);
});

test('primary source records have explicit byte-rate units and no invented VRAM conversion', () => {
  assert.equal(new Set(data.records.map(r=>r.id)).size,data.records.length);
  for(const record of data.records) {
    assert.equal(record.metric,'GPU on-device memory bandwidth');
    assert.equal(record.unit,'GB/s');
    assert.ok(Number.isFinite(record.perGpuGBps)&&record.perGpuGBps>0);
    assert.ok(Number.isFinite(Date.parse(record.retrievedAt)));
    assert.ok(record.sourceUrls.every(url=>url.startsWith('https://')));
  }
  const result=attachBandwidth({provider:'aws',name:'g5.xlarge',gpu:'NVIDIA A10G',gpuCount:1},data);
  assert.equal(result.bandwidthPerGpuGBps,600);
  assert.equal(result.bandwidthProvenance.hardwareMemoryPerGpuGB,24);
  assert.match(result.bandwidthProvenance.hardwareMemoryByteConvention,/not a conversion/);
  assert.equal(result.vramGiB,undefined);
});
