# Selim Amar — Mathematics

A small, custom Hugo site for an academic mathematics profile. Content is stored in Markdown and publication metadata is stored in one YAML file.

## Run locally

Install Hugo 0.165.0 or newer, then run:

```bash
hugo server
```

Open <http://localhost:1313/>. The standard Hugo edition is sufficient; no theme or JavaScript toolchain is required.

## Production build

```bash
hugo --gc --minify
```

The generated static site is written to `public/`.

## Add a publication

Edit `data/publications.yaml`. The homepage lists all papers from this file, newest first. The standalone Publications page remains available at `/publications/`, but is not linked in the navigation.

```yaml
- title: "Paper title"
  authors:
    - "Selim Amar"
  year: 2026
  type: "preprint" # or "published"
  journal: ""
  arxiv: ""
  pdf: ""
  doi: ""
  journal_url: ""
  selected: false
```

Empty optional fields are hidden automatically.

## Edit content

- Homepage biography: `content/_index.md`
- Research text: `content/research.md`
- Random Projects text: `content/random-projects.md`
- Compute page: `content/compute-price.md`, `layouts/compute-price.html`, and `assets/css/compute-price.css`
- Personal details and optional profile links: `hugo.toml`

Mathematics can be written with `\(...\)` for inline expressions and `\[...\]` for display equations.

## Add a project

Create a Markdown page in `content/` with the following front matter. It will appear automatically in both the **Random Projects** dropdown and the project overview, ordered by `weight`:

```yaml
---
title: "My new project"
description: "A short description of the project."
menus:
  main:
    parent: "projects"
    weight: 20
---

Project content goes here.
```

Price of Compute uses weight 10. Use `layout` when a project needs a custom interactive page. The navigation and project overview share Hugo's menu entries, so no separate list of projects needs updating.

## Replace the portrait

Replace `static/images/selim-amar.jpg` with a landscape portrait. The homepage shows the photo in a 4:3 frame at the top right on wider screens, preserving the left edge where the subject appears in the current photo. Update the image dimensions and alt text in `layouts/index.html` when replacing it.

## Replace the CV

Replace `static/files/Selim_Amar_CV.pdf`, keeping the same filename so existing links continue to work.

## GitHub Pages deployment

`.github/workflows/deploy.yml` refreshes compute prices, builds the site with Hugo 0.165.0, and deploys the generated `public/` directory whenever `main` is pushed, when run manually, and daily at **07:23 UTC**. In the GitHub repository, choose **Settings → Pages → Source → GitHub Actions** once before the first deployment.

The workflow supplies the correct repository-specific base URL at build time, so it works for both user and project Pages sites.

## Price of Compute

The project is a native Hugo page at **`/compute-price/`**, linked from Random Projects. It shares the site's header, footer, locally hosted fonts, colors, and responsive navigation. Hugo mounts only the public application modules, JSON data, and methodology PDF from `compute-price/`; source archives, tests, local metadata, and Worker deployment files are not published. No iframe, separate cloud service, API key, or browser-side pricing API is required. A normal `hugo server` or `hugo --gc --minify` serves the saved publication without installing Node or Python.

The GitHub workflow installs Node 24 and Python 3.12, checks public Linux on-demand prices from AWS, Azure, Google Cloud, Alibaba, Oracle, and IBM, refits the models and comparisons, updates the historical observations and residuals, and regenerates the methodology PDF. Benchmarks remain fixed until explicitly revised. Each refresh runs in a temporary staging directory; dates, benchmark signatures, validation coverage, and references must agree before the complete publication replaces the previous one. A failed provider retains its own original dates; stale rows do not enter new fits. If the complete refresh fails, the last valid publication is deployed with a dated notice, and the workflow reports a failure after deployment.

GitHub Actions caches the last complete generated publication between runs, including accumulated dated observations, without changing the repository's source or benchmark inputs. Cache eviction falls back to the committed snapshot; this cache is operational persistence, not a permanent research archive. Preserve dated exports in Git when long-term audit history is required. Scheduled workflows run from the default branch, can be delayed, and GitHub can disable schedules in public repositories after 60 days without repository activity. The page always shows its actual data date, rather than claiming a successful refresh. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

To refresh locally, install Node 24 and Python 3.12+, then run from the repository root:

```bash
python3 -m pip install -r compute-price/requirements-methodology.txt
node compute-price/scripts/refresh-for-hugo.mjs
node compute-price/scripts/refresh-for-hugo.mjs --validate
hugo --gc --minify
```

Set `PYTHON` to a Python executable if it is not named `python3`. The methodology uses standard PDF fonts for consistent one-page output on macOS and Linux. To run model and publication-safety tests: `node --test compute-price/test/*.test.mjs`.

Upload the Hugo source repository, including `compute-price/`, the new content/template/stylesheet, and the updated workflow. Do not upload only the old standalone ZIP or `compute-price/dist/`: GitHub Pages needs the source workflow to perform daily updates. Pushing these changes to `main` activates the page and schedule; this local preparation does not itself push or publish.

The compute source is part of this repository. Its former empty nested Git metadata (no commits, refs, or remote) was preserved locally at `tmp/compute-price-empty-git-backup-2026-11-13/`, outside the published and committed files.

## Custom domain

After adding a domain in GitHub's Pages settings, change `baseURL` in `hugo.toml` to the final `https://` URL. GitHub will provide the DNS records to add at your registrar. Do not add a `CNAME` file until the domain is known.
