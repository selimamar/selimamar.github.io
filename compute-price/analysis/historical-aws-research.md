# Official AWS historical price archive research

Retrieved 29 September 2026. This is a research input to the website history feature, not a historical fit or a multi-provider price index.

## Deliverables

- `tmp/history-aws/annual-snapshots.json`: 10 official archive extracts, 3,317 matched configuration records, 2.69 MB. Contains exact archive URL, full-source SHA-256, complete byte/row counts, publication date, effective window, SKU/rate provenance and rejected hardware matches.
- `tmp/history-aws/{year}-matched.json`: the individual extract for each year.
- `tmp/history-aws/version-index.json`: exact downloaded AWS version index.
- `tmp/history-aws/selected-versions.json`: original selected archive versions. Its initial `asOf` is a selection target, not a point timestamp; use each extracted `date`/`publicationDate` instead.
- `scripts/import-historical-aws.py`: reproducible streaming importer with project-root-relative paths, configurable output/cache directories, strict hardware matching, source hashes and cached filtered extracts. It never retains a complete large source archive.
- Hardware and modern benchmark provenance are separately saved in `data/historical-benchmark-mapping.json`.

## Source and date selection

AWS documents the official public historical version index and regional JSON/CSV download format in [Getting price list files manually](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html). The [service version index definitions](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/service-version-index-file-for-aws-service.html) describe the version effective window, which differs from the publication date. The downloaded [Amazon EC2 version index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/index.json) contains 122 versions from December 2015 through September 2026.

For 2017–2025, select the version whose effective interval includes 29 September and plot its actual CSV publication date. Finalized monthly archives can be published in early October. The initial 2016 selection was published 1 September and had no matched GPU offerings; the history uses the next available archive, published 26 October, which includes P2. This archive is effective 1 October–1 December. Do not label these archive values as prices observed on 29 September, or as annual averages. The original product price effective date is retained separately for every row.

The 2016 CSV metadata carries a legacy `Version` field of `20150430235959`; do not mistake that for the date of this archived file. The official URL version is `20161026205455` and the CSV publication timestamp is `2016-10-26T20:54:55Z`. These are preserved verbatim.

| Year | Archive publication | CPU rows / families | GPU rows / families | Official archive |
|---|---|---:|---:|---|
| 2016 | 2016-10-26 | 13 / 3 | 2 / 1 | [20161026205455](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20161026205455/us-east-1/index.csv) |
| 2017 | 2017-10-07 | 26 / 6 | 5 / 2 | [20171007002655](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20171007002655/us-east-1/index.csv) |
| 2018 | 2018-10-11 | 77 / 14 | 8 / 3 | [20181011211712](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20181011211712/us-east-1/index.csv) |
| 2019 | 2019-10-10 | 164 / 24 | 15 / 5 | [20191010174937](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20191010174937/us-east-1/index.csv) |
| 2020 | 2020-09-24 | 230 / 32 | 16 / 5 | [20200924194735](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20200924194735/us-east-1/index.csv) |
| 2021 | 2021-09-30 | 281 / 40 | 17 / 6 | [20210930205019](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20210930205019/us-east-1/index.csv) |
| 2022 | 2022-10-04 | 399 / 56 | 25 / 7 | [20221004190654](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20221004190654/us-east-1/index.csv) |
| 2023 | 2023-09-28 | 554 / 75 | 25 / 7 | [20230928174545](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20230928174545/us-east-1/index.csv) |
| 2024 | 2024-09-25 | 620 / 82 | 43 / 10 | [20240925190622](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20240925190622/us-east-1/index.csv) |
| 2025 | 2025-09-30 | 754 / 97 | 43 / 10 | [20250930212021](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/20250930212021/us-east-1/index.csv) |

The 2026 endpoint can come from the site's existing AWS price snapshot dated 29 September 2026. No separate 303 MB 2026 CSV was downloaded. Its provenance must retain the current catalog source and observation date instead of being presented as a downloaded archival file. Keep an AWS-only 2026 estimate on the AWS historical series. Display the current multi-provider reference price separately rather than joining it to the AWS line.

## Filters and matching

Archive rows must be US East (N. Virginia), USD, Linux, shared tenancy, ordinary OnDemand, no pre-installed software, positive hourly rates, `Compute Instance`, and `Used` capacity when that column exists. Reserved, dedicated, software-bundled and Spot prices are excluded. No duplicate matching rate rows remained for any selected machine.

The match is the exact AWS instance type in the saved hardware/benchmark mapping. Archived nominal RAM and vCPU count must match; GPU count is also checked when the archive provides it. All matched archived prices are retained, including old generation machines still listed. There are no invented prices or assumed year-over-year reductions.

Four rows were rejected: `p2.16xlarge` in the 2016–2019 archives lists 768 GiB, whereas the current matched benchmark mapping uses 732 GiB. Although the [original AWS P2 announcement](https://aws.amazon.com/blogs/aws/new-p2-instance-type-for-amazon-ec2-up-to-16-gpus/) also gives 732 GiB, the inconsistency was not silently corrected. From 2020 onward the archive matches 732 GiB. Consequently the first GPU sample is only two P2 configurations from one family; that period requires a conspicuous weak-coverage limitation.

## Interpretation limits

The source dates establish historical prices. They do **not** establish historical Geekbench performance: Geekbench 6 did not exist in 2016. Each same-named instance is assigned its present saved Geekbench 6 measurement and documented GPU bandwidth, making this a retrospective reconstruction using a fixed modern performance scale. It cannot account for historical changes in host CPUs, firmware, mitigations, hypervisors, software or achievable bandwidth. Exact instance name and nominal RAM/vCPU/GPU matching helps but cannot remove those differences.

The surviving benchmark-covered catalog is not the entire historical market. Early points have sparse machine-family coverage and a small reference machine can be an extrapolation. Archive membership changes as later families become available, so fitted reference values combine documented price changes with changes in sampled hardware. Report this as an **AWS-only historical estimate**, not the exact past value of today's multi-provider model. No inflation adjustment is applied to nominal USD prices.

## Verification performed

All 10 archives were streamed to completion and hashed. Matching records have positive prices, nonmissing modern CPU scores and nominal resource agreement; no duplicate instance matches or record effective dates after archive publication were found. Large source files were not retained. The small initial 2016 research CSV is unrelated to the selected final 2016 archive and is not a website data source.

## Reproducing or refreshing the archive

The importer uses only the Python 3.9+ standard library. Its paths are resolved relative to the script's project root, so it also works when launched from another working directory. The default produces the 2016–2025 archive input; the application's current AWS catalog supplies the latest point.

```sh
python3 scripts/import-historical-aws.py
```

The default destination is `data/historical-aws-prices.json` and the default cache is `.cache/historical-aws`. To reproduce this session's extracts without downloading the original CSV files again:

```sh
python3 scripts/import-historical-aws.py --cache-dir tmp/history-aws --output tmp/history-aws/reproduced-snapshots.json
```

Use `--refresh` to bypass cached source index and filtered extracts. This streams approximately 1.24 GB across the ten verified archives; the retained JSON is approximately 2.7 MB. Use `--years 2018 2020 2025` to extract a smaller selected set, or `--mapping PATH` to use an explicitly saved alternative mapping. `--output`, `--cache-dir` and `--mapping` accept absolute or project-relative paths.

The script refuses unexpected duplicate rates, partial HTTP downloads, record prices effective after publication and ambiguous index windows. A failed archive does not overwrite the combined destination with a partial series. The original `Content-Length`, ETag, source index hash and each complete CSV SHA-256 are retained for provenance; a filtered cache cannot independently establish its own original-source hash without fetching the source again.

An offline reproduction using all ten completed extracts was checked against the initially delivered data: every source URL, SHA-256, byte count, publication date, matched record and rejected hardware match agrees. The changed build timestamp is expected.
