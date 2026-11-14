# Compute Price

A single-page public cloud price reference. It fits simple power laws to whole-machine hourly prices, compares FP32 throughput with Geekbench, and tests whether omitting scarce metrics improves useful data coverage and prediction. The page displays the benchmark-based CPU equation and an additive-versus-multiplicative GPU resource comparison, with parameters, validation errors and source prices. Previous GPU models and the vCPU CPU model remain saved alternatives.

## Run and reproduce

Requires Node.js 22 or newer. No cloud credentials or paid machines are needed.

```sh
npm install
npm run refresh
npm run dev
```

Open <http://localhost:4173>. The local preview serves saved data. Refresh fetches public prices and regenerates both the historical benchmark model and the current feature experiments.

```sh
npm run experiments
npm test
npm run build
```

The current reproducible experiment output is `data/experiments.json`, with a readable report in `analysis/experiments-report.md`. The previous Geekbench/additive-model calculation remains reproducible in `data/model.json` and `analysis/model-report.md`; it is a historical-method comparison, not the current feature-selection procedure.

For a targeted price refresh, use `node scripts/update-prices.mjs --provider=gcp,alibaba,oracle,ibm`, then `npm run fit`. Model eligibility requires prices no older than 36 hours. Saved models retain their original dates.

## What is fitted

Every candidate predicts the complete published machine rental in USD/hour:

`P = A × (resource₁ / reference₁)^exponent₁ × …`

The reference values make coefficients readable; the reference machine need not be a purchasable configuration. Fits use ordinary least squares on natural logarithms. Their predictions represent geometric central tendencies. Exponents are conditional associations, not causal component prices. Correlated resources, included storage/networking, hardware generations and provider differences can make exponents unstable or negative.

CPU candidates use combinations of system RAM, measured Geekbench CPU score and vCPU count. GPU candidates add or replace Geekbench GPU score with FP32 throughput, or omit benchmark and memory variables. A vCPU count describes allocated capacity, not the speed of an individual CPU. Each variant uses only the resources explicitly listed in its equation; removing one requirement can admit more real observations, without inventing the missing value.

**FP32 throughput** is sourced theoretical dense single-precision arithmetic capacity, measured in TFLOPS (10¹² floating-point operations per second). It is not a benchmark of a rented VM. Tensor-core TF32, FP16/BF16, sparse figures and workstation/server variants are not interchanged. Exact provider hardware mappings and primary source links live in `data/gpu-fp32.json`. Unresolved variants and fractional allocations have no FP32 estimate. For verified full multi-GPU allocations, total theoretical capacity is per-device throughput × device count. This arithmetic sum does not claim linear application speedup.

## Comparing missing metrics fairly

The report separates two questions:

1. **Same machines, different inputs:** candidates are refitted and validated on the same eligible configurations and holdout boundaries. These comparisons isolate the effect of adding FP32, replacing a score or dropping an input. If a fit cannot predict a held-out group, missing coverage is reported; common-prediction comparisons use the intersection.
2. **Broader coverage:** every candidate is also evaluated on its full eligible sample. Its configuration count and family count accompany its error. Errors from different cohorts do not establish that one metric improved the same underlying prediction task.

The displayed CPU model is fixed to **RAM + measured CPU Geekbench**, as a performance-based reference. It uses fixed-equation family holdouts, with no variable selection. The broader vCPU capacity model remains saved in `cpu.selected`, with its original equation, predictions and nested validation, and is expandable on the page. The displayed Geekbench model is stored in `cpu.displayed`; tables, downloads and coverage use that model’s rows and predictions.

The saved broad CPU and headline GPU selection pools each use a shared eligible cohort. Selection minimizes held-out squared log-price error with equal weight per machine family. Their validation nests feature selection inside the training data: an outer held-out family never determines which feature set predicts it. Related sizes stay together in a provider × machine family; composed Google N1 GPU configurations stay in the N1 family. Provider and GPU-model holdouts, where available, probe harder transfers and are reported separately.

Each model reports mean/median absolute percentage error, held-out log R² and test coverage. A “Good predictive fit” requires mean error ≤15%, log R² ≥0.8 and ≥80% coverage; “Approximate” uses ≤35% and ≥0.5. These are descriptive thresholds, not guarantees. High training R² alone does not establish a useful prediction model. Trying candidates and selecting the smallest ordinary validation error does not make that error an independent estimate; the nested result is reported for the GPU headline and saved capacity model; the fixed benchmark CPU headline makes no selection claim.

## Data coverage and units

The catalog covers six named providers: AWS, Microsoft Azure, Google Cloud, Alibaba Cloud, Oracle Cloud and IBM Cloud. It is not a claim to cover exactly the ten largest, an exhaustive inventory or a market-share-weighted index. DigitalOcean is excluded from active refreshes, retained observations and API responses.

Prices are public Linux on-demand USD hourly rates in a selected US reference region per provider. Spot, reserved commitments, negotiated discounts, premium OS licenses, taxes and separately billed traffic/storage are excluded; mandatory bundled resources remain in the rate. Oracle flexible CPU/RAM shapes use an explicit representative grid rather than claiming that every possible configuration is an independent product. Public prices do not guarantee inventory or account quota. Burstable/shared CPU prices remain identifiable in the catalog but are excluded from ordinary CPU-model comparisons.

Memory features follow the catalog’s documented provider conventions, rather than claiming exact usable device bytes. The original Google binary-GB convention and Azure GB-to-GiB conversion are retained for comparability with the previous model. GPU memory labels can still differ between providers; nominal capacities are not measurements of usable VRAM. A new bare GB label without an established convention does not justify conversion. Such values remain visible in the catalog with their original label. A model requiring RAM or VRAM in GiB excludes that ambiguous feature; a model omitting it can still use the row's independently verified price and other resources. Missing memory is not imputed.

Geekbench CPU data require a compatible Linux Geekbench 6.1–6.7 run without SME, matching the exact VM's full vCPU count and nominal memory. GPU Geekbench uses the official version-7 OpenCL hardware-model chart as a labeled proxy, only for one full verified GPU. Scores are never multiplied by device count. Google N1 plus one GPU may use an explicitly paired exact underlying host measurement; the benchmark was not run with the GPU attached. Hardware specifications and benchmark snapshots are separately curated and dated; daily price updates do not rerun benchmarks or pretend to refresh those observations.

Spare Cores-derived CPU benchmarks and hardware metadata are adapted under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Creator, pinned source commit, license and changes remain in the data. Source runs are from [Spare Cores Inspector](https://github.com/SpareCores/sc-inspector-data); direct score links are retained. Geekbench is a trademark of Primate Labs; there is no affiliation or endorsement. Hardware/benchmark regions and historical test conditions may differ from the priced region.

## Daily updates and publication

The Worker serves `/api/catalog` for the current catalog and `/api/prices` for a small legacy AWS/Azure basket. A new UTC day triggers public price refreshes; failed providers retry after an hour. Last successful rows retain their real observation timestamps. The browser applies the same experiment code to newly refreshed prices. It never turns a failed source into a fresh observation.

The production Worker also exposes a scheduled handler. The host must support the whole workload: IBM currently requires approximately 143 public requests, in addition to other providers and Azure pagination. Hosts with smaller request/runtime limits need an external daily updater that republishes the saved data. An optional `PRICES_KV` binding preserves observations across deployments.

`npm run build` produces static files and a self-contained Worker in `dist/`. The parent academic site is independent and is not modified.

**Publication status:** hosting is disabled for this workspace, so no public deployment or hosted daily schedule has been activated. `wrangler.jsonc` requests a daily run at 06:17 UTC after a successful authenticated deployment. Static-only hosting needs `npm run refresh` and republication every day; static files alone cannot collect new prices.

## Public sources

- [AWS EC2 on-demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [Microsoft Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Google Compute Engine pricing](https://cloud.google.com/products/compute/pricing)
- [Alibaba ECS pricing](https://www.alibabacloud.com/en/product/ecs/pricing)
- [Oracle Compute pricing](https://www.oracle.com/cloud/compute/pricing/)
- [IBM public pricing API](https://cloud.ibm.com/docs/account?topic=account-getting-pricing-api)
- [Google GPU specifications](https://docs.cloud.google.com/compute/docs/gpus)
- [Geekbench OpenCL chart](https://browser.geekbench.com/opencl-benchmarks)

Exact per-hardware FP32 sources, source dates, complete pricing components and benchmark provenance accompany the downloadable data.

## GPU resource comparison

Run `node scripts/fit-gpu-resources.mjs` to generate `data/gpu-resource-experiments.json` and `analysis/gpu-resource-report.md`. The normal fit and refresh commands include this step. Browser refreshes recompute the comparison when the dated catalog or any source inputs change. Hardware specifications keep their own review dates.

Both forms use exactly the same available configurations, requiring RAM, measured CPU Geekbench, sourced dense FP32, sourced on-device memory bandwidth and source-normalized VRAM. Inputs F (FP32 TFLOPS), B (bandwidth GB/s) and V (VRAM GiB) are per GPU, with full GPU count n applied once:

- Additive: `P = P_host + n [a(F/30) + b(B/1000) + c(V/40)]`.
- Multiplicative: `P = P_host + n A(F/30)^alpha(B/1000)^beta(V/40)^gamma`.

`P_host` is the RAM + CPU Geekbench power-law baseline, fitted on CPU-only data. Every validation split excludes the test host families from that baseline, including when whole GPU models are withheld across providers. Both GPU forms minimize the same equally weighted family mean squared log error of the complete VM price. GPU resource coefficients/exponents are nonnegative; the multiplicative scale is positive. Below-baseline price observations stay in the objective. The solver uses deterministic multiple starts and checks first-order convergence; it does not claim a global optimum or coefficient confidence intervals. No penalty or model choice is tuned on held-out prices.

The two forms are prespecified comparisons, not an automatically selected winner. Their ordinary held-out errors do not independently validate choosing the lower-error model afterward. Zero coefficients indicate a constrained conditional fit, not a causal absence of resource value. Exact bandwidth variants and primary sources are in `data/gpu-bandwidth.json`; unsupported variants remain missing. Bandwidth is not network or interconnect speed.

## Log-scale GPU plots

The GPU tab plots fitted per-device GPU contributions against bandwidth and both models' actual-versus-family-held-out whole-VM predictions on shared logarithmic axes. Per-device data points subtract the full-sample estimated host price from the observed VM price and divide by GPU count. They are inferred residuals, not separately observed component prices. Nonpositive residuals cannot appear on a logarithmic axis and their count is disclosed; they remain in every fit and the whole-VM validation panels. Full-sample curves and held-out predictions are explicitly distinguished.

`python scripts/plot-gpu-resources.py` (Matplotlib required) exports a dated standalone figure to `analysis/gpu-model-log-plots.png`, `.svg`, and `.pdf`. The website charts themselves are generated from the active JSON report and do not depend on Python or the dated exports.

## One-input GPU checks

The GPU resource report also compares genuinely bandwidth-only and VRAM-only GPU contributions, using both a linear form and a fitted power law. Each retains the same RAM + CPU Geekbench host baseline, whole-GPU count, nonnegative constraints and equally weighted family log-price objective. All four use the original identical complete cohort so changing the sample cannot explain an error difference. The unused GPU metrics do not enter their fits or predictions.

Every holdout refits the reduced model itself. Its errors can differ from a three-input model whose full-sample fit happened to put two coefficients at zero, since that three-input model can use those predictors in validation folds. Results, full fit parameters and matched family/GPU-model holdouts are saved under `singleResourceComparison` in `data/gpu-resource-experiments.json`. They are exploratory comparisons, not independent validation of choosing a winner after seeing the errors.
