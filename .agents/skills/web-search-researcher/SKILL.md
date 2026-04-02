---
name: web-search-researcher
description: "Research topics using web search. Use when gathering information about companies, technologies, market trends, or validating deal signals."
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
version: 1.0.0
author: d-oit
tags: [research, web-search, information-gathering, validation, due-diligence]
---

# Web Search Researcher

Conduct systematic web research to gather intelligence on companies, technologies, markets, and opportunities for deal discovery.

## When To Use

- Validating a potential deal or opportunity
- Researching company background and team
- Analyzing market trends and competition
- Gathering data for deal scoring
- Cross-referencing claims in deal proposals
- Due diligence before outreach

## Required Inputs

```text
QUERY: What to research
CONTEXT: Why this matters (deal validation, competitive analysis, etc.)
DEPTH: (quick/thorough/deep-dive)
SOURCES: Preferred sources (news, linkedin, crunchbase, etc.)
```

## Research Workflow

### 1. Query Construction

| Goal                  | Query Pattern                             |
| --------------------- | ----------------------------------------- |
| Company background    | `"{company}" founded funding team`        |
| Market analysis       | `{market} market size growth 2024`        |
| Competitive landscape | `{product} alternatives competitors`      |
| Technology validation | `{technology} reviews case studies`       |
| Team research         | `"{founder}" linkedin previous companies` |
| Recent news           | `"{company}" news 2024`                   |

See [references/search-operators.md](references/search-operators.md) for advanced operators.

### 2. Source Prioritization

**Tier 1 (High Trust):** Official websites, SEC filings, Crunchbase, LinkedIn, GitHub

**Tier 2 (Medium Trust):** Tech news, industry publications, press releases, podcasts

**Tier 3 (Verify Before Using):** Social media, forums, blogs, anonymous sources

See [references/sources/trust-ratings.md](references/sources/trust-ratings.md) for complete ratings.

### 3. Information Extraction

Use templates from [references/templates/research-templates.md](references/templates/research-templates.md):

- **Company Template**: Basics, funding, team, product, market, red flags
- **Technology Template**: Overview, technical analysis, market position, community signals
- **Market Analysis Template**: Market size, competitive landscape, trends

### 4. Validation & Cross-Reference

**Always Verify:**

1. Claims: Find proof for stated metrics
2. Numbers: Check multiple sources for valuations
3. Timeline: Verify actual launch dates
4. Attribution: Confirm credibility of sources

| Confidence | Criteria                                   |
| ---------- | ------------------------------------------ |
| **High**   | Multiple Tier 1 sources confirm            |
| **Medium** | One Tier 1 + supporting Tier 2             |
| **Low**    | Only Tier 2/3 sources, or conflicting info |
| **Verify** | Single source, or needs confirmation       |

## Research Outputs

**Save To:**

- `temp/research/YYYY-MM-DD-{company}.md` - Full research notes
- `deals/active/{company}.md` - Validated deals with scores
- `deals/rejected/{company}.md` - Rejected (with reasons)

**Naming Convention:** `{status}-{company}-{YYYYMMDD}.md`

Examples:

- `active-coderabbit-20250121.md`
- `rejected-slowai-20250121.md` (reason: no funding, low traction)
- `pending-futureco-20250121.md` (waiting: team verification)

## Integration with Other Agents

**Research-to-Deal Pipeline:**

```
Signal → Research → Validation → Deal Score
   ↓         ↓           ↓            ↓
ProductHunt  Company   Funding     8.5/10
Trending     info      verify      Priority: High
```

**Research Commands:**

```bash
npm run research:company -- "StartupName" --depth=quick
npm run research:company -- "StartupName" --depth=thorough --output=./deals/startupname.md
npm run research:market -- "AI code review tools" --competitors="CodeRabbit,Codeium,Copilot"
npm run research:batch -- --input=./signals/this-week.json --output=./deals/
```

See [references/automation-patterns.md](references/automation-patterns.md) for automation patterns and Durable Object queue implementation.

## Quality Standards

### Research Checklist

- [ ] Company basics confirmed (founded, location, size)
- [ ] Funding history documented with sources
- [ ] Team background researched (at least founders)
- [ ] Product/technology understood
- [ ] Market context established
- [ ] Competitors identified
- [ ] Red flags noted (if any)
- [ ] All claims have source URLs
- [ ] Confidence level assigned

### Anti-Patterns

**Don't:**

- Copy-paste marketing language without context
- Report unverified claims as facts
- Skip negative information
- Research without a clear goal
- Let research expire without timestamps

## References

- [references/search-operators.md](references/search-operators.md) - Complete search operator reference
- [references/sources/trust-ratings.md](references/sources/trust-ratings.md) - Source reliability ratings
- [references/templates/research-templates.md](references/templates/research-templates.md) - Research templates
- [references/automation-patterns.md](references/automation-patterns.md) - Automation patterns

## Version History

- 1.0.0 (2025-01-21) - Initial release with deal discovery research patterns
