# Historical reference-price reconstruction review

Reviewed 2026-09-29. This note concerns a retrospective reconstruction, not an observed historical market index.

## Available hardware and benchmark mapping

`data/historical-benchmark-mapping.json` contains 999 CPU-only AWS shapes and 50 GPU AWS shapes with exact-shape Geekbench 6 CPU measurements. The 50 GPU shapes comprise the 44 AWS shapes in the existing complete GPU comparison plus six history-only legacy shapes:

| Family | Shapes | Per-device memory bandwidth | Nominal VRAM per device | Family available from |
|---|---:|---:|---:|---|
| P2 / one K80 GK210 GPU | 3 | 240 GB/s | 12 GiB | 2016-09-29 |
| G3 / one M60 GPU | 3 | 160 GB/s | 8 GiB | 2017-07-13 |

AWS explicitly states that each P2 GPU has 12 GiB and 240 GB/s; a K80 board contains two GPUs. The historical mapping counts the full devices exposed by AWS, not boards. [AWS P2 launch and specifications](https://aws.amazon.com/blogs/aws/new-p2-instance-type-for-amazon-ec2-up-to-16-gpus/).

NVIDIA specifies 160 GB/s per M60 GPU, with two 8 GB GPUs per board. AWS G3 exposes one, two, or four full 8 GiB devices. [NVIDIA M60 product brief, Table 2](https://images.nvidia.com/content/pdf/tesla/tesla-m60-product-brief.pdf), [AWS previous-generation specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/pg.html).

Legacy CPU coverage available by the end of 2016 is at most 19 shapes: C4 (5), M4 (6), R4 (6), X1 (2). Date-specific archive availability must decide the actual subset: R4 was introduced in November 2016, and X1.16xlarge in October 2016. The highest measured Geekbench 6 score among these shapes is 10,598. No exact-score mapping currently exists for the old M3, C3, R3, T2, or D2 families in the fitting cohort. [AWS instance guide history](https://docs.aws.amazon.com/ec2/latest/instancetypes/doc-history.html).

The current complete GPU cohort starts with P3 in October 2017; missing FP32 mappings previously excluded P2 and G3 despite available CPU benchmarks. The selected historical GPU equation uses only the CPU/RAM host baseline and GPU bandwidth, so requiring FP32 would unnecessarily remove those historical observations. The main headline cohort and model remain unchanged.

## What historical points mean

For each dated price archive, match only the identical AWS shape and verify RAM and vCPU specifications. Use archived Linux on-demand, shared-tenancy, US East N. Virginia prices and no commitments, spot rates, Windows premiums, or EBS/network additions. Retain actual archive effective and publication timestamps and source URLs. A price file published after a target date is not evidence that its products were available earlier; plot its actual supported date or leave a gap.

Refit the same functional forms separately for each historical price snapshot:

- CPU: `H_t = A_t (RAM/16)^alpha_t (Geekbench6/5000)^beta_t`.
- GPU VM: `P_t = H_t + n k_t B`, where B is per-device GB/s.
- CPU reference query: RAM 16 GiB, Geekbench 6 multi-core 20,000.
- GPU reference query: the same host plus one 300 GB/s GPU.

CPU fitting should use the existing ordinary least-squares log-price objective. The GPU coefficient should minimize the existing equal-family mean squared log error of the whole VM price, keeping all rows whose price is below the host estimate. Do not switch silently to regressing a residual on a log scale or discard negative residuals. The existing generic GPU solver requires at least five GPU observations, while a 2016 P2 reconstruction has at most three shapes from one family. The archive extraction found a conflicting 768 GiB specification for p2.16xlarge in 2016–2019 versus the 732 GiB measured-shape specification and AWS launch table. Strict matching rejects that record, leaving only two matching GPU shapes in 2016. Preserve the conflict rather than silently choosing a preferred source. A separate history-only one-parameter solver can estimate k from those two observations, but cannot establish cross-family predictive accuracy. Record and display that low coverage; do not attach the current 22.3% validation claim to historical fits.

This reconstruction must be labeled AWS only throughout. The current headline estimate combines AWS, Azure, and Google; it must not be joined to the AWS history as though all points used the same market universe. A current all-provider reference can be a separately labeled comparison marker, or omitted from the historical series.

## Essential limitations

Geekbench 6 was released on February 14, 2023. Scores used here were measured years after the earliest price dates; P2's measurements, for example, were made in July–August 2024. The chart therefore estimates how archived prices relate to later-measured performance. It is not a benchmark index that could have been observed in 2016. [Geekbench 6 release](https://www.geekbench.com/blog/2023/02/geekbench-6/).

The exact VM shape and nominal resource match do not prove hardware, hypervisor behavior, security mitigations, or operating-system performance stayed constant throughout the decade. Preserve benchmark dates and source provenance rather than assigning those measurements historical dates.

The CPU reference is a hypothetical standardized bundle. Even in the current eligible cohort, the highest CPU score at 16 GiB or less is 13,985, and machines scoring at least 20,000 have at least 32 GiB. The requested 16 GiB / 20,000 combination is outside joint observed support; the early models extrapolate beyond even the maximum observed score. This can substantially affect the historical slope and should be stated near the chart, with detailed explanation in methodology.

The eligible pool changes as hardware is introduced and only some shapes retain public benchmark measurements. Changes in the plotted estimate can reflect different machine-family coverage as well as price changes. The series is not a transaction-weighted index, a cheapest-available price, a pure constant-basket price index, or an inflation-adjusted series. Keep per-date counts, family counts, coefficients, range diagnostics, exact price rows, and provenance downloadable.

## Small, understandable presentation

Use a chart titled “Reference price over time” and a concise scope line such as “AWS reconstruction · annual public list-price snapshots · nominal USD/hour.” Label all points estimates. Use actual supported dates, no invented interim daily observations, and no extrapolation before the first archived observation. Connect available annual observations only as a visual guide; gaps should remain visible when an annual fit cannot be supported.

Suggested caption: “Estimated from archived AWS prices using the same reference specifications and later Geekbench measurements. Early years have limited coverage and require extrapolation.” Keep the full qualifications and snapshot data in methodology/downloads.

The hardware mapping is deliberately separate from current headline models and contains no historical prices. Its records were validated for positive RAM, vCPU counts, CPU scores, benchmark URLs/dates, and positive whole-device GPU counts and bandwidth.
