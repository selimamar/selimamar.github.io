# GPU resource models: sum versus product

Prices: 2026-11-13T19:55:52.084Z. Generated: 2026-11-13T19:56:34.572Z. Model version: 1.1.0.

Both models include a RAM + CPU Geekbench host baseline. GPU inputs F (dense FP32 TFLOPS), B (memory bandwidth in decimal GB/s), and V (source-normalized VRAM GiB) are per device. n is the whole identical GPU count.

- Additive GPU contribution: `P = P_host + n × [aF + bB + cV]`.
- Multiplicative GPU contribution: `P = P_host + n × A(F/30)^alpha(B/1000)^beta(V/40)^gamma`.

These are fixed, prespecified forms on the same eligible configurations. Their held-out results are exploratory comparisons, not an independent validation of choosing the lower-error model afterward.

**host:** CPU-only RAM + whole-VM CPU Geekbench power law, refitted without the test host families in every validation split.

**additive:** P = CPUbaseline + n × [a F + b B + c V], with a,b,c ≥ 0.

**multiplicative:** P = CPUbaseline + n × A × (F/30)^α × (B/1000)^β × (V/40)^γ, with A > 0 and α,β,γ ≥ 0.

**units:** F is dense FP32 TFLOPS per GPU; B is memory bandwidth in decimal GB/s per GPU; V is source-normalized nominal VRAM GiB per GPU; n is the integer count of identical full GPUs, applied exactly once.

**objective:** Both GPU forms minimize the equally weighted mean across training machine families of mean squared log(full predicted VM price / actual VM price). No residual-price rows are discarded. The CPU baseline uses ordinary least squares on CPU-only log prices.

**solver:** Deterministic multiple starting points, projected damped Gauss–Newton, first-order optimality checked at tolerance 1e-7. No regularization or validation-tuned parameters. This numerical check does not prove a global optimum.

**uncertainty:** No coefficient confidence intervals are estimated. These correlated hardware specifications cannot establish causal component prices.

**comparison:** Both fixed formulas use exactly the same complete cohort, training/test boundaries and objective. Family and unseen-GPU-model results are reported separately; neither model is automatically selected.

## Coverage

```json
{
  "catalogCount": 4062,
  "catalogGpuCount": 324,
  "eligibleCount": 82,
  "cpuBaselineCount": 2025,
  "missingMetrics": {
    "ramGiB": 15,
    "cpuScore": 223,
    "fp32PerGpuTflops": 54,
    "bandwidthPerGpuGBps": 55,
    "vramPerGpuGiB": 68,
    "gpuCount": 0
  },
  "familyCount": 12,
  "gpuModelCount": 8,
  "providers": [
    "aws",
    "azure",
    "gcp"
  ],
  "exclusions": {
    "stale": 0,
    "sharedCpu": 65,
    "otherAccelerator": 42,
    "fractionalOrUnknownGpu": 20
  },
  "note": "Missing-metric counts overlap. Every candidate uses the same complete observations; no performance or price is imputed."
}
```

## Whole machine families held out

| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |
|---|---:|---:|---:|---:|
| CPU baseline + additive GPU resources | 82/82 | 22.31% | 27.67% | 0.934743 |
| CPU baseline + multiplicative GPU resources | 82/82 | 24.49% | 29.44% | 0.932633 |

## Whole GPU models held out

| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |
|---|---:|---:|---:|---:|
| CPU baseline + additive GPU resources | 82/82 | 26.02% | 31.82% | 0.891264 |
| CPU baseline + multiplicative GPU resources | 82/82 | 33.13% | 39.89% | 0.867164 |

## VRAM only versus bandwidth only

82 identical configurations, 12 families, 8 GPU models. All four retain the RAM + CPU Geekbench host baseline and apply GPU count once.

Bandwidth-only and VRAM-only linear and power-law formulas are each refitted on the identical complete cohort, using the same CPU Geekbench/RAM baseline, full-VM log-price loss with equal machine-family weights, and held-out families or GPU hardware models. GPU count is applied once. This is a direct comparison of fixed single-resource models, not a reinterpretation of the earlier three-resource validation.

### Whole machine families held out

| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |
|---|---:|---:|---:|---:|
| Bandwidth only · linear | 82/82 | 22.31% | 27.67% | 0.934743 |
| VRAM only · linear | 82/82 | 37.95% | 38.98% | 0.783400 |
| Bandwidth only · power law | 82/82 | 24.49% | 29.44% | 0.932633 |
| VRAM only · power law | 82/82 | 39.25% | 38.63% | 0.816946 |

### Whole GPU models held out

| Model | Tested | Mean absolute percentage error | Equal-family error | Log R² |
|---|---:|---:|---:|---:|
| Bandwidth only · linear | 82/82 | 25.25% | 30.90% | 0.908746 |
| VRAM only · linear | 82/82 | 43.28% | 43.15% | 0.711971 |
| Bandwidth only · power law | 82/82 | 32.71% | 39.38% | 0.877406 |
| VRAM only · power law | 82/82 | 49.48% | 45.13% | 0.696919 |

### Bandwidth only · linear

`P = P_host + n × 0.001712 × B`

Approximate predictive fit. B = per-GPU memory bandwidth GB/s; V = per-GPU source-normalized VRAM GiB. CPU baseline as above; prices in USD/hour.

| Parameter | Fitted value |
|---|---:|
| bandwidthPerGpuGBps | 0.001712 |

### VRAM only · linear

`P = P_host + n × 0.040340 × V`

Poor generalization. B = per-GPU memory bandwidth GB/s; V = per-GPU source-normalized VRAM GiB. CPU baseline as above; prices in USD/hour.

| Parameter | Fitted value |
|---|---:|
| vramPerGpuGiB | 0.040340 |

### Bandwidth only · power law

`P = P_host + n × 1.660071 × (B/1000.000000)^0.877733`

Approximate predictive fit. B = per-GPU memory bandwidth GB/s; V = per-GPU source-normalized VRAM GiB. CPU baseline as above; prices in USD/hour.

| Parameter | Fitted value |
|---|---:|
| A | 1.660071 |
| bandwidthPerGpuGBps | 0.877733 |

### VRAM only · power law

`P = P_host + n × 1.374565 × (V/40.000000)^0.499253`

Poor generalization. B = per-GPU memory bandwidth GB/s; V = per-GPU source-normalized VRAM GiB. CPU baseline as above; prices in USD/hour.

| Parameter | Fitted value |
|---|---:|
| A | 1.374565 |
| vramPerGpuGiB | 0.499253 |

Reduced equations are refitted inside every fold; earlier three-input models could use different nonzero inputs in their validation folds. All below-baseline price rows remain in the objective. Common-prediction errors and full-cohort completion are disclosed; comparisons are exploratory, without an independently validated winner selection.

## Previous model on the same configurations

Previous joint RAM × CPU Geekbench × VRAM × FP32 power law: 82 rows, 12 families, 82 tested; mean error **34.35%**, log R² **0.812318**. Refitted and tested on the identical complete cohort and family boundaries. Both the function and fitting objective differ from the new models, so this is not an isolated test of memory bandwidth.

## CPU baseline + additive GPU resources

Approximate predictive fit. Status: fitted.

| Parameter | Fitted value |
|---|---:|
| fp32PerGpuTflops | 0.000000 |
| bandwidthPerGpuGBps | 0.001712 |
| vramPerGpuGiB | 0.000000 |

Full fitted structure and solver diagnostics:

```json
{
  "kind": "additive",
  "resourceKeys": [
    "fp32PerGpuTflops",
    "bandwidthPerGpuGBps",
    "vramPerGpuGiB"
  ],
  "cpuFit": {
    "A": 0.2588813245147291,
    "logA": -1.3513855287981165,
    "slopes": [
      0.7183982234597279,
      0.4485938652867098
    ],
    "keys": [
      "ramGiB",
      "cpuScore"
    ],
    "reference": {
      "ramGiB": 16,
      "cpuScore": 5000
    },
    "maxVif": 2.417184868698356
  },
  "reference": {
    "fp32PerGpuTflops": 30,
    "bandwidthPerGpuGBps": 1000,
    "vramPerGpuGiB": 40
  },
  "coefficients": [
    0,
    1.7124656095778965,
    0
  ],
  "rawCoefficients": [
    0,
    0.0017124656095778964,
    0
  ],
  "diagnostics": {
    "solver": "Deterministic multistart projected damped Gauss–Newton",
    "objective": "Equal-family mean squared log error of complete VM hourly prices",
    "starts": 5,
    "convergedStarts": 5,
    "maxIterations": 500,
    "cpuTrainingCount": 2025,
    "cpuExcludedFamilies": [],
    "gpuTrainingCount": 82,
    "atOrBelowCpuBaselineCount": 2,
    "attempts": [
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 6,
        "loss": 0.09094270919137834,
        "optimality": 2.69431462249399e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 6,
        "loss": 0.09094270919137856,
        "optimality": 2.8483746892160253e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 6,
        "loss": 0.09094270919137758,
        "optimality": 1.9827305444827456e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 6,
        "loss": 0.09094270919137798,
        "optimality": 2.4020937619204097e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 7,
        "loss": 0.09094270919137762,
        "optimality": 1.963927316280846e-8
      }
    ],
    "loss": 0.09094270919137758,
    "projectedGradientMax": 1.9827305444827456e-8,
    "iterations": 6,
    "jacobianRank": 3,
    "parameterCount": 3,
    "boundParameters": [
      0,
      2
    ],
    "convergedLossRange": [
      0.09094270919137758,
      0.09094270919137856
    ],
    "globalOptimumGuaranteed": false
  }
}
```

Training diagnostics: {"method":"Training fit; descriptive and not a generalization estimate.","groups":12,"completedGroups":12,"skippedGroups":[],"testedCount":82,"coverage":1,"mape":0.21579007667536748,"medianApe":0.19164019091237516,"familyMape":0.2569352343796159,"familyLogMse":0.0909427091913776,"rmsle":0.27199763892090156,"logR2":0.9410495293139737,"priceR2":0.880115481482624,"within20":0.5,"predictions":[{"id":"aws:g4dn.12xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.12xlarge","actual":3.912,"predicted":4.388516699079034},{"id":"aws:g4dn.16xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.16xlarge","actual":4.352,"predicted":3.282103926827258},{"id":"aws:g4dn.2xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.2xlarge","actual":0.752,"predicted":0.9447012640987169},{"id":"aws:g4dn.4xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.4xlarge","actual":1.204,"predicted":1.3640070656332512},{"id":"aws:g4dn.8xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.8xlarge","actual":2.176,"predicted":2.117648709111211},{"id":"aws:g4dn.metal","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.metal","actual":7.824,"predicted":8.269242535431259},{"id":"aws:g4dn.xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.xlarge","actual":0.526,"predicted":0.7341044861344965},{"id":"aws:g5.12xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.12xlarge","actual":5.672,"predicted":6.47892847952423},{"id":"aws:g5.16xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.16xlarge","actual":4.096,"predicted":4.045266223441251},{"id":"aws:g5.24xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.24xlarge","actual":8.144,"predicted":8.232694545428597},{"id":"aws:g5.2xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.2xlarge","actual":1.212,"predicted":1.4626331300306086},{"id":"aws:g5.48xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.48xlarge","actual":16.288,"predicted":14.871158259690784},{"id":"aws:g5.4xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.4xlarge","actual":1.624,"predicted":1.881272780907242},{"id":"aws:g5.8xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.8xlarge","actual":2.448,"predicted":2.684766454200442},{"id":"aws:g5.xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.xlarge","actual":1.006,"predicted":1.234936661749054},{"id":"aws:g6.12xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.12xlarge","actual":4.6016,"predicted":4.648120384515942},{"id":"aws:g6.16xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.16xlarge","actual":3.3968,"predicted":3.766016269641363},{"id":"aws:g6.24xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.24xlarge","actual":6.6752,"predicted":6.506352127899615},{"id":"aws:g6.2xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.2xlarge","actual":0.9776,"predicted":0.9994513870838082},{"id":"aws:g6.48xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.48xlarge","actual":13.3504,"predicted":11.262220728655382},{"id":"aws:g6.4xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.4xlarge","actual":1.3232,"predicted":1.4734808892384161},{"id":"aws:g6.8xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.8xlarge","actual":2.0144,"predicted":2.353527575010637},{"id":"aws:g6.xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.xlarge","actual":0.8048,"predicted":0.7407734584163027},{"id":"aws:g6e.12xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.12xlarge","actual":10.49264,"predicted":10.161162276358734},{"id":"aws:g6e.16xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.16xlarge","actual":7.57719,"predicted":6.8304285256468615},{"id":"aws:g6e.24xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.24xlarge","actual":15.06559,"predicted":13.293864032000409},{"id":"aws:g6e.2xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.2xlarge","actual":2.24208,"predicted":2.2676205533627605},{"id":"aws:g6e.48xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.48xlarge","actual":30.13118,"predicted":23.450563923215327},{"id":"aws:g6e.4xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.4xlarge","actual":3.00424,"predicted":3.049371628132447},{"id":"aws:g6e.8xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.8xlarge","actual":4.52856,"predicted":4.493697945640485},{"id":"aws:g6e.xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.xlarge","actual":1.861,"predicted":1.855737101592792},{"id":"aws:g7e.12xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.12xlarge","actual":8.28608,"predicted":11.31174232278308},{"id":"aws:g7e.24xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.24xlarge","actual":16.57216,"predicted":20.81464258442805},{"id":"aws:g7e.2xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.2xlarge","actual":3.36312,"predicted":3.6365188757549376},{"id":"aws:g7e.48xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.48xlarge","actual":33.14432,"predicted":37.6752467924082},{"id":"aws:g7e.4xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.4xlarge","actual":3.99816,"predicted":4.560723497485296},{"id":"aws:g7e.8xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.8xlarge","actual":5.26824,"predicted":6.146311858317244},{"id":"aws:gr6.4xlarge","family":"aws:gr6","validationGroup":"aws:gr6","provider":"aws","name":"gr6.4xlarge","actual":1.5392,"predicted":2.1000742183808905},{"id":"aws:gr6.8xlarge","family":"aws:gr6","validationGroup":"aws:gr6","provider":"aws","name":"gr6.8xlarge","actual":2.4464,"predicted":3.546013448590788},{"id":"aws:p3.16xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.16xlarge","actual":24.48,"predicted":16.200127121163234},{"id":"aws:p3.2xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.2xlarge","actual":3.06,"predicted":2.1099070238365263},{"id":"aws:p3.8xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.8xlarge","actual":12.24,"predicted":8.408959928288812},{"id":"aws:p3dn.24xlarge","family":"aws:p3dn","validationGroup":"aws:p3dn","provider":"aws","name":"p3dn.24xlarge","actual":31.212,"predicted":18.46955562530959},{"id":"aws:p4d.24xlarge","family":"aws:p4d","validationGroup":"aws:p4d","provider":"aws","name":"p4d.24xlarge","actual":21.957642,"predicted":29.87323894564212},{"id":"azure:nc24ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC24ads_A100_v4","actual":3.673,"predicted":6.0909356162766795},{"id":"azure:nc48ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC48ads_A100_v4","actual":7.346,"predicted":11.586661642366025},{"id":"azure:nc96ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC96ads_A100_v4","actual":14.692,"predicted":21.357758019725075},{"id":"gcp:g2-standard-12","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-12","actual":1.000416348,"predicted":1.102913149068256},{"id":"gcp:g2-standard-16","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-16","actual":1.147208384,"predicted":1.310709963826699},{"id":"gcp:g2-standard-24","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-24","actual":2.000832696,"predicted":2.1947987466128107},{"id":"gcp:g2-standard-32","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-32","actual":1.734376528,"predicted":2.0404720804471674},{"id":"gcp:g2-standard-4","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-4","actual":0.706832276,"predicted":0.6962582535657429},{"id":"gcp:g2-standard-48","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-48","actual":4.001665392,"predicted":4.203702424978468},{"id":"gcp:g2-standard-8","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-8","actual":0.853624312,"predicted":0.8998515385774664},{"id":"gcp:g2-standard-96","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-96","actual":8.003330784,"predicted":7.807558375663531},{"id":"gcp:n1-highmem-16 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-16 + 1× P4","actual":1.546424,"predicted":1.401533135664201},{"id":"gcp:n1-highmem-16 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-16 + 1× T4","actual":1.296424,"predicted":1.6207287336901715},{"id":"gcp:n1-highmem-2 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× P4","actual":0.718303,"predicted":0.44295966139390475},{"id":"gcp:n1-highmem-2 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× T4","actual":0.46830299999999997,"predicted":0.6621552594198755},{"id":"gcp:n1-highmem-2 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× V100","actual":2.598303,"predicted":1.6553853129750555},{"id":"gcp:n1-highmem-32 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-32 + 1× T4","actual":2.242848,"predicted":2.6060178340578126},{"id":"gcp:n1-highmem-4 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× P4","actual":0.836606,"predicted":0.573787952681992},{"id":"gcp:n1-highmem-4 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× T4","actual":0.586606,"predicted":0.7929835507079628},{"id":"gcp:n1-highmem-4 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× V100","actual":2.716606,"predicted":1.7862136042631427},{"id":"gcp:n1-highmem-8 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× P4","actual":1.073212,"predicted":0.841267177623176},{"id":"gcp:n1-highmem-8 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× T4","actual":0.823212,"predicted":1.060462775649147},{"id":"gcp:n1-highmem-8 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× V100","actual":2.953212,"predicted":2.053692829204327},{"id":"gcp:n1-standard-1 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× P4","actual":0.6474997499999999,"predicted":0.3710536900395821},{"id":"gcp:n1-standard-1 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× T4","actual":0.39749975,"predicted":0.5902492880655529},{"id":"gcp:n1-standard-1 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× V100","actual":2.52749975,"predicted":1.583479341620733},{"id":"gcp:n1-standard-16 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-16 + 1× P4","actual":1.359996,"predicted":1.0474211431472238},{"id":"gcp:n1-standard-16 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-16 + 1× T4","actual":1.109996,"predicted":1.2666167411731948},{"id":"gcp:n1-standard-2 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× P4","actual":0.6949995,"predicted":0.40513831770809716},{"id":"gcp:n1-standard-2 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× T4","actual":0.4449995,"predicted":0.6243339157340679},{"id":"gcp:n1-standard-2 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× V100","actual":2.5749995,"predicted":1.6175639692892478},{"id":"gcp:n1-standard-32 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-32 + 1× T4","actual":1.8699919999999999,"predicted":1.9058999998249004},{"id":"gcp:n1-standard-4 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× P4","actual":0.789999,"predicted":0.49425266704211457},{"id":"gcp:n1-standard-4 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× T4","actual":0.539999,"predicted":0.7134482650680853},{"id":"gcp:n1-standard-4 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× V100","actual":2.669999,"predicted":1.7066783186232655},{"id":"gcp:n1-standard-8 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× P4","actual":0.9799979999999999,"predicted":0.676693253618051},{"id":"gcp:n1-standard-8 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× T4","actual":0.7299979999999999,"predicted":0.8958888516440218},{"id":"gcp:n1-standard-8 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× V100","actual":2.859998,"predicted":1.889118905199202}]}

- FP32 and memory bandwidth are advertised hardware peaks, not measured application or cloud-VM performance.
- The CPU baseline is an estimated host contribution, not a separately observed billable component.
- GPU terms and the linear GPU-count multiplier are nonnegative modeling assumptions, not causal resource prices.
- Both forms are fixed comparisons; choosing the lower error after inspecting these results has not received independent validation.
- VRAM retains source-normalized nominal memory conventions; it does not measure usable device bytes.
- One or more GPU coefficients or exponents reached zero under the nonnegative constraint. That term adds no fitted contribution conditional on the other resources in this sample; it does not mean the hardware resource has no value.
- Some observed VM prices are below the predicted CPU baseline; these rows are retained in the fitting loss.

## CPU baseline + multiplicative GPU resources

Approximate predictive fit. Status: fitted.

| Parameter | Fitted value |
|---|---:|
| A | 1.660071 |
| fp32PerGpuTflops | 0.000000 |
| bandwidthPerGpuGBps | 0.877733 |
| vramPerGpuGiB | 0.000000 |

Full fitted structure and solver diagnostics:

```json
{
  "kind": "multiplicative",
  "resourceKeys": [
    "fp32PerGpuTflops",
    "bandwidthPerGpuGBps",
    "vramPerGpuGiB"
  ],
  "cpuFit": {
    "A": 0.2588813245147291,
    "logA": -1.3513855287981165,
    "slopes": [
      0.7183982234597279,
      0.4485938652867098
    ],
    "keys": [
      "ramGiB",
      "cpuScore"
    ],
    "reference": {
      "ramGiB": 16,
      "cpuScore": 5000
    },
    "maxVif": 2.417184868698356
  },
  "reference": {
    "fp32PerGpuTflops": 30,
    "bandwidthPerGpuGBps": 1000,
    "vramPerGpuGiB": 40
  },
  "A": 1.6600707944812751,
  "logA": 0.5068602487369592,
  "slopes": [
    0,
    0.8777333162848892,
    0
  ],
  "diagnostics": {
    "solver": "Deterministic multistart projected damped Gauss–Newton",
    "objective": "Equal-family mean squared log error of complete VM hourly prices",
    "starts": 6,
    "convergedStarts": 6,
    "maxIterations": 500,
    "cpuTrainingCount": 2025,
    "cpuExcludedFamilies": [],
    "gpuTrainingCount": 82,
    "atOrBelowCpuBaselineCount": 2,
    "attempts": [
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 8,
        "loss": 0.0884981729720521,
        "optimality": 7.722662504104573e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 8,
        "loss": 0.0884981729720542,
        "optimality": 8.561280605902692e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 8,
        "loss": 0.08849817297204703,
        "optimality": 4.944847625533129e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 8,
        "loss": 0.08849817297204365,
        "optimality": 1.3497889604343e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 6,
        "loss": 0.08849817297204433,
        "optimality": 2.5270969001943552e-8
      },
      {
        "converged": true,
        "reason": "projected-gradient",
        "iterations": 8,
        "loss": 0.08849817297205251,
        "optimality": 7.857532045900612e-8
      }
    ],
    "loss": 0.08849817297204365,
    "projectedGradientMax": 1.3497889604343e-8,
    "iterations": 8,
    "jacobianRank": 4,
    "parameterCount": 4,
    "boundParameters": [
      1,
      3
    ],
    "convergedLossRange": [
      0.08849817297204365,
      0.0884981729720542
    ],
    "globalOptimumGuaranteed": false
  }
}
```

Training diagnostics: {"method":"Training fit; descriptive and not a generalization estimate.","groups":12,"completedGroups":12,"skippedGroups":[],"testedCount":82,"coverage":1,"mape":0.22579123392770808,"medianApe":0.19871235023902878,"familyMape":0.2539903048302193,"familyLogMse":0.08849817297204365,"rmsle":0.27067831352389266,"logR2":0.9416200212481352,"priceR2":0.8944494443581436,"within20":0.5121951219512195,"predictions":[{"id":"aws:g4dn.12xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.12xlarge","actual":3.912,"predicted":4.639092649465214},{"id":"aws:g4dn.16xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.16xlarge","actual":4.352,"predicted":3.344747914423803},{"id":"aws:g4dn.2xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.2xlarge","actual":0.752,"predicted":1.007345251695262},{"id":"aws:g4dn.4xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.4xlarge","actual":1.204,"predicted":1.4266510532297962},{"id":"aws:g4dn.8xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.8xlarge","actual":2.176,"predicted":2.180292696707756},{"id":"aws:g4dn.metal","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.metal","actual":7.824,"predicted":8.770394436203619},{"id":"aws:g4dn.xlarge","family":"aws:g4dn","validationGroup":"aws:g4dn","provider":"aws","name":"g4dn.xlarge","actual":0.526,"predicted":0.7967484737310415},{"id":"aws:g5.12xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.12xlarge","actual":5.672,"predicted":6.609955250183919},{"id":"aws:g5.16xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.16xlarge","actual":4.096,"predicted":4.078022916106174},{"id":"aws:g5.24xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.24xlarge","actual":8.144,"predicted":8.363721316088286},{"id":"aws:g5.2xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.2xlarge","actual":1.212,"predicted":1.495389822695531},{"id":"aws:g5.48xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.48xlarge","actual":16.288,"predicted":15.133211801010162},{"id":"aws:g5.4xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.4xlarge","actual":1.624,"predicted":1.9140294735721644},{"id":"aws:g5.8xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.8xlarge","actual":2.448,"predicted":2.7175231468653642},{"id":"aws:g5.xlarge","family":"aws:g5","validationGroup":"aws:g5","provider":"aws","name":"g5.xlarge","actual":1.006,"predicted":1.2676933544139763},{"id":"aws:g6.12xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.12xlarge","actual":4.6016,"predicted":4.901176006411026},{"id":"aws:g6.16xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.16xlarge","actual":3.3968,"predicted":3.8292801751151337},{"id":"aws:g6.24xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.24xlarge","actual":6.6752,"predicted":6.759407749794699},{"id":"aws:g6.2xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.2xlarge","actual":0.9776,"predicted":1.062715292557579},{"id":"aws:g6.48xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.48xlarge","actual":13.3504,"predicted":11.768331972445548},{"id":"aws:g6.4xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.4xlarge","actual":1.3232,"predicted":1.536744794712187},{"id":"aws:g6.8xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.8xlarge","actual":2.0144,"predicted":2.4167914804844077},{"id":"aws:g6.xlarge","family":"aws:g6","validationGroup":"aws:g6","provider":"aws","name":"g6.xlarge","actual":0.8048,"predicted":0.8040373638900735},{"id":"aws:g6e.12xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.12xlarge","actual":10.49264,"predicted":10.083550160856252},{"id":"aws:g6e.16xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.16xlarge","actual":7.57719,"predicted":6.811025496771241},{"id":"aws:g6e.24xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.24xlarge","actual":15.06559,"predicted":13.216251916497926},{"id":"aws:g6e.2xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.2xlarge","actual":2.24208,"predicted":2.24821752448714},{"id":"aws:g6e.48xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.48xlarge","actual":30.13118,"predicted":23.295339692210362},{"id":"aws:g6e.4xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.4xlarge","actual":3.00424,"predicted":3.0299685992568266},{"id":"aws:g6e.8xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.8xlarge","actual":4.52856,"predicted":4.4742949167648645},{"id":"aws:g6e.xlarge","family":"aws:g6e","validationGroup":"aws:g6e","provider":"aws","name":"g6e.xlarge","actual":1.861,"predicted":1.8363340727171713},{"id":"aws:g7e.12xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.12xlarge","actual":8.28608,"predicted":10.849432829052756},{"id":"aws:g7e.24xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.24xlarge","actual":16.57216,"predicted":19.890023596967403},{"id":"aws:g7e.2xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.2xlarge","actual":3.36312,"predicted":3.405364128889776},{"id":"aws:g7e.48xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.48xlarge","actual":33.14432,"predicted":35.82600881748691},{"id":"aws:g7e.4xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.4xlarge","actual":3.99816,"predicted":4.329568750620134},{"id":"aws:g7e.8xlarge","family":"aws:g7e","validationGroup":"aws:g7e","provider":"aws","name":"g7e.8xlarge","actual":5.26824,"predicted":5.915157111452082},{"id":"aws:gr6.4xlarge","family":"aws:gr6","validationGroup":"aws:gr6","provider":"aws","name":"gr6.4xlarge","actual":1.5392,"predicted":2.163338123854661},{"id":"aws:gr6.8xlarge","family":"aws:gr6","validationGroup":"aws:gr6","provider":"aws","name":"gr6.8xlarge","actual":2.4464,"predicted":3.6092773540645586},{"id":"aws:p3.16xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.16xlarge","actual":24.48,"predicted":15.977853668896397},{"id":"aws:p3.2xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.2xlarge","actual":3.06,"predicted":2.082122842303172},{"id":"aws:p3.8xlarge","family":"aws:p3","validationGroup":"aws:p3","provider":"aws","name":"p3.8xlarge","actual":12.24,"predicted":8.297823202155392},{"id":"aws:p3dn.24xlarge","family":"aws:p3dn","validationGroup":"aws:p3dn","provider":"aws","name":"p3dn.24xlarge","actual":31.212,"predicted":18.24728217304275},{"id":"aws:p4d.24xlarge","family":"aws:p4d","validationGroup":"aws:p4d","provider":"aws","name":"p4d.24xlarge","actual":21.957642,"predicted":28.13628844592119},{"id":"azure:nc24ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC24ads_A100_v4","actual":3.673,"predicted":5.740481106787049},{"id":"azure:nc48ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC48ads_A100_v4","actual":7.346,"predicted":10.885752623386765},{"id":"azure:nc96ads_a100_v4","family":"azure:NCads_A100_v4","validationGroup":"azure:NCads_A100_v4","provider":"azure","name":"Standard_NC96ads_A100_v4","actual":14.692,"predicted":19.955939981766555},{"id":"gcp:g2-standard-12","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-12","actual":1.000416348,"predicted":1.1661770545420267},{"id":"gcp:g2-standard-16","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-16","actual":1.147208384,"predicted":1.37397386930047},{"id":"gcp:g2-standard-24","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-24","actual":2.000832696,"predicted":2.3213265575603526},{"id":"gcp:g2-standard-32","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-32","actual":1.734376528,"predicted":2.1037359859209386},{"id":"gcp:g2-standard-4","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-4","actual":0.706832276,"predicted":0.7595221590395137},{"id":"gcp:g2-standard-48","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-48","actual":4.001665392,"predicted":4.456758046873551},{"id":"gcp:g2-standard-8","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-8","actual":0.853624312,"predicted":0.9631154440512372},{"id":"gcp:g2-standard-96","family":"gcp:g2","validationGroup":"gcp:g2","provider":"gcp","name":"g2-standard-96","actual":8.003330784,"predicted":8.313669619453696},{"id":"gcp:n1-highmem-16 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-16 + 1× P4","actual":1.546424,"predicted":1.4627322069135946},{"id":"gcp:n1-highmem-16 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-16 + 1× T4","actual":1.296424,"predicted":1.6833727212867164},{"id":"gcp:n1-highmem-2 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× P4","actual":0.718303,"predicted":0.5041587326432985},{"id":"gcp:n1-highmem-2 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× T4","actual":0.46830299999999997,"predicted":0.7247992470164205},{"id":"gcp:n1-highmem-2 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-2 + 1× V100","actual":2.598303,"predicted":1.627601131441701},{"id":"gcp:n1-highmem-32 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-32 + 1× T4","actual":2.242848,"predicted":2.6686618216543576},{"id":"gcp:n1-highmem-4 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× P4","actual":0.836606,"predicted":0.6349870239313857},{"id":"gcp:n1-highmem-4 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× T4","actual":0.586606,"predicted":0.8556275383045078},{"id":"gcp:n1-highmem-4 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-4 + 1× V100","actual":2.716606,"predicted":1.758429422729788},{"id":"gcp:n1-highmem-8 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× P4","actual":1.073212,"predicted":0.9024662488725698},{"id":"gcp:n1-highmem-8 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× T4","actual":0.823212,"predicted":1.123106763245692},{"id":"gcp:n1-highmem-8 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-highmem-8 + 1× V100","actual":2.953212,"predicted":2.0259086476709722},{"id":"gcp:n1-standard-1 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× P4","actual":0.6474997499999999,"predicted":0.43225276128897583},{"id":"gcp:n1-standard-1 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× T4","actual":0.39749975,"predicted":0.6528932756620979},{"id":"gcp:n1-standard-1 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-1 + 1× V100","actual":2.52749975,"predicted":1.5556951600873783},{"id":"gcp:n1-standard-16 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-16 + 1× P4","actual":1.359996,"predicted":1.1086202143966175},{"id":"gcp:n1-standard-16 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-16 + 1× T4","actual":1.109996,"predicted":1.3292607287697398},{"id":"gcp:n1-standard-2 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× P4","actual":0.6949995,"predicted":0.4663373889574909},{"id":"gcp:n1-standard-2 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× T4","actual":0.4449995,"predicted":0.6869779033306129},{"id":"gcp:n1-standard-2 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-2 + 1× V100","actual":2.5749995,"predicted":1.5897797877558932},{"id":"gcp:n1-standard-32 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-32 + 1× T4","actual":1.8699919999999999,"predicted":1.9685439874214454},{"id":"gcp:n1-standard-4 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× P4","actual":0.789999,"predicted":0.5554517382915083},{"id":"gcp:n1-standard-4 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× T4","actual":0.539999,"predicted":0.7760922526646303},{"id":"gcp:n1-standard-4 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-4 + 1× V100","actual":2.669999,"predicted":1.6788941370899109},{"id":"gcp:n1-standard-8 + 1× p4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× P4","actual":0.9799979999999999,"predicted":0.7378923248674447},{"id":"gcp:n1-standard-8 + 1× t4","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× T4","actual":0.7299979999999999,"predicted":0.9585328392405668},{"id":"gcp:n1-standard-8 + 1× v100","family":"gcp:n1","validationGroup":"gcp:n1","provider":"gcp","name":"n1-standard-8 + 1× V100","actual":2.859998,"predicted":1.8613347236658473}]}

- FP32 and memory bandwidth are advertised hardware peaks, not measured application or cloud-VM performance.
- The CPU baseline is an estimated host contribution, not a separately observed billable component.
- GPU terms and the linear GPU-count multiplier are nonnegative modeling assumptions, not causal resource prices.
- Both forms are fixed comparisons; choosing the lower error after inspecting these results has not received independent validation.
- VRAM retains source-normalized nominal memory conventions; it does not measure usable device bytes.
- One or more GPU coefficients or exponents reached zero under the nonnegative constraint. That term adds no fitted contribution conditional on the other resources in this sample; it does not mean the hardware resource has no value.
- Some observed VM prices are below the predicted CPU baseline; these rows are retained in the fitting loss.

## Sources and reproduction

Public prices and CPU measurements retain their original provenance. Exact GPU FP32 mappings are in data/gpu-fp32.json; memory-bandwidth variants and primary source links are in data/gpu-bandwidth.json. Unverified variants and missing required metrics are excluded rather than estimated. These hardware peaks are not measured application throughput. Complete cohort rows, predictions and fold fits are in data/gpu-resource-experiments.json.
