import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPlotPoints, renderReferenceHistory } from '../lib/reference-history-view.js';

test('historical chart preserves dated missing observations and excludes invalid or older dates', () => {
  const history = { points: [
    { date: '2010-01-01', cpu: { hourlyUsd: 9 } },
    { date: '2026-09-29', cpu: { hourlyUsd: 0.5 } },
    { date: '2018-10-11', cpu: { hourlyUsd: null } },
    { date: '2016-10-26', cpu: { hourlyUsd: 2 } },
    { date: 'bad-date', cpu: { hourlyUsd: 4 } },
  ] };
  assert.deepEqual(historyPlotPoints(history, 'cpu').map(p => [p.date, p.value]), [
    ['2016-10-26', 2], ['2018-10-11', null], ['2026-09-29', 0.5],
  ]);
  const html = renderReferenceHistory(history, 'cpu');
  const plots = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  assert.equal(plots.length, 2);
  for (const plot of plots) assert.equal((plot.match(/<circle /g) ?? []).length, 2);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((html.match(/class="history-line"/g) ?? []).length, 0);
  assert.ok(!html.includes('NaN') && !html.includes('Infinity'));
});

test('historical CPU and GPU series keep their separate prices', () => {
  const history = { points: [{ date: '2026-09-29', cpu: { hourlyUsd: 0.5 }, gpu: { hourlyUsd: 1.25 } }] };
  assert.match(renderReferenceHistory(history, 'cpu'), /\$0\.500 per hour/);
  assert.match(renderReferenceHistory(history, 'gpu'), /\$1\.250 per hour/);
  assert.deepEqual(historyPlotPoints(history, 'data'), []);
});
