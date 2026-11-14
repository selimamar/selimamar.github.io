# Historical reference-machine price reconstruction

Generated 2026-09-29T15:46:31.061Z. Model version 1.0.0.

AWS US East (N. Virginia), Linux on-demand nominal USD/hour. This historical series is separate from the headline multi-provider reference.

Reference: 16 GiB RAM, Geekbench 6 multi-core score 20,000. GPU reference adds one 300 GB/s GPU to that host.

**description:** Refit the same functional forms to dated public AWS Linux on-demand price catalogs for US East (N. Virginia). This is a provider-specific reconstruction, separate from the current multi-provider reference price.

**cpuFormula:** H = A × (RAM/16)^alpha × (Geekbench6/5000)^beta; ordinary least squares of log price on log inputs.

**gpuFormula:** P = H + n × k × B; nonnegative k minimizes equal-family mean squared log error of whole-VM price.

**benchmarkBasis:** Exact cloud VM shape; measurements were made after the historical price dates. The scores are retrospectively frozen hardware descriptors, not contemporary observations in each year.

**dates:** Points use actual archive publication dates. No prices are interpolated or carried into missing years.

**matching:** Exact instance name plus matching nominal RAM and vCPU count. No vCPU-to-performance imputation. Prices effective after their source publication are excluded.

**uncertainty:** Historical samples vary with catalog and benchmark coverage. Early samples are small; extrapolation and changing composition can move the series. Training diagnostics are not held-out validation. Values are nominal USD without inflation adjustment.

**referenceMeaning:** The 16 GiB / 20,000 Geekbench reference is hypothetical and may lie outside observed combinations. Marginal input-range flags do not establish joint support.

**dailyObservations:** Subsequent AWS catalog refreshes append dated current observations; these are not backfilled from present prices.

| Actual observation date | Source | CPU $/h | GPU whole VM $/h | GPU increment $/h | CPU shapes / families | GPU shapes / families | Extrapolation |
|---|---|---:|---:|---:|---:|---:|---|
| 2016-10-26 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20161026205455/us-east-1/index.csv) | 1.01131 | 1.42729 | 0.41598 | 13 / 3 | 2 / 1 | CPU GPU |
| 2017-10-07 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20171007002655/us-east-1/index.csv) | 0.80355 | 1.18652 | 0.38297 | 26 / 6 | 5 / 2 | CPU GPU |
| 2018-10-11 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20181011211712/us-east-1/index.csv) | 0.79916 | 1.45026 | 0.65110 | 77 / 14 | 8 / 3 | CPU GPU |
| 2019-10-10 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20191010174937/us-east-1/index.csv) | 0.86079 | 1.53181 | 0.67102 | 164 / 24 | 15 / 5 | CPU GPU |
| 2020-09-24 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20200924194735/us-east-1/index.csv) | 0.66672 | 1.36746 | 0.70074 | 230 / 32 | 16 / 5 | CPU GPU |
| 2021-09-30 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20210930205019/us-east-1/index.csv) | 0.67381 | 1.33742 | 0.66361 | 281 / 40 | 17 / 6 | CPU GPU |
| 2022-10-04 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20221004190654/us-east-1/index.csv) | 0.63297 | 1.26354 | 0.63057 | 399 / 56 | 25 / 7 |  |
| 2023-09-28 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20230928174545/us-east-1/index.csv) | 0.56574 | 1.19972 | 0.63398 | 554 / 75 | 25 / 7 |  |
| 2024-09-25 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20240925190622/us-east-1/index.csv) | 0.52913 | 1.13451 | 0.60539 | 620 / 82 | 43 / 10 |  |
| 2025-09-30 | [archived-catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20250930212021/us-east-1/index.csv) | 0.49541 | 1.04528 | 0.54987 | 754 / 97 | 43 / 10 |  |
| 2026-09-29 | [current-catalog](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/US%20East%20(N.%20Virginia)/Linux/index.json) | 0.50730 | 1.02788 | 0.52058 | 999 / 113 | 50 / 11 |  |

## 2016-10-26 — archived-catalog

Published: 2016-10-26T20:54:55Z. Archive SHA-256: 058419381871dffecbed416cd266f400d598af9ca01f5f155c1aa73c0165dd4a.

CPU: A=0.44770, RAM exponent=0.60350, Geekbench exponent=0.58781. GPU k=0.001386607 USD/hour per GB/s.

Observed CPU score range [1148,10598]; RAM range [3.75,1952] GiB; per-device bandwidth range [240,240] GB/s. Rejected rows: 1.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.
- The historical CPU sample contains fewer than four machine families.
- The historical GPU sample is small; no reliable out-of-sample accuracy estimate is claimed.
- The GPU bandwidth reference is outside the observed per-device bandwidth range.

## 2017-10-07 — archived-catalog

Published: 2017-10-07T00:26:55Z. Archive SHA-256: 4253821dba1e93add3180e0adb0f7b17e724d786247bebdc5330c76d0f369ca7.

CPU: A=0.36427, RAM exponent=0.64252, Geekbench exponent=0.57068. GPU k=0.001276574 USD/hour per GB/s.

Observed CPU score range [980,10598]; RAM range [3.75,3904] GiB; per-device bandwidth range [160,240] GB/s. Rejected rows: 1.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.
- The historical GPU sample is small; no reliable out-of-sample accuracy estimate is claimed.
- The GPU bandwidth reference is outside the observed per-device bandwidth range.

## 2018-10-11 — archived-catalog

Published: 2018-10-11T21:17:12Z. Archive SHA-256: 587e5c8915a598d51855873e5eb2cd479480da12ff9d2108c27e161b3a346205.

CPU: A=0.35638, RAM exponent=0.63549, Geekbench exponent=0.58254. GPU k=0.002170341 USD/hour per GB/s.

Observed CPU score range [980,12170]; RAM range [3.75,3904] GiB; per-device bandwidth range [160,900] GB/s. Rejected rows: 1.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.

## 2019-10-10 — archived-catalog

Published: 2019-10-10T17:49:37Z. Archive SHA-256: 3cdf15496aaf8ae50508bdc3afcd702da7a28d3f16ed00540d85ccc41871e264.

CPU: A=0.36556, RAM exponent=0.62221, Geekbench exponent=0.61778. GPU k=0.002236743 USD/hour per GB/s.

Observed CPU score range [948,13492.5]; RAM range [3.75,3904] GiB; per-device bandwidth range [160,900] GB/s. Rejected rows: 1.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.

## 2020-09-24 — archived-catalog

Published: 2020-09-24T19:47:35Z. Archive SHA-256: e6ff0df71827250f32ddbffa33adcd2f59b7c4196e3e02900362df49a76f55e9.

CPU: A=0.31517, RAM exponent=0.66434, Geekbench exponent=0.54047. GPU k=0.002335802 USD/hour per GB/s.

Observed CPU score range [891,15228]; RAM range [2,3904] GiB; per-device bandwidth range [160,900] GB/s. Rejected rows: 0.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.

## 2021-09-30 — archived-catalog

Published: 2021-09-30T20:50:19Z. Archive SHA-256: 8b92a452fe01eac44f4fc1e02c29c02d878edc53d81347cd3fcf51afe74855f5.

CPU: A=0.31863, RAM exponent=0.66529, Geekbench exponent=0.54023. GPU k=0.002212035 USD/hour per GB/s.

Observed CPU score range [891,17513]; RAM range [2,6144] GiB; per-device bandwidth range [160,1555] GB/s. Rejected rows: 0.

- The CPU reference is outside at least one observed input range; the estimate extrapolates.

## 2022-10-04 — archived-catalog

Published: 2022-10-04T19:06:54Z. Archive SHA-256: 9bb5d1a847f0aab57585ef65d5c5186fdab67e2e230ea7203da69be09e9355c3.

CPU: A=0.31074, RAM exponent=0.66727, Geekbench exponent=0.51321. GPU k=0.002101891 USD/hour per GB/s.

Observed CPU score range [891,20590]; RAM range [2,6144] GiB; per-device bandwidth range [160,1555] GB/s. Rejected rows: 0.


## 2023-09-28 — archived-catalog

Published: 2023-09-28T17:45:45Z. Archive SHA-256: a0b56c929bd1be50196252c355b23f4b000f1774a5bab23097b559ff15395d6a.

CPU: A=0.29211, RAM exponent=0.69060, Geekbench exponent=0.47680. GPU k=0.002113263 USD/hour per GB/s.

Observed CPU score range [891,22539]; RAM range [2,6144] GiB; per-device bandwidth range [160,1555] GB/s. Rejected rows: 0.


## 2024-09-25 — archived-catalog

Published: 2024-09-25T19:06:22Z. Archive SHA-256: a81b91383cce33cf2aa5709ba5ea2ab74fcec599c6b91ad128192c8f454e1e79.

CPU: A=0.28224, RAM exponent=0.69864, Geekbench exponent=0.45335. GPU k=0.002017953 USD/hour per GB/s.

Observed CPU score range [891,26119]; RAM range [2,6144] GiB; per-device bandwidth range [160,1555] GB/s. Rejected rows: 0.


## 2025-09-30 — archived-catalog

Published: 2025-09-30T21:20:21Z. Archive SHA-256: 124ab45c93e9bfa9ead9e29c54c74a4b77629a371b72a6036bb98392b849daec.

CPU: A=0.27192, RAM exponent=0.71694, Geekbench exponent=0.43271. GPU k=0.001832906 USD/hour per GB/s.

Observed CPU score range [891,26370]; RAM range [2,6144] GiB; per-device bandwidth range [160,1555] GB/s. Rejected rows: 0.


## 2026-09-29 — current-catalog

Published: 2026-09-29T05:37:47.808Z. Archive SHA-256: Not an archived download.

CPU: A=0.27173, RAM exponent=0.72319, Geekbench exponent=0.45034. GPU k=0.001735257 USD/hour per GB/s.

Observed CPU score range [891,33041]; RAM range [2,6144] GiB; per-device bandwidth range [160,1597] GB/s. Rejected rows: 267.


## Reproduction and audit

Run `node scripts/fit-reference-history.mjs`. Immutable matched historical price records and archive hashes are in `data/historical-aws-prices.json`; frozen benchmark provenance is in `data/historical-benchmark-mapping.json`. The JSON report preserves every fitted price row, source, exclusion, coefficient and in-sample diagnostic. No historical predictive-accuracy claim is made.
