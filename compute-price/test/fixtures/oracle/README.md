# Oracle public pricing fixtures

Captured from Oracle's public sources on 2026-09-29 UTC:

- `products.json`: selected unmodified product entries from https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?currencyCode=USD ; response `lastUpdated` was 2026-09-23T13:10:59.012Z. The selected entries include all SKUs consumed by this adapter, including both free and paid A1 tiers.
- `shapes.html`: https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm
- `price-list.html`: https://www.oracle.com/cloud/price-list/

The JSON endpoint is documented at https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/signingup_topic-Estimating_Costs.htm . Oracle's global pricing statement is https://www.oracle.com/cloud/pricing/ . Content remains Oracle's; these are provenance-bearing parser test fixtures.

Tests deliberately mutate copied inputs to exercise price changes, incompatible billing units, missing/repurposed SKUs, hardware changes, ambiguous tiers and fetch failures. Fixed expected values verify complete rental composition, not just headline CPU or GPU component prices.

Catalog scope is Linux/public on-demand USD list price, with Ashburn as the reference region. Uniform price does not establish region-specific hardware capacity or availability. Flex configurations are explicitly selected legal examples, not official defaults and not all possible configurations. Published memory numbers are retained with their original GB label because these pages do not establish a decimal/binary byte convention. No nominal memory number is reduced by a speculative GB-to-GiB conversion. No CPU or GPU benchmark is fabricated or scaled.
