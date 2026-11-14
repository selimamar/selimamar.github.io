"""Export the dated GPU comparison as PNG, SVG and PDF with Matplotlib.

The website renders its own charts from the current report. These files are
standalone snapshots for sharing; regenerate after updating the fitted report.
"""
import json
import math
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/private/tmp/compute-price-matplotlib")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FixedLocator, FuncFormatter, NullFormatter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT / "data/gpu-resource-experiments.json").read_text())
variants = report["variants"]
rows = report["rows"]
colors = ["#b8492c", "#26759d"]
names = ["Additive", "Multiplicative"]
paper, ink, muted = "#f8f7f3", "#262b27", "#666e65"

def cpu_price(fit, row):
    return fit["A"] * math.prod((row[key] / fit["reference"][key]) ** slope
        for key, slope in zip(fit["keys"], fit["slopes"]))

def gpu_curve(fit, bandwidth):
    # Hold the other per-device inputs at their recorded reference values.
    ratios = [1., bandwidth / fit["reference"]["bandwidthPerGpuGBps"], 1.]
    if fit["kind"] == "additive":
        return sum(coef * ratio for coef, ratio in zip(fit["coefficients"], ratios))
    return fit["A"] * math.prod(ratio ** slope for ratio, slope in zip(ratios, fit["slopes"]))

host = variants[0]["fit"]["cpuFit"]
residuals = [(row, (row["hourlyUsd"] - cpu_price(host, row)) / row["gpuCount"]) for row in rows]
positive = [(row, residual) for row, residual in residuals if residual > 0]
nonpositive = len(residuals) - len(positive)
bandwidths = [row["bandwidthPerGpuGBps"] for row in rows]
grid = np.geomspace(min(bandwidths), max(bandwidths), 250)
boundaries_zero = variants[0]["fit"]["coefficients"][0] == variants[0]["fit"]["coefficients"][2] == 0 \
    and variants[1]["fit"]["slopes"][0] == variants[1]["fit"]["slopes"][2] == 0

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
    "text.color": ink, "axes.labelcolor": ink, "xtick.color": muted,
    "ytick.color": muted, "axes.edgecolor": "#b9beb5", "axes.facecolor": paper,
    "figure.facecolor": paper, "svg.fonttype": "none"})
fig = plt.figure(figsize=(12, 10.6))
gs = fig.add_gridspec(2, 2, left=.085, right=.97, bottom=.19, top=.865, hspace=.48, wspace=.27)
top = fig.add_subplot(gs[0, :])
bottom = [fig.add_subplot(gs[1, i]) for i in range(2)]
fig.suptitle("Different formulas, similar fitted curves", x=.085, y=.975, ha="left", fontsize=22, weight="semibold")
fig.text(.085, .935, f"{len(rows)} cloud configurations  ·  {report['coverage']['familyCount']} machine families  ·  "
    f"{report['coverage']['gpuModelCount']} GPU models  ·  Prices {report['priceUpdatedAt'][:10]} UTC", fontsize=10, color=muted)

def style(ax):
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.grid(which="major", color="#d6dad1", linewidth=.7, zorder=0)
    ax.spines[["top", "right"]].set_visible(False)
    ax.xaxis.set_minor_formatter(NullFormatter())
    ax.yaxis.set_minor_formatter(NullFormatter())
    ax.tick_params(which="minor", length=2, color="#b9beb5")

for ax in [top, *bottom]:
    style(ax)

top.set_title("A  ·  GPU contribution versus bandwidth — full-sample fits", loc="left", fontsize=12, pad=12)
top.scatter([row["bandwidthPerGpuGBps"] for row, _ in positive], [value for _, value in positive],
    s=29, color="#4b554e", alpha=.47, edgecolors=paper, linewidths=.45,
    label=f"Inferred GPU contribution ({len(positive)} positive values)", zorder=3)
for variant, color, name, linestyle in zip(variants, colors, names, ["-", "--"]):
    top.plot(grid, [gpu_curve(variant["fit"], b) for b in grid], color=color, lw=2.5,
        linestyle=linestyle, label=name, zorder=4)
top.set_xlabel("Memory bandwidth per GPU (GB/s) · logarithmic scale", labelpad=9)
top.set_ylabel("(VM price − estimated host price) / GPU\nUSD per hour · logarithmic scale", labelpad=12)
top.set_xlim(min(bandwidths)*.88, max(bandwidths)*1.14)
top.xaxis.set_major_locator(FixedLocator([v for v in [100,200,300,500,1000,2000,3000,5000,10000]
    if min(bandwidths)*.88 <= v <= max(bandwidths)*1.14]))
top.xaxis.set_major_formatter(FuncFormatter(lambda x, _: f"{x:,.0f}"))
top.yaxis.set_major_locator(FixedLocator([value for value in [.05,.1,.2,.5,1,2,5,10] if top.get_ylim()[0] <= value <= top.get_ylim()[1]]))
top.yaxis.set_major_formatter(FuncFormatter(lambda y, _: f"${y:g}"))
top.legend(loc="upper left", frameon=True, facecolor=paper, edgecolor="none", fontsize=9)
top.text(.99, .05, "Bandwidth exponents: 1.000 and 0.878" if boundaries_zero else "Other inputs fixed at their reference values",
    transform=top.transAxes, ha="right", fontsize=10, color=ink,
    bbox={"facecolor": paper, "edgecolor": "none", "alpha": .9, "pad": 5})

predictions = [variant["validation"]["predictions"] for variant in variants]
all_values = [p[key] for ps in predictions for p in ps for key in ["actual", "predicted"] if p[key] > 0]
lower, upper = 10 ** math.floor(math.log10(min(all_values))), 10 ** math.ceil(math.log10(max(all_values)))
ticks = [10**power for power in range(math.floor(math.log10(lower)), math.ceil(math.log10(upper))+1)]
for i, (ax, variant, points, color, name) in enumerate(zip(bottom, variants, predictions, colors, names)):
    ax.set_title(f"{'B' if i == 0 else 'C'}  ·  {name} — unseen machine families", loc="left", fontsize=11.5, pad=12)
    ax.plot([lower, upper], [lower, upper], color="#7c857b", lw=1.2, linestyle="--", label="Perfect prediction")
    ax.scatter([p["actual"] for p in points], [p["predicted"] for p in points], color=color,
        s=28, alpha=.7, edgecolors=paper, linewidths=.45, zorder=3)
    ax.set_xlim(lower,upper); ax.set_ylim(lower,upper)
    for axis in [ax.xaxis, ax.yaxis]:
        axis.set_major_locator(FixedLocator(ticks))
        axis.set_major_formatter(FuncFormatter(lambda x, _: f"${x:g}"))
    ax.set_xlabel("Actual whole-VM price (USD/hour) · log scale", labelpad=8)
    ax.set_ylabel("Held-out prediction (USD/hour) · log scale", labelpad=9)
    metrics = variant["validation"]
    ax.text(.04,.96, f"Mean error {metrics['mape']:.1%}\nLog R² {metrics['logR2']:.3f}\n{len(points)}/{len(rows)} configurations",
        transform=ax.transAxes, va="top", fontsize=10, linespacing=1.5,
        bbox={"facecolor":paper,"edgecolor":"none","alpha":.9,"pad":4})
    ax.legend(loc="lower right", frameon=False, fontsize=8.5)

fig.text(.085, .045,
    f"Top: subtracts an estimated host baseline; points are not separately billed GPU prices. {nonpositive} nonpositive residuals cannot appear on a log axis.\n"
    f"Bottom: all {len(rows)} VM prices remain included. Each prediction refits both stages without the test machine family. Both panels share identical axes.\n"
    + ("FP32 and VRAM terms fitted to zero in both full-sample models; the top curves therefore depend only on bandwidth."
       if boundaries_zero else "Top curves fix FP32 and VRAM at their reference values; observed configurations can differ in these inputs."),
    fontsize=9.1, color=muted, linespacing=1.6)

output = ROOT / "analysis" / "gpu-model-log-plots"
for extension in ["png", "svg", "pdf"]:
    fig.savefig(output.with_suffix(f".{extension}"), dpi=190, facecolor=paper)
print(f"Exported {output.name}.png / .svg / .pdf; residual panel {len(positive)}/{len(rows)}; validation panels {[len(p) for p in predictions]}.")
