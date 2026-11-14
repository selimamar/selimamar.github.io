# Saved compute-price models and results

This archive preserves the dataset and model results before the website was simplified to show only the linear GPU memory-bandwidth model. The original working files were not changed by archiving.

The selected GPU model is `gpu-bandwidth-linear`: estimated whole-VM hourly price is the same fitted CPU/RAM host baseline plus GPU count multiplied by a nonnegative linear coefficient and per-GPU memory bandwidth. The CPU/RAM host baseline uses system RAM and CPU Geekbench; it remains part of the GPU price estimate.

## Preserved models

`data/gpu-resource-experiments.json` includes both original three-resource fits (`gpu-resource-additive`, `gpu-resource-multiplicative`) and all four one-input experiments (`gpu-bandwidth-linear`, `gpu-vram-linear`, `gpu-bandwidth-power`, `gpu-vram-power`). Saved results include parameters, training statistics, family-held-out validation and unseen-GPU validation. The one-input comparison uses the same 82 configurations, 12 machine families and 8 GPU model groups.

`data/model.json` and `data/experiments.json` preserve the earlier CPU/GPU models and broader experiments, including CPU Geekbench and vCPU alternatives. The readable reports are in `analysis/`; the existing log-scale GPU comparison charts are preserved as PNG, PDF and SVG.

All 18 current `data/*.json` files are included, preserving prices, catalog, benchmark inputs and GPU hardware specifications. `lib/` and `scripts/` preserve the source used to fit and report the models, including provider parsers. The project README is saved at `source-README.md` to keep it distinct from this archive guide.

## Reproduction

With Node.js 22 or later, run the following from this archive directory to refit against the saved inputs (this overwrites the copies inside the archive; use a disposable copy if the archival bytes must remain intact):

```sh
node scripts/fit-model.mjs
node scripts/fit-experiments.mjs
node scripts/fit-gpu-resources.mjs
```

Do not run the price-refresh script for archival reproduction: it fetches new prices instead of retaining this snapshot. Report generation timestamps may differ on a refit. The saved chart generation script additionally requires Python and Matplotlib. Package installation is not needed for the three Node model-fitting commands.

## Integrity

`manifest.json` lists each archived source file, its original project-relative path, its byte count, and its SHA-256 digest. Every copy was checked byte-for-byte against its source immediately after creation. The manifest and this guide are archive metadata and are not included in the source-file digest list.
