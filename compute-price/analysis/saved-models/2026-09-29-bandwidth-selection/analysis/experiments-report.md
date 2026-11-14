# FP32 and missing-benchmark experiments

Version 1.2.0; prices 2026-09-29T05:37:47.808Z; generated 2026-09-29T06:01:19.057Z. Source signature d45df597.

**equation:** Primary and joint models: hourly whole-machine price = A × ∏(feature/reference)^exponent. Ordinary least squares on natural logarithms; predictions estimate the geometric price center. The separately labeled existing-method comparison retains a CPU baseline plus a multiplicative GPU increment, refitting both stages for each holdout.

**cpuValidation:** Five deterministic folds of whole provider × machine families; no family appears in its training and test data.

**gpuValidation:** Leave one entire provider × machine family out, holding every size and GPU configuration in that family together.

**displayedCpu:** The website displays the fixed RAM + CPU Geekbench model to retain a measured performance variable. Five whole-family folds validate that fixed formula; no nested feature selection is claimed. The broader RAM/vCPU capacity model and its nested selection results remain saved separately in cpu.selected for comparison.

**primarySelection:** CPU candidates share the full source-normalized RAM/vCPU cohort; GPU candidates share the full whole-GPU FP32/vCPU/GPU-count cohort. Sparse Geekbench and memory variants are evaluated separately. Missingness is never allowed to give one competing primary candidate an easier test set.

**uncertainty:** Reported errors use nested family holdouts for primary selection, not independent prospective data. Provider/GPU-model holdouts are additional fixed-feature diagnostics. No parameter confidence intervals are estimated for these feature-selection experiments.

**memory:** RAM and VRAM use source-normalized nominal GiB under the existing documented conventions: Google pricing GB are JEDEC binary; Azure explicitly decimal GB are converted using 10^9/2^30. These provider conventions do not establish identical usable device memory. Unspecified GB stay missing only for models requiring that variable, and do not block vCPU/FP32-only models. Google convention: https://cloud.google.com/products/compute/gpus-pricing; Azure convention: https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/gpu-accelerated/nca100v4-series.

**fp32:** Dense conventional FP32 theoretical peak TFLOPS, excluding tensor TF32, reduced precision and sparse modes. Whole identical GPU allocations sum device peaks; this is aggregate arithmetic capacity, not a claim of measured application or multi-GPU scaling.

**cpu:** vCPU count is advertised capacity, not a cross-architecture performance benchmark. CPU Geekbench remains measured exact-shape Geekbench 6 Linux without SME; GPU Geekbench is a single-device Geekbench 7 OpenCL model proxy.

**scope:** Positive public hourly whole-machine prices observed within 36 hours. Shared/burstable CPU plans, unsupported accelerators and fractional/unknown GPU allocations are excluded. Storage/network bundles, power limits, provider margins and historical benchmark-region differences remain uncontrolled.

**interpretation:** Good fit means held-out MAPE ≤15% and log R² ≥0.8; approximate means ≤35% and ≥0.5, with at least 80% test coverage, 10 tested rows and four held-out groups. These descriptive thresholds are not guarantees. Exponents are associations, not marginal provider charges.

## CPU: displayed Geekbench performance model

**RAM + CPU Geekbench: Approximate predictive fit.** 2025 configurations across 326 families and 3 providers (aws, azure, gcp).

`P = 0.258881 × (ramGiB/16)^0.718398 × (cpuScore/5000)^0.448594 USD/hour`

The displayed CPU model uses RAM and measured CPU Geekbench performance by user preference. Its feature set is fixed; its validation holds whole machine families out without feature selection. The broader vCPU capacity model is saved separately as cpu.selected.

Fixed-form family-held-out MAPE **27.49%**; equal-family MAPE 26.39%; log R² **0.950366**. Tested 2025/2025 rows; 326/326 families. Training log R² 0.951290.

Validation: Five deterministic folds of whole provider × machine families; no family appears in its training and test data.

Parameters are refitted to all eligible benchmarked configurations and normalized to the references in the equation. The fixed feature set is chosen for performance comparability, not by minimizing held-out error.

| Parameter | Value |
|---|---:|
| A | 0.258881 |
| ramGiB | 0.718398 |
| cpuScore | 0.448594 |

Provider-held-out fixed-feature diagnostic: MAPE 28.14%, log R² 0.947238, 2025/2025 rows.



## CPU: saved broad-coverage capacity model

**RAM + vCPU count: Approximate predictive fit.** 3542 configurations across 522 families and 5 providers (alibaba, aws, azure, gcp, ibm).

`P = 0.323499 × (ramGiB/16)^0.495678 × (vcpus/8)^0.518770 USD/hour`

Parameters are normalized to the references shown in the equation. The selected feature set is refitted to all eligible rows for this equation; its honest headline error comes from nested training-only selection, where the selected feature set can differ between outer folds. This saved capacity model is retained for comparison; the website displays the fixed Geekbench model above.

Nested held-out MAPE **21.67%**; equal-family MAPE 23.06%; log R² **0.970605**. Tested 3542/3542 rows; 522/522 families. Training log R² 0.971137.

Selection: Prespecified feature sets on one shared eligible cohort; choose complete inner family-fold coverage and the lowest mean of each family’s squared log errors. Ties prefer fewer variables. Ordinary log least squares; no tuned regularization.

Candidates: RAM + vCPU count (inner family log MSE 0.104718); RAM only (inner family log MSE 0.193291); vCPU count only (inner family log MSE 0.454974).

Provider-held-out fixed-feature diagnostic: MAPE 22.37%, log R² 0.966355, 3542/3542 rows.

### Each feature set on its own available data

These rows intentionally have different coverage. Error differences here cannot by themselves establish that adding a variable improved prediction.

| Feature set | Eligible rows | Families | Tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| RAM + CPU Geekbench | 2025 | 326 | 2025 | 27.49% | 26.39% | 0.950366 | 0.115025 |
| RAM + vCPU count | 3542 | 522 | 3542 | 21.67% | 23.06% | 0.970605 | 0.104718 |
| RAM only | 3542 | 522 | 3542 | 36.55% | 37.38% | 0.925371 | 0.193291 |
| CPU Geekbench only | 2025 | 326 | 2025 | 72.79% | 69.08% | 0.702246 | 1.008255 |
| vCPU count only | 3598 | 545 | 3598 | 34.44% | 42.63% | 0.914889 | 0.467989 |

### Does CPU Geekbench improve the same configurations?

2025 identical eligible rows; 326 families. Metrics below use the 2025 test rows predicted by every compared model. Every candidate is fitted and tested on the same eligible configurations with the same family boundaries. Compare commonValidation errors on the shared tested rows; no row is imputed. These are fixed-feature comparisons, not independent validation of choosing the lowest-error feature set after seeing this table. Memory keeps the established source conventions: Google pricing GB are JEDEC binary, while Azure explicitly decimal GB are converted to GiB. These nominal conventions do not establish equal usable device bytes.

| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| RAM + CPU Geekbench | 2025 | 326 | 2025 | 27.49% | 26.39% | 0.950366 | 0.115025 |
| RAM + vCPU count | 2025 | 326 | 2025 | 20.01% | 20.66% | 0.972282 | 0.084027 |
| RAM only | 2025 | 326 | 2025 | 34.88% | 35.47% | 0.924977 | 0.163260 |
| CPU Geekbench only | 2025 | 326 | 2025 | 72.79% | 69.08% | 0.702246 | 1.008255 |
| vCPU count only | 2025 | 326 | 2025 | 34.09% | 39.34% | 0.901935 | 0.476003 |

### Parameters and selection stability

| Parameter | Value |
|---|---:|
| A | 0.323499 |
| ramGiB | 0.495678 |
| vcpus | 0.518770 |

Outer-fold choices: cpu-capacity: 5.



## GPU: primary broad-coverage model

**Host vCPU count + FP32 + GPU count: Poor generalization.** 270 configurations across 34 families and 6 providers (alibaba, aws, azure, gcp, ibm, oracle).

`P = 1.910672 × (vcpus/8)^0.119034 × (gpuFp32Tflops/30)^0.479019 × (gpuCount/1)^0.550526 USD/hour`

Parameters are normalized to the references shown in the equation. The selected feature set is refitted to all eligible rows for this equation; its honest headline error comes from nested training-only selection, where the selected feature set can differ between outer folds.

Nested held-out MAPE **45.51%**; equal-family MAPE 42.18%; log R² **0.552538**. Tested 270/270 rows; 34/34 families. Training log R² 0.788626.

Selection: Prespecified feature sets on one shared eligible cohort; choose complete inner family-fold coverage and the lowest mean of each family’s squared log errors. Ties prefer fewer variables. Ordinary log least squares; no tuned regularization.

Candidates: Host vCPU count + FP32 (inner family log MSE 0.440767); Host vCPU count + FP32 + GPU count (inner family log MSE 0.243043); FP32 only (inner family log MSE 0.457873).

Provider-held-out fixed-feature diagnostic: MAPE 46.01%, log R² 0.604035, 270/270 rows.

GPU-model-held-out fixed-feature diagnostic: MAPE 64.57%, log R² 0.499740, 270/270 rows. All names for the same physical GPU model are grouped together even when memory or cloud-published peak ratings differ.

### Each feature set on its own available data

These rows intentionally have different coverage. Error differences here cannot by themselves establish that adding a variable improved prediction.

| Feature set | Eligible rows | Families | Tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Host RAM + CPU Geekbench + VRAM + GPU Geekbench | 37 | 5 | 37 | 35.87% | 36.47% | 0.380159 | 0.212161 |
| All four original variables + FP32 | 37 | 5 | 37 | 8.574212634132623e+24% | 2.114972449752714e+25% | -454.078570 | 612.365926 |
| Host RAM + CPU Geekbench + VRAM + FP32 | 82 | 12 | 82 | 34.35% | 32.17% | 0.812318 | 0.184068 |
| Host RAM + vCPU count + VRAM + FP32 | 225 | 18 | 225 | 68.30% | 67.94% | -0.320840 | 0.502702 |
| Host RAM + vCPU count + FP32 | 262 | 27 | 262 | 64.27% | 64.17% | -0.207313 | 0.487416 |
| Host RAM + VRAM + FP32 | 225 | 18 | 225 | 68.53% | 66.56% | -0.341802 | 0.489774 |
| Host vCPU count + FP32 | 270 | 34 | 270 | 61.66% | 62.52% | 0.125567 | 0.440767 |
| Host vCPU count + FP32 + GPU count | 270 | 34 | 270 | 45.51% | 42.18% | 0.552538 | 0.243043 |
| VRAM + FP32 | 225 | 18 | 225 | 70.80% | 66.99% | 0.585116 | 0.412377 |
| VRAM only | 256 | 30 | 256 | 59.55% | 40.50% | 0.704594 | 0.224889 |
| FP32 only | 270 | 34 | 270 | 60.72% | 61.88% | 0.654821 | 0.457873 |
| GPU Geekbench only | 69 | 14 | 69 | 45.51% | 34.72% | 0.524544 | 0.188272 |

### Add FP32 to the previously selected CPU-baseline + GPU-increment model

37 identical eligible rows; 5 families. Metrics below use the 37 test rows predicted by every compared model. Exploratory fixed-method comparison on the same configurations: retain the previous CPU-baseline + GPU-increment structure, then add FP32 to or replace GPU Geekbench in its multiplicative increment. Every outer fold excludes its entire family from both stages, including the CPU-only baseline data. Nonpositive residual prices reject the whole fold; no difficult rows are silently dropped. This follow-up does not change the prespecified broad-model selection pool or its nested headline error. Its errors condition on this fixed method; they are not the previous nested method-selection error.

| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Existing CPU baseline + (VRAM × GPU Geekbench) increment | 37 | 5 | 37 | 21.08% | 16.97% | 0.848279 | 0.094841 |
| Existing additive model + FP32 in GPU increment | 37 | 5 | 37 | 9.881439191872463e+66% | 2.437421667328541e+67% | -3436.786206 | 4630.058355 |
| CPU baseline + (VRAM × FP32) increment | 37 | 5 | 37 | 83.88% | 160.64% | 0.083501 | 0.952474 |

### Add FP32 or replace GPU Geekbench on the same configurations

37 identical eligible rows; 5 families. Metrics below use the 37 test rows predicted by every compared model. Every candidate is fitted and tested on the same eligible configurations with the same family boundaries. Compare commonValidation errors on the shared tested rows; no row is imputed. These are fixed-feature comparisons, not independent validation of choosing the lowest-error feature set after seeing this table. Memory keeps the established source conventions: Google pricing GB are JEDEC binary, while Azure explicitly decimal GB are converted to GiB. These nominal conventions do not establish equal usable device bytes.

| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Host RAM + CPU Geekbench + VRAM + GPU Geekbench | 37 | 5 | 37 | 35.87% | 36.47% | 0.380159 | 0.212161 |
| All four original variables + FP32 | 37 | 5 | 37 | 8.574212634132623e+24% | 2.114972449752714e+25% | -454.078570 | 612.365926 |
| Host RAM + CPU Geekbench + VRAM + FP32 | 37 | 5 | 37 | 154.88% | 308.85% | -1.001089 | 2.321142 |

### Drop CPU Geekbench and memory variables on the same configurations

82 identical eligible rows; 12 families. Metrics below use the 82 test rows predicted by every compared model. Every candidate is fitted and tested on the same eligible configurations with the same family boundaries. Compare commonValidation errors on the shared tested rows; no row is imputed. These are fixed-feature comparisons, not independent validation of choosing the lowest-error feature set after seeing this table. Memory keeps the established source conventions: Google pricing GB are JEDEC binary, while Azure explicitly decimal GB are converted to GiB. These nominal conventions do not establish equal usable device bytes.

| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Host RAM + CPU Geekbench + VRAM + FP32 | 82 | 12 | 82 | 34.35% | 32.17% | 0.812318 | 0.184068 |
| Host RAM + vCPU count + VRAM + FP32 | 82 | 12 | 82 | 38.64% | 40.31% | 0.708014 | 0.296055 |
| Host RAM + VRAM + FP32 | 82 | 12 | 82 | 36.73% | 37.51% | 0.711226 | 0.286670 |
| Host RAM + vCPU count + FP32 | 82 | 12 | 82 | 41.86% | 46.69% | 0.662103 | 0.381219 |
| Host vCPU count + FP32 | 82 | 12 | 82 | 45.89% | 49.80% | 0.625634 | 0.497636 |
| FP32 only | 82 | 12 | 82 | 61.44% | 64.38% | 0.630582 | 0.739227 |

### Does memory add value when no Geekbench score is required?

225 identical eligible rows; 18 families. Metrics below use the 225 test rows predicted by every compared model. Every candidate is fitted and tested on the same eligible configurations with the same family boundaries. Compare commonValidation errors on the shared tested rows; no row is imputed. These are fixed-feature comparisons, not independent validation of choosing the lowest-error feature set after seeing this table. Memory keeps the established source conventions: Google pricing GB are JEDEC binary, while Azure explicitly decimal GB are converted to GiB. These nominal conventions do not establish equal usable device bytes.

| Feature set | Eligible rows | Families | Shared tested | MAPE | Family MAPE | Log R² | Family log MSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Host RAM + vCPU count + VRAM + FP32 | 225 | 18 | 225 | 68.30% | 67.94% | -0.320840 | 0.502702 |
| Host RAM + vCPU count + FP32 | 225 | 18 | 225 | 75.34% | 76.57% | -0.755823 | 0.643119 |
| Host vCPU count + FP32 | 225 | 18 | 225 | 68.19% | 75.52% | -0.115397 | 0.561556 |
| VRAM + FP32 | 225 | 18 | 225 | 70.80% | 66.99% | 0.585116 | 0.412377 |
| FP32 only | 225 | 18 | 225 | 64.55% | 75.60% | 0.580908 | 0.530640 |

### Parameters and selection stability

| Parameter | Value |
|---|---:|
| A | 1.910672 |
| vcpus | 0.119034 |
| gpuFp32Tflops | 0.479019 |
| gpuCount | 0.550526 |

Outer-fold choices: gpu-host-fp32-count: 34.



## Comparison with the previous selected GPU procedure

37 shared test configurations. Prior nested procedure MAPE 36.00%; new broad FP32 nested procedure MAPE 34.11%. Nested-validation predictions on shared test configurations. The new FP32 procedure trains on a larger cohort and selects from different feature sets; this does not isolate FP32’s causal contribution. Use matched-cohort fixed-feature comparisons for feature ablations.

## Coverage and sources

{
  "excluded": {
    "stale": 0,
    "sharedCpu": 65,
    "otherAccelerator": 42,
    "fractionalOrUnknownGpu": 20
  },
  "cpu": {
    "baseCount": 3598,
    "knownRamCount": 3542,
    "withCpuBenchmarkCount": 2025,
    "providers": [
      "gcp",
      "alibaba",
      "aws",
      "azure",
      "oracle",
      "ibm"
    ]
  },
  "gpu": {
    "baseCount": 324,
    "withFP32Count": 270,
    "withGpuBenchmarkCount": 69,
    "withCpuBenchmarkCount": 101,
    "providers": [
      "gcp",
      "alibaba",
      "aws",
      "azure",
      "oracle",
      "ibm"
    ]
  }
}

All price and benchmark provenance remains in the catalog and benchmark JSON records. FP32 provenance: data/gpu-fp32.json version 1.0.0; each mapped row retains source URLs in the FP32 attachment. Manufacturer peak specifications are hardware-model proxies, not VM measurements; cloud clocks are not verified. Missing peaks and unknown variants are excluded rather than imputed.
