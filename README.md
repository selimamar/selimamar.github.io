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
- Personal details and optional profile links: `hugo.toml`

Mathematics can be written with `\(...\)` for inline expressions and `\[...\]` for display equations.

## Replace the portrait

Replace `static/images/portrait.jpg` with a real landscape portrait. A 5:4 image at 1600 × 1280 pixels or larger is ideal; no template change is required.

## Replace the CV

Replace `static/files/Selim_Amar_CV.pdf`, keeping the same filename so existing links continue to work.

## GitHub Pages deployment

`.github/workflows/deploy.yml` builds the site with Hugo 0.165.0 and deploys the generated `public/` directory whenever `main` is pushed. In the GitHub repository, choose **Settings → Pages → Source → GitHub Actions** once before the first deployment.

The workflow supplies the correct repository-specific base URL at build time, so it works for both user and project Pages sites.

## Custom domain

After adding a domain in GitHub's Pages settings, change `baseURL` in `hugo.toml` to the final `https://` URL. GitHub will provide the DNS records to add at your registrar. Do not add a `CNAME` file until the domain is known.
