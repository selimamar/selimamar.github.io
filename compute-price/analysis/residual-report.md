# Residual diagnostics for displayed price models

Uses the same family-held-out whole-machine predictions as the website fit plots. Every eligible configuration has equal weight; no tails or outliers are discarded. Historical AWS index reconstructions are not pooled into these diagnostics.

The residual is `ln(listed price) - ln(held-out predicted price)`. Positive errors mean underprediction. Gaussian mean and standard deviation use maximum likelihood (variance divisor n), without forcing the mean to zero. Histogram density integrates to one; the Gaussian curve uses the same density scale.

| Model | Price snapshot | Configurations | Families | Gaussian mean | Gaussian sigma | Skewness | Excess kurtosis | Mean absolute price error |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| CPU / cpu-geekbench | 2026-11-13T19:55:52.084Z | 2025 | 326 | 0.000487 | 0.335961 | 0.288938 | -0.131538 | 27.489921% |
| GPU / gpu-bandwidth-linear | 2026-11-13T19:55:52.084Z | 82 | 12 | 0.014341 | 0.285817 | 0.469488 | -0.731730 | 22.312419% |

A fitted bell curve does not certify a useful model. Inspect zero-centering, systematic patterns, variation across price levels, distribution shape and held-out error magnitude. Repeated sizes and shared training folds induce dependence; no iid normality p-value or calibrated prediction interval is claimed. The GPU equation was chosen after exploratory comparisons, so its reported held-out checks are not an independent validation of that selection.

Reference: [NIST residual analysis](https://www.itl.nist.gov/div898/handbook/pri/section2/pri24.htm).

Reproduce with `npm run diagnostics`; normal fit/refresh commands also regenerate these saved diagnostics. Browser plots and downloads recompute directly from the active displayed model, including newer live prices.
