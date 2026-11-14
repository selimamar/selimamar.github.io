These fixtures are minimal excerpts of actual provider responses fetched on 2026-09-29 UTC.

- `aws.json`: the selected 10 rows, unchanged, from the AWS public pricing table's JSON endpoint (the URL is `AWS_URL` in `scripts/pricing.mjs`). Retains the source manifest and exact field names.
- `azure.json`: the complete Azure Retail Prices response to `azurePriceUrl()` in that module. Includes Windows, Spot and Low Priority rates so exclusion tests exercise real mixed data.
- `digitalocean.html`: the selected 8 unmodified plan objects from DigitalOcean's public pricing page, rewrapped in the escaped Next.js flight-string format used by that page. It is a focused derived fixture, not the full copyrighted webpage.

Test prices are historical fixture assertions. Production always fetches the official endpoints and retains a timestamped last successful observation if a source fails.
