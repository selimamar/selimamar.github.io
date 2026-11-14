# Compute Price: fitted VM price models

Model version: 4.1.0. Prices observed: 2026-11-13T19:55:52.084Z. Model generated: 2026-11-13T19:56:28.160Z.

4062 public-price configurations; 2062 configurations actually included in the fits. Equal configuration weights during fitting, one selected US region per provider; no region duplication. GPU method selection weights inner validation families equally.

## CPU instances

2025 configurations, 326 provider × machine families; providers: aws, azure, gcp.

**Approximate predictive fit.** Ordinary least squares on natural logarithms. Predictions describe the geometric center of prices, not the arithmetic mean.

Reference configuration: ramGiB=16, cpuScore=5000. Its fitted complete-VM price is 0.258881 USD/hour.

`P = 0.258881 × (ramGiB/16)^0.718398 × (cpuScore/5000)^0.448594 USD/hour`

Unnormalized form: P = 0.0007739765698296097 × R^0.718398 × C^0.448594.

| Parameter | Estimate | 95% family-bootstrap interval |
|---|---:|---:|
| A (A) | 0.258881 | 0.245246 to 0.273349 |
| α (ramGiB) | 0.718398 | 0.690086 to 0.747348 |
| β (cpuScore) | 0.448594 | 0.400322 to 0.500357 |

Training log R²: 0.951290. Maximum VIF: 2.417185.

### Family-held-out validation

Leave one entire provider × machine family out; every size in that family is withheld together.

- Tested 2025/2025 configurations across 326/326 families.
- Held-out mean absolute percentage error: **27.41%**.
- Held-out median absolute percentage error: 22.77%.
- Held-out log R²: 0.950669.
- Held-out dollar R²: 0.744095.
- Held-out RMS log error: 0.334933.
- Within ±20%: 44.59%.
- RAM-only baseline mean percentage error (2025 tested predictions): 34.87%.
- Skipped families: None.



Confidence intervals use 400 deterministic resamples of entire families (400 valid fits). They are withheld if fewer than 80% of resamples identify valid fits. They do not cover benchmark measurement error or omitted-variable bias.

## Single-GPU instances

37 configurations, 5 provider × machine families; providers: aws, azure, gcp.

**Poor generalization.** Estimate a CPU-and-RAM baseline from CPU-only VMs, then fit a multiplicative GPU increment to the positive remaining price. Add the two fitted contributions. Nonpositive residuals cause a fit to be rejected; they are never discarded.

Selected method: **CPU baseline + GPU increment** (cpu-plus-gpu). Ridge penalty: 0.000000; nonnegative exponent constraint: no.

Selection criterion: Mean squared log-price error, averaged equally over inner held-out machine families. Only candidates with complete inner validation are eligible.

Reference configuration: ramGiB=32, cpuScore=5000, vramGiB=16, gpuScore=100000. Its fitted complete-VM price is 1.661821 USD/hour.

`P_VM = [0.258881 × (ramGiB/16)^0.718398 × (cpuScore/5000)^0.448594] + [1.235869 × (vramGiB/16)^-1.021775 × (gpuScore/100000)^1.772990] USD/hour`

The first term estimates CPU and RAM from CPU-only VMs; the second estimates the positive remaining GPU price. These are modeled contributions, not provider component charges. Nonpositive residual prices reject the candidate fit rather than being filtered out. The CPU term uses its own 16-GiB RAM reference.

Unnormalized form: P_VM = 0.0007739765698296097 × R^α × C^β + 2.866577728137538e-8 × V^γ × G^δ.

| Parameter | Estimate | 95% family-bootstrap interval |
|---|---:|---:|
| A (CPU baseline USD/hour) | 0.258881 | 0.243550 to 0.273814 |
| α (RAM) | 0.718398 | 0.688169 to 0.749531 |
| β (CPU performance) | 0.448594 | 0.392436 to 0.499189 |
| B (GPU increment USD/hour) | 1.235869 | 0.604424 to 7.273674 |
| γ (VRAM) | -1.021775 | -3.903999 to -0.715776 |
| δ (GPU performance) | 1.772990 | 1.676173 to 5.315335 |

Training log R²: 0.914521. Maximum VIF: 3.279919.

### Headline validation: nested method selection

Nested provider × machine-family holdouts: choose the model form and ridge penalty on inner training-family folds, then predict the untouched outer family. CPU-baseline training excludes both inner and outer withheld families.

- Tested 37/37 configurations across 5/5 families.
- Held-out mean absolute percentage error: **36.00%**.
- Held-out median absolute percentage error: 37.90%.
- Held-out log R²: 0.359396.
- Held-out dollar R²: 0.446963.
- Held-out RMS log error: 0.591421.
- Within ±20%: 27.03%.
- Original joint multiplicative model mean percentage error (37 tested predictions): 35.87%.
- Skipped families: None.

Averaging each family's mean percentage error equally gives 32.77%. The headline error above averages tested configurations equally.

### Fixed-method comparisons

Every candidate uses the same eligible GPU sample and family holdout boundaries; the table reports any unavailable predictions. These comparisons explain method choice. Selecting a candidate after inspecting this table does not make its error an independent estimate of the selection procedure. The nested result above remains the headline validation.

| Fixed method | Tested / sample | Families tested | Mean price error | Family-mean price error | Log R² | RMS log error |
|---|---:|---:|---:|---:|---:|---:|
| Joint multiplicative model | 37/37 | 5/5 | 35.87% | 36.47% | 0.380159 | 0.581757 |
| Ridge · λ 0.001 | 37/37 | 5/5 | 35.92% | 36.19% | 0.380309 | 0.581687 |
| Nonnegative ridge · λ 0.001 | 37/37 | 5/5 | 40.14% | 37.33% | 0.162518 | 0.676222 |
| Ridge · λ 0.01 | 37/37 | 5/5 | 35.97% | 33.81% | 0.379091 | 0.582259 |
| Nonnegative ridge · λ 0.01 | 37/37 | 5/5 | 39.86% | 36.73% | 0.178003 | 0.669942 |
| Ridge · λ 0.1 | 37/37 | 5/5 | 34.95% | 23.42% | 0.358394 | 0.591883 |
| Nonnegative ridge · λ 0.1 | 37/37 | 5/5 | 38.58% | 34.80% | 0.294818 | 0.620515 |
| Ridge · λ 1 | 37/37 | 5/5 | 38.51% | 34.33% | 0.456359 | 0.544826 |
| Nonnegative ridge · λ 1 | 37/37 | 5/5 | 38.51% | 34.33% | 0.456359 | 0.544826 |
| Ridge · λ 10 | 37/37 | 5/5 | 89.35% | 66.91% | -0.028511 | 0.749387 |
| Nonnegative ridge · λ 10 | 37/37 | 5/5 | 89.35% | 66.91% | -0.028511 | 0.749387 |
| CPU baseline + GPU increment | 37/37 | 5/5 | 21.08% | 16.97% | 0.848279 | 0.287823 |

On the intersection of 37 tested configurations, the original joint candidate has 35.87% error, the selected cpu-plus-gpu candidate has 21.08% fixed-method error, and nested selection has 36.00% error. The nested procedure is rated **Poor generalization**; the fixed-method comparison does not replace that result.

### Choices made inside each outer holdout

The withheld family does not contribute to its choice of method or penalty. CPU-baseline training excludes that outer family and each inner held-out family.

| Outer withheld family | Training GPU rows | Test rows | Selected method | Inner family-mean squared log error |
|---|---:|---:|---|---:|
| aws:g4dn | 32 | 5 | joint-ridge-0.01-free | 0.097527 |
| aws:g7e | 34 | 3 | cpu-plus-gpu | 0.030848 |
| aws:p3 | 36 | 1 | joint-ridge-0.001-free | 0.195949 |
| azure:NCads_A100_v4 | 36 | 1 | cpu-plus-gpu | 0.186195 |
| gcp:n1 | 10 | 27 | joint-ridge-0.01-free | 0.195885 |

- GPU scores are hardware-model proxies. The fitted response is the whole VM rental, including CPU and system RAM.
- 5 GPU machine families cover 37 configurations; repeated GPU models and related sizes are not independent hardware measurements.
- This is nested cross-validation on the observed sample, not a separate prospective test. Future pricing and new GPU generations can differ.
- The CPU baseline and GPU increment are estimated contributions, not provider component charges. Both stages are refitted without each withheld family.
- A negative exponent describes correlations in this sample, not a claim that adding that resource causes a discount.

Confidence intervals use 400 deterministic resamples of entire families (374 valid fits). They are withheld if fewer than 80% of resamples identify valid fits. They do not cover benchmark measurement error or omitted-variable bias. GPU intervals are conditional on the selected method and ridge penalty; they do not include uncertainty from model selection. Shared CPU/GPU families use the same bootstrap multiplicity; remaining CPU-only families are resampled separately.

## Data and limits

Geekbench 6.1–6.7 multi-core, Linux without SME, exact VM shape and full vCPU count; no score scaling. Geekbench 7 OpenCL hardware-model reference; a labeled proxy for a single allocated GPU.

Prices: [AWS](https://aws.amazon.com/ec2/pricing/on-demand/), [Microsoft Azure](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [Google Cloud Compute Engine](https://cloud.google.com/products/compute/pricing), [Alibaba Cloud](https://www.alibabacloud.com/en/product/ecs/pricing), [Oracle Cloud](https://www.oracle.com/cloud/compute/pricing/), [IBM Cloud](https://cloud.ibm.com/docs/account?topic=account-getting-pricing-api). CPU benchmarks: exact VM runs from [Spare Cores](https://github.com/SpareCores/sc-inspector-data) (adapted under CC BY-SA 4.0) and directly linked Geekbench Browser results. GPU proxies: [official Geekbench 7 OpenCL chart](https://browser.geekbench.com/opencl-benchmarks). Per-record provenance lives in the JSON datasets and model report.

Both models require measured CPU performance and matching nominal host vCPU/RAM. GPU VM prices include the bundled CPU and RAM; the GPU model also requires sourced VRAM and a matching Geekbench GPU-model proxy. Google N1 plus GPU rows may use the measured exact underlying N1 host shape, clearly labeled as paired host measurements; the benchmark was not run with that GPU attached. No CPU performance is imputed from processor names or core counts. Multi-GPU machines are excluded: single-device scores are never multiplied. Prices older than 36 hours, missing benchmarks and incompatible runs are excluded. Cloud hardware and historical benchmark regions may differ from the priced region.

Memory follows the source definition: Google Cloud binary GB are preserved as GiB; explicitly decimal GB are converted using 10⁹/2³⁰. Original capacities and source units remain recorded. Catalog rows with an unspecified nominal GB byte convention retain their original values and units and remain outside the fit. Provider memory-label conventions limit comparison and do not establish differences in usable device memory.

Resource exponents are conditional statistical associations, not provider line items or causal prices. Estimated CPU/GPU contributions are not observed component charges. RAM, CPU, VRAM and GPU performance covary, and included storage, networking, provider margins and hardware generation are omitted. A high training R² or the best fixed-method comparison alone does not establish reliable generalization.

Exclusions:

- No compatible exact-VM CPU benchmark: 1595
- Not a verified single-GPU configuration: 219
- No matching Geekbench 7 GPU-model score: 37
- No compatible exact-host CPU benchmark for GPU bundle: 19
- Memory byte convention not verified: 130
