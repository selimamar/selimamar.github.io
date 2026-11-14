import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'robots.txt', 'lib/metrics.js', 'lib/model.js', 'lib/regression.js', 'lib/fp32.js', 'lib/bandwidth.js', 'lib/gpu-resource-models.js', 'lib/gpu-resource-view.js', 'lib/gpu-resource-charts.js', 'lib/experiments.js', 'lib/experiment-view.js', 'lib/fit-data-view.js', 'data/prices.json', 'data/price-catalog.json', 'data/benchmarks.json', 'data/cpu-benchmarks-expanded.json', 'data/gpu-cpu-benchmarks.json', 'data/gpu-model-benchmarks.json', 'data/gpu-fp32.json', 'data/gpu-bandwidth.json', 'data/gpu-resource-experiments.json', 'data/sparecores-benchmarks.json', 'data/model.json', 'data/experiments.json'];
files.push('lib/residuals.js', 'lib/residual-view.js', 'data/residual-diagnostics.json', 'output/pdf/compute-price-methodology.pdf', 'lib/reference-history.js', 'lib/reference-history-view.js', 'data/reference-history.json', 'data/historical-benchmark-mapping.json', 'data/historical-aws-prices.json', 'lib/reference-machine.js', 'data/reference-machine.json');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.json': 'application/json' };
const assets = {};
for (const name of files) {
  const isPdf = path.extname(name) === '.pdf';
  const bytes = await readFile(path.join(root, name));
  assets[`/${name}`] = isPdf
    ? { body: bytes.toString('base64'), encoding: 'base64', type: 'application/pdf' }
    : { body: bytes.toString('utf8'), type: `${types[path.extname(name)]}; charset=utf-8` };
  const destination = path.join(root, 'dist', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, name), destination);
}
assets['/'] = assets['/index.html'];

// Embedded assets make the same Worker portable to hosts without an ASSETS binding.
const entry = `
import handler from './worker/index.js';
const assets = ${JSON.stringify(assets)};
const embeddedAssets = {
  async fetch(request) {
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    const asset = assets[new URL(request.url).pathname];
    if (!asset) return new Response('Not found', {status:404});
    const body = request.method === 'HEAD' ? null : asset.encoding === 'base64'
      ? Uint8Array.from(atob(asset.body), character => character.charCodeAt(0)) : asset.body;
    return new Response(body, {headers:{
      'Content-Type':asset.type,
      'Cache-Control':asset.type.startsWith('application/json') ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin'
    }});
  }
};
export default {
  fetch(request, env = {}, ctx) { return handler.fetch(request, {...env, ASSETS: env.ASSETS || embeddedAssets}, ctx); },
  scheduled(controller, env = {}, ctx) { return handler.scheduled(controller, {...env, ASSETS: env.ASSETS || embeddedAssets}, ctx); }
};
`;
await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'site-entry.js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(root, 'dist/_worker.js'), minify: true, logLevel: 'info' });
console.log('Built static site and self-contained daily-price Worker in dist/.');
