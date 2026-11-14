#!/usr/bin/env python3
"""Build the one-page methodology from saved results; never refit the models.

Requires ReportLab (available in the Codex bundled Python runtime).
Run from any directory. Output: output/pdf/compute-price-methodology.pdf.
"""

from datetime import datetime
from pathlib import Path
import json

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/compute-price-methodology.pdf"
EXPERIMENTS = json.loads((ROOT / "data/experiments.json").read_text())
GPU = json.loads((ROOT / "data/gpu-resource-experiments.json").read_text())
CPU = EXPERIMENTS["cpu"]["displayed"]
BW = next(v for v in GPU["singleResourceComparison"]["variants"] if v["id"] == "gpu-bandwidth-linear")
REFERENCE = json.loads((ROOT / "data/reference-machine.json").read_text())
PROVIDER_SOURCES = {
    "aws": ("AWS", "https://aws.amazon.com/ec2/pricing/on-demand/"),
    "azure": ("Microsoft Azure", "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices"),
    "gcp": ("Google Cloud", "https://cloud.google.com/products/compute/pricing"),
    "alibaba": ("Alibaba Cloud", "https://www.alibabacloud.com/en/product/ecs/pricing"),
    "oracle": ("Oracle Cloud", "https://www.oracle.com/cloud/compute/pricing/"),
    "ibm": ("IBM Cloud", "https://cloud.ibm.com/docs/account?topic=account-getting-pricing-api"),
}
FITTED_PROVIDERS = {row["provider"] for row in CPU["rows"] + GPU["rows"]}

INK = colors.HexColor("#252A31")
MUTED = colors.HexColor("#59616B")
ACCENT = colors.HexColor("#981B2B")
RULE = colors.HexColor("#CFD4DA")
PAPER = colors.HexColor("#F6F7F8")
PAGE_W, PAGE_H = A4
MARGIN = 40
WIDTH = PAGE_W - 2 * MARGIN


# Standard PDF fonts keep the one-page layout identical on macOS and the
# Linux GitHub runner, without depending on platform-specific font installs.
FONT, BOLD = "Helvetica", "Helvetica-Bold"
STYLES = {
    "body": ParagraphStyle("body", fontName=FONT, fontSize=10.2, leading=14.2, textColor=INK),
    "small": ParagraphStyle("small", fontName=FONT, fontSize=9.0, leading=12.2, textColor=MUTED),
    "label": ParagraphStyle("label", fontName=BOLD, fontSize=8.8, leading=11.5, textColor=ACCENT),
    "heading": ParagraphStyle("heading", fontName=BOLD, fontSize=11.4, leading=14.3, textColor=INK),
    "equation": ParagraphStyle("equation", fontName=FONT, fontSize=13, leading=18, textColor=INK),
}


def para(c, text, x, y, width, style="body"):
    p = Paragraph(text, STYLES[style])
    _, h = p.wrap(width, PAGE_H)
    p.drawOn(c, x, y - h)
    return y - h


def percent(value):
    return f"{value * 100:.1f}%"



def draw():
    assert CPU["sampleCount"] == len(CPU["rows"]) == CPU["validation"]["testedCount"]
    assert BW["sampleCount"] == len(GPU["rows"]) == BW["validation"]["testedCount"]
    assert CPU["fit"]["A"] == BW["fit"]["cpuFit"]["A"]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
    c.setTitle("Compute Price - Methodology")
    c.setAuthor("Compute Price")
    c.setSubject("A simple guide to the published CPU and GPU price estimates")
    c.setFillColor(ACCENT)
    c.rect(MARGIN, PAGE_H - 42, 23, 3, fill=1, stroke=0)
    y = para(c, "COMPUTE PRICE", MARGIN, PAGE_H - 55, WIDTH, "label") - 8
    c.setFillColor(INK)
    c.setFont(BOLD, 26)
    c.drawString(MARGIN, y - 22, "Methodology")
    snapshot = datetime.fromisoformat(EXPERIMENTS["priceUpdatedAt"].replace("Z", "+00:00"))
    c.setFont(FONT, 9)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, y - 8, "PRICE SNAPSHOT")
    c.drawRightString(PAGE_W - MARGIN, y - 22, snapshot.strftime("%d %b %Y · %H:%M UTC"))
    y -= 40

    provider_names = [name for provider, (name, _) in PROVIDER_SOURCES.items() if provider in FITTED_PROVIDERS]
    provider_text = ", ".join(provider_names[:-1]) + " and " + provider_names[-1] if len(provider_names) > 1 else provider_names[0]
    y = para(c,
        f"We estimate hourly cloud rental costs from <b>{CPU['sampleCount']:,} CPU configurations</b> "
        f"and <b>{BW['sampleCount']:,} GPU configurations</b> from {provider_text}. "
        "These are the samples shown in the Data tab. Prices are public Linux on-demand rates "
        "for one US region per provider, excluding discounts, taxes and separately billed storage or traffic.",
        MARGIN, y, WIDTH) - 16

    A, alpha, beta = CPU["fit"]["A"], *CPU["fit"]["slopes"]
    k = BW["fit"]["rawCoefficients"][0]
    panel = [
        ("THE TWO PRICE EQUATIONS", "label", 5),
        (f"CPU: &nbsp; H = {A:.5f} (R/16)<super>{alpha:.5f}</super> (C/5000)<super>{beta:.5f}</super>", "equation", 4),
        (f"GPU: &nbsp; P = H + {k:.8f} nB", "equation", 9),
        ("<b>H</b>: CPU/RAM cost. <b>P</b>: full GPU-machine cost. Both are in USD/hour.<br/>"
         "<b>R</b>: RAM (GiB). <b>C</b>: whole-machine Geekbench 6 multi-core score.<br/>"
         "<b>n</b>: number of GPUs. <b>B</b>: memory bandwidth per GPU (GB/s).", "small", 0),
    ]
    panel_height = 24 + sum(Paragraph(text, STYLES[style]).wrap(WIDTH-26, PAGE_H)[1] + gap
                            for text, style, gap in panel)
    c.setFillColor(PAPER)
    c.roundRect(MARGIN, y-panel_height, WIDTH, panel_height, 5, stroke=0, fill=1)
    yy = y - 12
    for text, style, gap in panel:
        yy = para(c, text, MARGIN+13, yy, WIDTH-26, style) - gap
    y -= panel_height + 17

    y = para(c, "How we fit and check the models", MARGIN, y, WIDTH, "heading") - 6
    y = para(c,
        "First, we fit CPU prices using RAM and measured CPU performance. Then we add a GPU cost "
        "proportional to memory bandwidth. We fit log prices to focus on relative errors; GPU machine "
        "families receive equal weight. VRAM is omitted because it closely tracks bandwidth in this sample.",
        MARGIN, y, WIDTH) - 8
    y = para(c,
        "To check predictions, we leave related machine sizes out together, fit without that family, "
        "and predict its prices. The fit plots show these predictions against listed prices. "
        f"Average absolute percentage errors are <b>{percent(CPU['validation']['mape'])} for CPU</b> "
        f"and <b>{percent(BW['validation']['mape'])} for GPU</b>.",
        MARGIN, y, WIDTH) - 16

    y = para(c, "Reference prices and history", MARGIN, y, WIDTH, "heading") - 6
    y = para(c,
        f"The CPU reference uses the base Mac mini M6: {REFERENCE['ramGiB']} GB RAM and a "
        f"{REFERENCE['cpuScore']:,} Geekbench 6 score. The GPU reference adds one H100 SXM at "
        f"{REFERENCE['bandwidthPerGpuGBps']:,} GB/s. This is a hypothetical resource basket. "
        "The Mac score is a performance proxy; H100 bandwidth exceeds the fitted sample, so its "
        "price estimate extends beyond the observed range.",
        MARGIN, y, WIDTH) - 8
    y = para(c,
        "The history chart refits the same equations to archived AWS prices, using later benchmarks "
        "of matching VM shapes. It estimates the cost of the fixed reference over time; it does not "
        "represent historical Mac mini or H100 rental offers.",
        MARGIN, y, WIDTH) - 16

    y = para(c, "Daily updates and limits", MARGIN, y, WIDTH, "heading") - 6
    y = para(c,
        "Each day, we refresh prices, refit the models and regenerate this document; benchmarks stay "
        "fixed. Incomplete updates retain the dated snapshot. Missing inputs, unverified units and "
        "prices older than 36 hours are excluded from new fits. These are approximate estimates, "
        "not provider quotes or guarantees of application performance.",
        MARGIN, y, WIDTH) - 15

    c.setStrokeColor(RULE)
    c.setLineWidth(.5)
    c.line(MARGIN, y, PAGE_W-MARGIN, y)
    y -= 9
    links = [source for provider, source in PROVIDER_SOURCES.items() if provider in FITTED_PROVIDERS] + [
        ("GPU specs", "https://docs.cloud.google.com/compute/docs/gpus"),
        ("AWS archives", "https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html"),
        ("Mac mini", REFERENCE["specificationSourceUrl"]),
        ("M6 score", REFERENCE["cpuBenchmark"]["sourceUrl"]),
        ("H100", REFERENCE["gpuSpecificationSourceUrl"]),
    ]
    source_links = " · ".join(f'<link href="{url}" color="#981B2B">{name}</link>' for name,url in links)
    y = para(c, f"<b>Sources:</b> {source_links}", MARGIN, y, WIDTH, "small") - 5
    y = para(c,
        'CPU data adapted from <link href="https://github.com/SpareCores/sc-inspector-data" '
        'color="#981B2B">Spare Cores Inspector</link> under '
        '<link href="https://creativecommons.org/licenses/by-sa/4.0/" color="#981B2B">CC BY-SA 4.0</link>. '
        'Individual sources accompany the fitting data.',
        MARGIN, y, WIDTH, "small")
    if y < 30:
        raise RuntimeError(f"Content exceeds one-page margin: bottom={y:.1f}pt")
    c.showPage()
    c.save()
    print(f"Created {OUT}; content bottom margin {y:.1f}pt")


if __name__ == "__main__":
    draw()
