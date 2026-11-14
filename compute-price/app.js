import { buildModelDataset } from './lib/model.js';
import { fitExperiments, experimentDataSignature, EXPERIMENT_VERSION } from './lib/experiments.js';
import { attachFP32 } from './lib/fp32.js';
import { attachBandwidth } from './lib/bandwidth.js';
import { fitGpuResourceExperiments, resourceDataSignature } from './lib/gpu-resource-models.js';
import { renderGpuBandwidthModel, displayedGpuResourceModel } from './lib/gpu-resource-view.js';
import { renderExperiment, displayedExperiment } from './lib/experiment-view.js';
import { getFitDataRows, filterFitDataRows, fitDataHead, renderFitDataRows } from './lib/fit-data-view.js';
import { buildCurrentAwsHistoryPoint } from './lib/reference-history.js';
import { renderReferenceHistory } from './lib/reference-history-view.js';
import { renderResidualDiagnostics } from './lib/residual-view.js';
import { residualDiagnostics } from './lib/residuals.js';
import { REFERENCE_MACHINE } from './lib/reference-machine.js';

const $ = selector => document.querySelector(selector);
const catalogUrl = document.querySelector('[data-compute-app]')?.dataset.catalogUrl ?? '/api/catalog';
const staticPublication = !!document.querySelector('[data-compute-app]');
const date = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
let catalog, report, resourceReport, dataset, savedFallback = false;
let referenceHistory;
let refreshStatus;
let selectedModel = new URLSearchParams(location.search).get('model') === 'gpu' ? 'gpu' : 'cpu';
let selectedView = new URLSearchParams(location.search).get('view') === 'data' ? 'data' : 'model';
let visibleLimit = 25, visibleFitRows = [];
let resourcePredictions = new Map(), matchedRows = new Map();
const selectedRows = kind => kind === 'gpu' ? (displayedGpuResourceModel(resourceReport)?.fit ? resourceReport.rows ?? [] : []) : report ? displayedExperiment(report, kind)?.rows ?? [] : [];
const providerName = id => ({ aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud', alibaba: 'Alibaba Cloud', oracle: 'Oracle Cloud', ibm: 'IBM Cloud' })[id] ?? id;

function updateAddress() {
  const address = new URL(location.href);
  address.searchParams.set('model', selectedModel);
  if (selectedView === 'data') address.searchParams.set('view', 'data');
  else address.searchParams.delete('view');
  address.hash = 'prices';
  history.replaceState(null, '', address);
}

function prepareDataFilters() {
  $('#fit-model').value = selectedModel;
  const rows = getFitDataRows(report, resourceReport, dataset?.annotated ?? [], selectedModel);
  const previousProvider = $('#fit-provider').value;
  const providers = [...new Set(rows.map(row => row.provider))].sort((a, b) => providerName(a).localeCompare(providerName(b)));
  $('#fit-provider').replaceChildren(new Option('All providers', 'all'), ...providers.map(id => new Option(providerName(id), id)));
  $('#fit-provider').value = providers.includes(previousProvider) ? previousProvider : 'all';
}

function renderFitData() {
  if (!report) return;
  const rows = getFitDataRows(report, resourceReport, dataset.annotated, selectedModel);
  visibleFitRows = filterFitDataRows(rows, {
    provider: $('#fit-provider').value,
    search: $('#fit-search').value,
    sort: $('#fit-sort').value,
  });
  const shown = Math.min(visibleLimit, visibleFitRows.length);
  $('#fit-data-context').textContent = `${visibleFitRows.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} ${selectedModel.toUpperCase()} configurations · USD/hour`;
  $('#fit-data-note').textContent = selectedModel === 'gpu'
    ? 'Machines used to fit the GPU bandwidth contribution. The CPU sample fits the bundled CPU/RAM host. Estimates withhold each machine’s family.'
    : 'Machines used to fit the CPU equation and the GPU model’s CPU/RAM host. Estimates withhold each machine’s family.';
  $('#fit-data-head').innerHTML = fitDataHead(selectedModel);
  $('#fit-data-body').innerHTML = renderFitDataRows(visibleFitRows, selectedModel, { limit: visibleLimit });
  $('#fit-data-count').textContent = `Showing ${shown.toLocaleString('en-US')} of ${visibleFitRows.length.toLocaleString('en-US')}`;
  $('#show-more').hidden = visibleLimit >= visibleFitRows.length;
  $('#download-fit-csv').disabled = !visibleFitRows.length;
}

function renderModel() {
  for (const button of document.querySelectorAll('[data-model]')) {
    const active = selectedView === 'model' && button.dataset.model === selectedModel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('#data-tab').classList.toggle('active', selectedView === 'data');
  $('#data-tab').setAttribute('aria-pressed', String(selectedView === 'data'));
  $('#model-content').hidden = selectedView === 'data';
  $('#data-content').hidden = selectedView !== 'data';
  $('#model-heading').textContent = selectedView === 'data' ? 'Data behind the fit' : selectedModel === 'gpu' ? 'GPU compute' : 'CPU compute';
  if (selectedView === 'data') {
    prepareDataFilters();
    renderFitData();
    return;
  }
  const model = selectedModel === 'gpu'
    ? renderGpuBandwidthModel(resourceReport)
    : renderExperiment(report, 'cpu');
  const validation = selectedModel === 'gpu' ? displayedGpuResourceModel(resourceReport)?.validation : displayedExperiment(report, 'cpu')?.validation;
  $('#model-content').innerHTML = model + renderResidualDiagnostics(validation, selectedModel) + renderReferenceHistory(referenceHistory, selectedModel);
}

function renderContext() {
  const stale = Date.now() - Date.parse(catalog.updatedAt) > 36 * 3600000;
  const failures = catalog.providers.filter(p => p.status !== 'fresh');
  $('#snapshot-status').textContent = `${savedFallback ? 'Saved model' : stale ? 'Saved prices' : 'Prices checked'} · ${date(report.priceUpdatedAt)} UTC`;
  const notices = [];
  if (stale) notices.push('Showing a dated snapshot. New prices are not yet available.');
  if (savedFallback && !stale) notices.push('Live prices are unavailable. Showing the saved snapshot.');
  if (failures.length) notices.push(`Refresh incomplete for ${failures.map(p=>p.name).join(', ')}; retained prices keep their original dates.`);
  if (refreshStatus?.status === 'retained') notices.push('The daily refresh did not complete. Showing the last verified snapshot.');
  $('#data-notice').hidden = !notices.length;
  $('#data-notice').textContent = notices.join(' ');
  $('#download-csv').disabled = false;
}

async function json(path) { const r = await fetch(new URL(path, import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(45000)}); if(!r.ok) throw new Error(`Unable to load ${path}`); return r.json(); }
async function init() {
  try {
    const [priceResult, original, expanded, gpuCpu, spare, gpu, fp32, saved, bandwidth, savedResources, savedHistory, savedRefreshStatus] = await Promise.all([
      json(catalogUrl).catch(()=>{savedFallback=true;return json('./data/price-catalog.json');}),
      json('./data/benchmarks.json'),json('./data/cpu-benchmarks-expanded.json'),json('./data/gpu-cpu-benchmarks.json'),json('./data/sparecores-benchmarks.json'),json('./data/gpu-model-benchmarks.json'),json('./data/gpu-fp32.json'),json('./data/experiments.json').catch(()=>null),json('./data/gpu-bandwidth.json'),json('./data/gpu-resource-experiments.json').catch(()=>null),json('./data/reference-history.json').catch(()=>null),staticPublication ? json('./data/refresh-status.json').catch(()=>null) : null
    ]);
    catalog = priceResult;
    referenceHistory = savedHistory;
    refreshStatus = savedRefreshStatus;
    const sources = [original,expanded,gpuCpu,spare];
    const asOf = Date.parse(catalog.updatedAt);
    dataset = buildModelDataset(catalog,sources,gpu,{now:asOf});
    dataset.annotated = dataset.annotated.map(row => ({ ...row, ...(attachFP32(row, fp32) ?? {}), ...(attachBandwidth(row, bandwidth) ?? {}) }));
    const signature = experimentDataSignature(catalog, sources, gpu, fp32);
    if (saved?.experimentVersion === EXPERIMENT_VERSION && saved.priceUpdatedAt === catalog.updatedAt && saved.sourceDataSignature === signature) report = saved;
    else if (Date.now()-asOf<=36*3600000) report = fitExperiments(catalog,sources,gpu,fp32);
    else throw new Error('No matching dated price model available');
    const resourceSignature = resourceDataSignature(catalog,sources,gpu,fp32,bandwidth);
    if (savedResources?.priceUpdatedAt === catalog.updatedAt && savedResources.sourceDataSignature === resourceSignature) resourceReport = savedResources;
    else if (Date.now()-asOf<=36*3600000) resourceReport = fitGpuResourceExperiments(catalog,sources,gpu,fp32,bandwidth);
    matchedRows = new Map(selectedRows('cpu').map(row => [row.id, row]));
    resourcePredictions = new Map();
    for (const variant of [...(resourceReport?.variants ?? []), ...(resourceReport?.singleResourceComparison?.variants ?? [])]) for (const row of variant.validation?.predictions ?? []) {
      const values = resourcePredictions.get(row.id) ?? {};
      values[variant.id] = row.predicted; resourcePredictions.set(row.id,values);
    }
    renderContext();renderModel();
    updateHistoricalEndpoint();
    const modelAnchor = ['#gpu-log-plots','#gpu-vram-comparison'].includes(location.hash) ? '#gpu-bandwidth-fit' : location.hash;
    if (['#gpu-bandwidth-fit','#gpu-bandwidth-model','#prices','#reference-history','#residuals'].includes(modelAnchor)) requestAnimationFrame(() => $(modelAnchor)?.scrollIntoView({ block: 'start' }));
  } catch(error) {
    $('#snapshot-status').textContent='The price model could not be loaded';
    $('#model-content').innerHTML='<div class="empty-model"><h3>Data temporarily unavailable.</h3><p>Please refresh this page to try again. We do not estimate missing input data.</p></div>';
    $('#download-csv').disabled = true;
    $('#fit-data-context').textContent = 'Fit data is currently unavailable.';
    console.error(error);
  }
}

async function updateHistoricalEndpoint() {
  if (!referenceHistory) return;
  const observedAt = catalog.providers.find(provider => provider.id === 'aws')?.lastSuccessAt ?? catalog.updatedAt;
  const newest = Math.max(...referenceHistory.points.map(point => Date.parse(point.publicationDate)));
  if (!(Date.parse(observedAt) > newest)) return;
  try {
    const mapping = await json('./data/historical-benchmark-mapping.json');
    const point = buildCurrentAwsHistoryPoint(catalog, mapping);
    if (!point.cpu?.hourlyUsd) return;
    referenceHistory = { ...referenceHistory, generatedAt: new Date().toISOString(), points: [
      ...referenceHistory.points.filter(previous => !(previous.kind === 'current-catalog' && previous.date === point.date)), point,
    ].sort((a, b) => Date.parse(a.publicationDate) - Date.parse(b.publicationDate)) };
    if (selectedView === 'model') renderModel();
  } catch (error) { console.warn('Retaining the dated historical reconstruction.', error); }
}
for (const button of document.querySelectorAll('[data-model]')) button.addEventListener('click', () => {
  selectedModel = button.dataset.model;
  selectedView = 'model';
  visibleLimit = 25;
  updateAddress();
  if (report) renderModel();
});
$('#data-tab').addEventListener('click', () => {
  selectedView = 'data';
  visibleLimit = 25;
  updateAddress();
  if (report) renderModel();
});
$('#fit-model').addEventListener('change', () => {
  selectedModel = $('#fit-model').value;
  visibleLimit = 25;
  $('#fit-provider').value = 'all';
  updateAddress();
  prepareDataFilters();
  renderFitData();
});
for (const id of ['#fit-provider', '#fit-search', '#fit-sort']) $(id).addEventListener(id === '#fit-search' ? 'input' : 'change', () => {
  visibleLimit = 25;
  renderFitData();
});
$('#show-more').addEventListener('click', () => { visibleLimit += 25; renderFitData(); });
function downloadCsv(sourceRows, label) {
  const fields=['provider','configuration','region','vcpus','ram_value','ram_unit','vram_value','vram_unit','gpu_count','gpu_model','cpu_gb6_multi','gpu_gb7_opencl_proxy','gpu_fp32_total_tflops','gpu_fp32_per_gpu_tflops','gpu_fp32_hardware_variant','gpu_fp32_sources','gpu_fp32_provenance','gpu_bandwidth_per_gpu_gb_s','gpu_bandwidth_sources','gpu_bandwidth_provenance','hourly_usd','cpu_held_out_usd','bandwidth_linear_gpu_held_out_usd','additive_gpu_held_out_usd','multiplicative_gpu_held_out_usd','observed_at','price_source','cpu_source','gpu_source','cpu_data_attribution'];
  const quote=v=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  const rows=sourceRows.map(row=>[row.provider,row.name,row.region,row.vcpus,row.ramGiB,row.ramUnit??'GiB',row.vramGiB,row.vramGiB?(row.vramUnit??'GiB'):'',row.gpuCount,row.gpu,row.cpuScore,row.gpuScore,row.gpuFp32Tflops,row.fp32PerGpuTflops,row.fp32HardwareVariant,row.fp32SourceUrls?.join(' | ')??row.fp32SourceUrl,typeof row.fp32Provenance==='object'?JSON.stringify(row.fp32Provenance):row.fp32Provenance,row.bandwidthPerGpuGBps,row.bandwidthSourceUrls?.join(' | '),row.bandwidthProvenance?JSON.stringify(row.bandwidthProvenance):null,row.hourlyUsd,matchedRows.get(row.id)?.heldOutPrice,resourcePredictions.get(row.id)?.['gpu-bandwidth-linear'],resourcePredictions.get(row.id)?.['gpu-resource-additive'],resourcePredictions.get(row.id)?.['gpu-resource-multiplicative'],row.observedAt,row.priceSourceUrl,row.cpuBenchmarks?.map(b=>b.url).join(' | '),row.gpuBenchmark?.url,row.cpuBenchmarks?.some(b=>b.sourceType==='sparecores-original-measured-output')?'Adapted from Spare Cores; CC BY-SA 4.0; https://creativecommons.org/licenses/by-sa/4.0/':'']);
  const link=document.createElement('a'), objectUrl=URL.createObjectURL(new Blob([[fields,...rows].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  link.href=objectUrl;link.download=`compute-price-${label}-${report.priceUpdatedAt.slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
$('#download-csv').addEventListener('click', () => { if (dataset && report) downloadCsv(dataset.annotated, 'catalog'); });
$('#download-fit-csv').addEventListener('click', () => { if (report && visibleFitRows.length) downloadCsv(visibleFitRows, `${selectedModel}-fit`); });
$('#model-content').addEventListener('click', event => {
  if (event.target.closest('#download-residuals') && report) {
    event.preventDefault();
    const active = selectedModel === 'gpu' ? displayedGpuResourceModel(resourceReport) : displayedExperiment(report, 'cpu');
    const payload = { model: active.id, priceUpdatedAt: report.priceUpdatedAt, ...residualDiagnostics(active.validation) };
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    link.href = objectUrl; link.download = `compute-price-${selectedModel}-residuals.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }
  if (!event.target.closest('#download-history') || !referenceHistory) return;
  event.preventDefault();
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(referenceHistory, null, 2)], { type: 'application/json' }));
  link.href = objectUrl; link.download = 'compute-price-reference-history.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});
$('#download-model').addEventListener('click', event => {
  if (!report) return;
  event.preventDefault();
  const payload = { ...report, referenceMachine: REFERENCE_MACHINE, displayedModels: { cpu: report.cpu?.displayed?.id, gpu: displayedGpuResourceModel(resourceReport)?.id }, gpuResourceComparison: resourceReport,
    residualDiagnostics: { cpu: residualDiagnostics(report.cpu?.displayed?.validation), gpu: residualDiagnostics(displayedGpuResourceModel(resourceReport)?.validation) } };
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  link.href = objectUrl; link.download = 'compute-price-model-comparisons.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});
init();
