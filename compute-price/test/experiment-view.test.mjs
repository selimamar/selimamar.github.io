import test from 'node:test';
import assert from 'node:assert/strict';
import { renderExperiment } from '../lib/experiment-view.js';

test('CPU reference price evaluates the base M6 Mac mini without changing the fitted normalization', () => {
  const fit = { A: 0.25, logA: Math.log(0.25), keys: ['ramGiB', 'cpuScore'],
    reference: { ramGiB: 16, cpuScore: 5000 }, slopes: [0.4, 0.5] };
  const report = { cpu: { displayed: { fit } } };
  const original = structuredClone(report);
  const html = renderExperiment(report, 'cpu');

  // 0.25 × sqrt(20,525 / 5,000) = 0.50652, rounded to three decimals.
  assert.match(html, /reference-amount">\$0\.507 <span>USD\/hour<\/span>/);
  assert.match(html, /Base Mac mini M6/);
  assert.match(html, /16 GB unified memory/);
  assert.match(html, /20,525 Geekbench 6 CPU score/);
  assert.match(html, /P = 0\.25 × \(R\/16\)<sup>0\.4<\/sup> × \(C\/5,000\)<sup>0\.5<\/sup>/);
  assert.deepEqual(report, original);
});
