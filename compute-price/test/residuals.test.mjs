import test from 'node:test';
import assert from 'node:assert/strict';
import { residualDiagnostics, gaussianDensity, residualHistogram } from '../lib/residuals.js';
import { renderResidualDiagnostics } from '../lib/residual-view.js';

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual-expected) < tolerance, `${actual} != ${expected}`);

test('Gaussian MLE fits signed log-price errors without forcing zero bias or using dollar errors', () => {
  const errors = [-Math.log(2), 0, Math.log(2)].map(error => error + 0.2);
  const validation = { method: 'Held-out families', predictions: errors.map((error, i) => ({
    id: `vm${i}`, family: `family${i%2}`, predicted: 10 ** i, actual: 10 ** i * Math.exp(error),
  })) };
  const original = structuredClone(validation);
  const stats = residualDiagnostics(validation);
  near(stats.mean, 0.2);
  near(stats.sigma, Math.log(2)*Math.sqrt(2/3));
  near(stats.rmsle, Math.sqrt(0.2**2+stats.sigma**2));
  assert.equal(stats.familyCount, 2);
  near(gaussianDensity(stats.mean, stats.gaussian), 1/(stats.sigma*Math.sqrt(2*Math.PI)));
  near(gaussianDensity(stats.mean-stats.sigma, stats.gaussian), gaussianDensity(stats.mean+stats.sigma, stats.gaussian));
  assert.deepEqual(validation, original);
});

test('invalid prices are excluded but exact zero residuals and finite logs of extreme prices are retained', () => {
  const stats = residualDiagnostics({ predictions: [
    { actual: 1, predicted: 1 }, { actual: 1e300, predicted: 1e-300 },
    { actual: 0, predicted: 1 }, { actual: -1, predicted: 1 },
    { actual: 1, predicted: NaN }, { actual: Infinity, predicted: 1 },
  ] });
  assert.equal(stats.sampleCount, 2);
  assert.equal(stats.excludedCount, 4);
  assert.equal(stats.rows[0].residual, 0);
  near(stats.rows[1].residual, 600*Math.log(10));
  assert.ok(Number.isFinite(stats.mean) && Number.isFinite(stats.sigma));
});

test('histogram counts both boundary values and its density integrates to one', () => {
  const rows = [-1, -0.5, 0, 0.5, 1].map(residual => ({ residual }));
  const bins = residualHistogram(rows, { min:-1, max:1, binCount:4 });
  assert.deepEqual(bins.map(bin=>bin.count), [1,1,1,2]);
  near(bins.reduce((sum, bin)=>sum+bin.density*(bin.high-bin.low),0),1);
  assert.deepEqual(residualHistogram(rows, { min:1, max:1, binCount:4 }), []);
});

test('empty and constant samples cannot produce a fictitious Gaussian', () => {
  assert.equal(residualDiagnostics().gaussian, null);
  const stats = residualDiagnostics({ predictions:[{actual:2,predicted:1},{actual:4,predicted:2}] });
  near(stats.sigma,0);
  assert.equal(stats.gaussian,null);
  assert.equal(gaussianDensity(0,{mean:0,sigma:0}),null);
  const html=renderResidualDiagnostics({predictions:[{actual:1,predicted:1}]},'cpu');
  assert.match(html,/Not enough variation/);
  assert.ok(!html.includes('NaN') && !html.includes('Infinity'));
  assert.equal(renderResidualDiagnostics(null,'cpu'),'');
});

test('both residual charts use all valid held-out observations, with no outlier trimming', () => {
  const validation={predictions:[
    {name:'held-out positive',actual:8,predicted:1},
    {name:'held-out negative',actual:1,predicted:8},
    {name:'exact prediction',actual:1,predicted:1},
    {name:'invalid sentinel',actual:0,predicted:1},
  ]};
  const html=renderResidualDiagnostics(validation,'gpu');
  assert.equal((html.match(/class="residual-dot"/g)??[]).length,3);
  assert.match(html,/class="residual-gaussian"/);
  assert.ok(html.includes('held-out positive') && html.includes('held-out negative'));
  assert.ok(!html.includes('invalid sentinel'));
  assert.match(html,/held-out predictions/);
});
