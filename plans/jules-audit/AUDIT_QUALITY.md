# Track B — Code Quality Audit

- Target File: `worker/lib/ranking.ts`
- Issue: Magic numbers in scoring and sorting logic:
  - Composite score weights: `0.25`, `0.2`, `0.2`, `0.2`, `0.15`
  - Recency decay constant: `30`
  - Value normalization cap: `500`
  - Value type multipliers: `1.2` (cash), `1.1` (percent), `1.0` (other)
  - Expiry days threshold: `90`
  - Default neutral expiry score: `50`
  - Default days/limits: `10` (top deals), `7` (expiring/recent days), `50` (high value threshold)
- Remediation: Extract all magic numbers into a centralized `RANKING_CONSTANTS` object in `worker/lib/ranking.ts`.
