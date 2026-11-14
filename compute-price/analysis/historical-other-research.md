# Historical price source assessment — Google, Azure, Oracle

Researched 2026-09-29. These are source observations, not a complete historical price series. No production dataset changed.

## Assessment

Dated official posts yield useful Google GPU observations for 2017–2021 and Oracle GPU observations in 2018 and 2022. I did not establish a complete, directly downloadable, unauthenticated annual catalog for Google or Azure covering 2016–2026. Isolated announcements cannot support a dense annual historical regression without additional archival snapshots. Do not assume the rate stayed unchanged between observations, and do not treat a provider's current `effectiveStartDate` field as full historical catalog coverage.

The selected reference machine uses Geekbench 6. Older catalog prices can be matched to today's exact-VM benchmark records for a *retrospective fixed-quality reconstruction*, but the resulting series is not a contemporaneously measured benchmark index: CPU platform changes, software changes and surviving-machine selection remain limitations. Unmatched historical shapes must be excluded rather than assigned modern vCPU-normalized scores.

## Extractable official observations

All dollar rates below are USD/hour. GPU add-on quotes exclude the host unless stated otherwise.

| Observation date | Provider and scope | Recorded on-demand price | Primary source |
|---|---|---|---|
| 2017-02-21 | Google US regions, K80 GPU add-on | 0.700 per GPU | [GPU public beta announcement](https://cloud.google.com/blog/products/gcp/gpus-are-now-available-for-google-compute-engine-and-cloud-machine-learning) |
| 2017-11-20 | Google US, GPU add-ons | K80 0.45; P100 1.46 | [Official price reduction](https://cloud.google.com/blog/products/gcp/new-lower-prices-for-gpus-and-preemptible-local-ssds) |
| 2018-06-11 | Google US, standard GPU add-ons | V100 2.48; P100 1.46; K80 0.45 | [Standard and preemptible price table](https://cloud.google.com/blog/products/gcp/introducing-improved-pricing-for-preemptible-gpus) |
| 2019-04-29 | Google T4 launch article, starting price | T4 0.95; up to 30% sustained-use discount explicitly separate | [T4 general availability](https://cloud.google.com/blog/products/compute/efficiently-scale-ml-and-other-compute-workloads-on-nvidias-t4-gpu-now-generally-available) |
| 2020-01-24 | Google us-central1 T4 price reduction | Greater than 60% reduction confirmed in text; table is image and rate requires image verification | [T4 reduction](https://cloud.google.com/blog/products/ai-machine-learning/cheaper-cloud-ai-deployments-with-nvidia-t4-gpu-price-cut) |
| 2021-08-23 | Google machine example | n1-standard-4 0.19, n1-standard-96 4.56, T4 add-on 0.35; standard-4 + T4 total 0.54 | [Google/NVIDIA Triton example](https://cloud.google.com/blog/products/compute/triton-inference-server-in-gke-nvidia-google-kubernetes) |
| 2018-09-11 | Oracle Ashburn/London V100 and Ashburn/Frankfurt P100 launch | V100 2.25 per GPU; P100 1.275 per GPU, bundled instances | [GPU VM general availability](https://blogs.oracle.com/cloud-infrastructure/general-availability-of-virtual-machines-with-nvidia-gpus-on-oracle-cloud-infrastructure) |

### Oracle 2018 shapes from dated table

Multiply the per-GPU rate by GPU count for whole-instance price. The table's historical RAM figures differ from today's specifications in places, so do not silently overwrite them with current hardware data.

| Shape | GPUs | GPU model | CPU cores as published | RAM GB as published | Whole instance USD/h |
|---|---:|---|---:|---:|---:|
| BM.GPU3.8 | 8 | V100 SXM2 | 52 | 768 | 18.00 |
| VM.GPU3.4 | 4 | V100 SXM2 | 24 | 356 | 9.00 |
| VM.GPU3.2 | 2 | V100 SXM2 | 12 | 178 | 4.50 |
| VM.GPU3.1 | 1 | V100 SXM2 | 6 | 86 | 2.25 |
| BM.GPU2.2 | 2 | P100 | 28 | 192 | 2.55 |
| VM.GPU2.1 | 1 | P100 | 12 | 104 | 1.275 |

## CPU price events, not complete samples

Google's [2016-08-09 preemptible post](https://cloud.google.com/blog/products/gcp/preemptible-vms-now-up-to-33-percent-cheaper/) explicitly gives n1-standard-1 preemptible as 0.01, described as 80% below its equivalent non-preemptible machine. An implied regular rate would be 0.05, but this is reconstructed from a rounded comparison rather than a direct price quote and is not recommended for the index.

Google's [2017-03-09 announcement](https://cloud.google.com/blog/products/gcp/google-cloud-platform-your-next-home-in-the-cloud) describes a 5% US Compute Engine reduction, 4.9% Europe and 8% Tokyo. Again, a relative price event is not a full historical SKU catalog.

Google's [2017-11-17 Skylake post](https://cloud.google.com/blog/products/gcp/skylake-processors-now-available-in-seven-regions) describes a 6–10% reduction depending on shape. It also confirms platform availability expanded during N1's life: matching present-day N1 Geekbench scores to old N1 price names can therefore mix different hardware generations.

## APIs and archives examined

- Google [Catalog API schema](https://docs.cloud.google.com/billing/docs/reference/rpc/google.cloud.billing.v1): allows `start_time` and `end_time`, constrained to one calendar month in America/Los_Angeles. This is a possible future backfill route with an authorized API key; no inference about earliest supported data was established. Direct unauthenticated request for September 2016 returned HTTP 403.
- Google's old calculator endpoint `https://cloudpricingcalculator.appspot.com/static/data/pricelist.json` returned HTTP 404. Version subdomains v1/v2/v3 failed certificate hostname validation. The 2016 third-party description of that historical route is [here](https://yorktronic.github.io/gcp-pricing-data/), but it is discovery evidence only, not a current working feed.
- [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices) supplies public current prices and effective dates. Its documentation does not establish complete retired-price/catalog history. No date-based archive endpoint found in this investigation.
- [Azure's 2016-11-15 N-series launch](https://azure.microsoft.com/en-us/blog/azure-n-series-general-availability-on-december-1/) includes dated shape specs but no extractable rate in its current HTML. A current NC6 price of 0.90 is not evidence of its price in 2016.
- [Azure's primary retirement documentation](https://github.com/MicrosoftDocs/azure-compute-docs/blob/main/articles/virtual-machines/sizes/lifecycle/retirement/n-series-migration.md) says legacy NC/NCv2/ND series retired in 2023, illustrating why current catalogs cannot simply be rewound using their effective dates.
- Government-hosted supplier price PDFs exist for Google in 2022 and 2024 but are reseller-provided copies, not Google-hosted historical catalogs. They were not used.

## Implementation recommendation

Prefer a clearly labeled historical reconstruction from a single provider with genuine versioned price catalogs and exact machine matches, if another researcher establishes that source. Keep the current multi-provider reference as a separate series/marker rather than joining it to provider-only history and implying an equivalent market-wide time series. Store date, source URL, provider, region, matched sample size and model eligibility with each historical point. A sparse honest plot is preferable to interpolated or invented annual prices.
