# Compute Price

A single-page public cloud price reference. It fits simple power laws to whole-machine hourly prices, compares FP32 throughput with Geekbench, and tests whether omitting scarce metrics improves useful data coverage and prediction. The page displays a fitted reference-machine price, the benchmark-based CPU equation or linear GPU memory-bandwidth equation, variable definitions and a held-out price-prediction plot. A Data tab lists the exact fitting samples and individual machine prices. A linked one-page PDF explains the published models in plain language; source data, saved models and comparisons remain downloadable. All GPU comparisons and the vCPU CPU model remain saved alternatives.

## Run and reproduce

For the integrated personal website, run Hugo from the parent repository. The native `/compute-price/` page shares its styling and uses static JSON assets, so it works on GitHub Pages. The parent Pages workflow runs `scripts/refresh-for-hugo.mjs` daily at 07:23 UTC. This stages the complete refresh, validates the price/model signatures and held-out coverage, regenerates the PDF, and retains the previous complete publication on failure. See the parent README for upload and local-refresh instructions. The original standalone preview and Worker remain optional alternatives.

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

The displayed CPU model is fixed to **RAM + measured CPU Geekbench**, as a performance-based reference. It uses fixed-equation family holdouts, with no variable selection. The broader vCPU capacity model remains saved in `cpu.selected`, with its original equation, predictions and nested validation; its comparison remains in the saved reports and downloads. The displayed Geekbench model is stored in `cpu.displayed`; its equation, plot and exported CPU predictions use that model’s rows and validation.

The saved broad CPU and historical GPU selection pools each use a shared eligible cohort. Selection minimizes held-out squared log-price error with equal weight per machine family. Their validation nests feature selection inside the training data: an outer held-out family never determines which feature set predicts it. Related sizes stay together in a provider × machine family; composed Google N1 GPU configurations stay in the N1 family. Provider and GPU-model holdouts, where available, probe harder transfers and are reported separately.

Each model reports mean/median absolute percentage error, held-out log R² and test coverage. A “Good predictive fit” requires mean error ≤15%, log R² ≥0.8 and ≥80% coverage; “Approximate” uses ≤35% and ≥0.5. These are descriptive thresholds, not guarantees. High training R² alone does not establish a useful prediction model. Trying candidates and selecting the smallest ordinary validation error does not make that error an independent estimate; the archived broad GPU and saved capacity models retain their nested results. The displayed GPU model evaluates the fixed bandwidth equation, but selecting it after comparing alternatives has not received independent validation.

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

The two three-input forms remain saved prespecified comparisons. The page now displays only `singleResourceComparison.variants[id=gpu-bandwidth-linear]`, selected explicitly after inspecting those experiments; it is not an automatically selected winner. Their ordinary held-out errors do not independently validate choosing the lower-error model afterward. Zero coefficients indicate a constrained conditional fit, not a causal absence of resource value. Exact bandwidth variants and primary sources are in `data/gpu-bandwidth.json`; unsupported variants remain missing. Bandwidth is not network or interconnect speed.

## Log-scale GPU plots

The saved three-panel plots show fitted per-device GPU contributions against bandwidth and both original models' actual-versus-family-held-out whole-VM predictions on shared logarithmic axes. The current GPU tab instead shows a single actual-versus-family-held-out whole-VM scatter for the linear bandwidth equation, using the same presentation as the CPU plot. Per-device data points subtract the full-sample estimated host price from the observed VM price and divide by GPU count. They are inferred residuals, not separately observed component prices. Nonpositive residuals cannot appear on a logarithmic axis and their count is disclosed; they remain in every fit and the whole-VM validation panels. Full-sample curves and held-out predictions are explicitly distinguished.

`python scripts/plot-gpu-resources.py` (Matplotlib required) exports a dated standalone figure to `analysis/gpu-model-log-plots.png`, `.svg`, and `.pdf`. The website charts themselves are generated from the active JSON report and do not depend on Python or the dated exports.

## One-input GPU checks

The GPU resource report also compares genuinely bandwidth-only and VRAM-only GPU contributions, using both a linear form and a fitted power law. Each retains the same RAM + CPU Geekbench host baseline, whole-GPU count, nonnegative constraints and equally weighted family log-price objective. All four use the original identical complete cohort so changing the sample cannot explain an error difference. The unused GPU metrics do not enter their fits or predictions.

Every holdout refits the reduced model itself. Its errors can differ from a three-input model whose full-sample fit happened to put two coefficients at zero, since that three-input model can use those predictors in validation folds. Results, full fit parameters and matched family/GPU-model holdouts are saved under `singleResourceComparison` in `data/gpu-resource-experiments.json`. They are exploratory comparisons, not independent validation of choosing a winner after seeing the errors.

## Displayed linear GPU model and saved archive

The GPU equation, validation scatter and exported estimate all use `gpu-bandwidth-linear`. Its equation is `P = H + n k B`, retaining the benchmark CPU/RAM baseline `H`; `B` is sourced bandwidth in GB/s **per GPU** and `n` is whole GPU count. The saved coefficient is approximately 0.00171247 USD/hour per GB/s, with 22.3% family-held-out mean absolute percentage error and 25.3% error when whole GPU models are withheld. The page reads these values from the active report rather than hard-coding them.

The methodology PDF gives a short explanation of the bandwidth model and its relationship to VRAM. Detailed correlations and alternative-fit results remain in the saved datasets and reports. Correlation alone does not establish that VRAM is unnecessary in every dataset. The selected fit deliberately retains the same 82-row complete cohort as the comparisons rather than silently changing its sample.

All earlier fits, input data, reports, plots and reproduction code are preserved in `analysis/saved-models/2026-09-29-bandwidth-selection/`, with a SHA-256 manifest. Normal refreshes update the active data files without overwriting this dated archive. The active model download retains all resource variants and their predictions; the GPU page renders only the selected linear equation.

## Minimal page and methodology PDF

The main page contains CPU/GPU model tabs with reference prices, equations, definitions and one listed-versus-predicted plot. Each plot uses held-out whole-family predictions. The PDF gives a simple explanation of the published models; detailed comparisons remain in the saved reports and downloads. The Data tab lists the exact displayed-model fitting rows, with provider/search filters, price sorting, public price sources and held-out estimates. A filtered sample CSV is available there; the complete catalog CSV and saved-model JSON downloads remain in the footer.

The header's **Methodology** link opens `output/pdf/compute-price-methodology.pdf` in a new tab. This compact one-page document covers only the actual fitting samples, the two published equations, a plain-language explanation of fitting and prediction checks, reference prices, historical reconstruction, updates, limitations and sources. Each document is dated to its price snapshot and regenerated with the daily GitHub refresh.

To regenerate from the saved model outputs, run `python scripts/create-methodology-pdf.py` in a Python environment with ReportLab installed, then render and check the resulting single page. `npm run build` packages this PDF unchanged for static hosting and embeds its binary content in the Worker; it does not require Python. The local preview serves the same PDF path with `application/pdf`.

## Reference machines and fit data

The CPU reference is the base **2026 Mac mini M6**: 16 GB unified memory and a Geekbench 6 multi-core score of **20,525**. Apple [specifications](https://www.apple.com/mac-mini/specs/) identify the base 16 GB / 256 GB configuration; the [Geekbench 6.7.1 result](https://browser.geekbench.com/v6/cpu/19234603) is one published run of that configuration, not an aggregate. The GPU reference keeps this CPU/RAM baseline and adds **one NVIDIA H100 SXM**, whose [manufacturer specifications](https://www.nvidia.com/en-us/data-center/h100/) list **80 GB HBM3** and **3.35 TB/s = 3,350 GB/s** on-device memory bandwidth. PCIe and NVL variants have different bandwidths and are not substituted. VRAM capacity is descriptive; only bandwidth enters the GPU contribution. `data/reference-machine.json` preserves specifications, sources and benchmark metadata, and `lib/reference-machine.js` supplies the reference to both cards and the history pipeline. Nominal 16 GB DRAM is represented as 16 GiB in the RAM model.

These are estimated cloud costs at that resource level, not Mac rental quotes or guaranteed application-performance equivalents. The combined GPU reference is a hypothetical resource basket, not an actual Mac-with-H100 configuration. Both prices use the active fitted parameters without changing equation normalization or refitting the data. The GPU card includes CPU/RAM host cost and the bandwidth-based GPU contribution; no GPU Geekbench score enters this equation. The CPU target is a macOS result on SME-capable hardware while the training sample uses Linux results without SME. The current GPU fitting sample spans 192–1,935 GB/s, so 3,350 GB/s is an extrapolated target; the card labels it accordingly. Marginal input ranges do not establish support for the joint 16 GB / 20,525-score / single-H100 configuration. These proxy and extrapolation limits are recorded with the reference and in the methodology PDF. Earlier reference-history results remain preserved in `analysis/saved-models/2026-10-01-before-mac-mini-reference/` and `analysis/saved-models/2026-10-02-before-h100-reference/`.

The Data tab is shareable with `?model=cpu&view=data` or `?model=gpu&view=data`. Its rows come from `cpu.displayed.rows` or the active bandwidth comparison cohort, never from the full catalog or a historical model. The CPU sample also supplies the GPU host baseline. The GPU estimates use the restricted `gpu-bandwidth-linear` family holdouts. Source metadata is joined by configuration ID.

## Historical reference prices

Both model tabs include a 2016–2026 history chart for the same reference machines. This is an **AWS-only historical reconstruction**, separate from today's multi-provider reference price. Each estimate refits the CPU power law and the GPU bandwidth equation to an actual dated AWS US East (N. Virginia) Linux on-demand catalog. CPU fitting uses ordinary least squares in log space; the nonnegative GPU bandwidth coefficient minimizes whole-machine squared log error with equal weight per GPU family. Prices are nominal USD/hour, without inflation adjustment.

The ten annual archives span October 2016 through September 2025; the 2026 point uses the current AWS catalog, fitted separately from the headline model. Dates are the archives' actual publication dates, which sometimes follow the nominal version window. Lines connect dated estimates, not observed daily values. The early GPU sample has only two configurations in one family. Historical fitting diagnostics are in-sample, with no claim of held-out predictive accuracy.

Later exact-VM Geekbench 6 measurements are frozen hardware descriptors for this reconstruction; Geekbench 6 itself was released in February 2023. Matching requires the same instance name, nominal RAM and vCPU count. Historical prices never come from present-day quotes. The mapping favors hardware with surviving benchmark coverage, and changing sample composition can move the index. The same Mac mini CPU / H100 bandwidth resource basket is applied across all dates; this does not describe historical Mac mini generations or pre-launch H100 rental prices. Early samples require extrapolation in CPU score and GPU bandwidth. Marginal range flags do not establish support for the joint configuration. When the reference changes, saved daily observations are reevaluated with their own saved coefficients, preserving their dates, source prices and fits.

`data/historical-aws-prices.json` preserves 3,317 matched archived prices, publication dates, rate identifiers, source URLs, byte counts and source-file SHA-256 hashes. `data/historical-benchmark-mapping.json` preserves the frozen measurement and hardware provenance. `data/reference-history.json` contains the fitted series, coefficients, sample sizes, input ranges, exclusions and price rows. The chart's History data link downloads the displayed series. The one-page methodology PDF also explains the historical method and its limitations.

Run `npm run history` to reproduce the fits. `npm run refresh`, `npm run fit` and `npm run experiments` also update the saved history and retain subsequent dated AWS observations. `python3 scripts/import-historical-aws.py` re-downloads the public AWS source archives without credentials; see `analysis/historical-aws-research.md` for options. Full archive downloads are large, so ordinary refreshes use the preserved matched historical records.

The browser can add a newer AWS endpoint to the displayed and downloaded reconstruction after a live catalog refresh. That observation uses AWS's last successful price-check date, so a failed AWS refresh cannot relabel stale prices. Browser observations are not durable history: the regular file-based refresh pipeline saves them; a static-only deployment retains its bundled history plus the live endpoint. No unobserved intervening days are backfilled.

## Residual checks

The CPU and GPU tabs plot the displayed models' **held-out whole-machine errors**, using the same predictions as the listed-versus-predicted plot. The residual is `e = ln(listed price) - ln(predicted price)`: zero means exact agreement, and a positive residual means underprediction. Log errors compare proportional deviations across cheap and expensive machines. Historical AWS reference-index fits are not pooled into this analysis.

One plot shows residuals against predicted hourly price to reveal bias, curved patterns or changes in spread. The other shows a density-normalized histogram with a Gaussian fitted by maximum likelihood: its mean is the sample mean and its variance uses divisor `n`. The mean is estimated rather than forced to zero. Every valid held-out price pair is included, including exact predictions and extreme errors. Histogram bin areas sum to one, so the bars and Gaussian share a density scale.

A Gaussian overlay is a descriptive check, not a certificate of model quality. Error size and systematic patterns matter alongside distribution shape. Related VM sizes and reused training folds produce dependent residuals, so the website does not report an independent-normality p-value or claim calibrated prediction intervals. The GPU equation was selected after comparing candidates; these diagnostics do not independently validate that selection. [NIST's residual-analysis guide](https://www.itl.nist.gov/div898/handbook/pri/section2/pri24.htm) explains how to read these plots.

`npm run diagnostics` saves both displayed models' Gaussian parameters, skewness, excess kurtosis and complete signed residual rows in `data/residual-diagnostics.json`, with a readable report in `analysis/residual-report.md`. Normal refresh and fit commands also regenerate this output. Browser plots and the Residual data download recompute directly from the active model, so live updates use their matching predictions. The Saved models download also includes both residual reports.
