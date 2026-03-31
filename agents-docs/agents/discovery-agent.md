# Discovery Agent

**Agent ID**: `discovery-agent`
**Status**: ⚪ Pending  
**Scope**: Web discovery engine, scrapers, fetchers
**Previous Agent**: Storage Agent  
**Next Agent**: Validation Agent

## Input

From Storage Agent:
- Storage layer (save discovered deals)
- Lock mechanism
- Logger

## Deliverables

### Discovery Engine
- [ ] `worker/pipeline/discover.ts`
  - Source registry loading
  - URL fetching with timeouts
  - HTML parsing (regex-based for Workers)
  - JSON parsing
  - Deal extraction from content

### Source Management
- [ ] `worker/lib/sources.ts` (or in discover.ts)
  - Source registry interface
  - Trust score tracking
  - Discovery count tracking

### Extraction Logic
- Referral code patterns
- URL extraction
- Reward amount extraction
- Expiry date parsing
- Title/description extraction

## Interface Contract

```typescript
discover(env: Env, ctx: PipelineContext): Promise<DiscoveryResult>

interface DiscoveryResult {
  deals: Deal[];
  errors: Array<{ url: string; error: string }>;
}
```

## Configuration

### Default Sources
```typescript
{
  domain: "trading212.com",
  url_patterns: ["/invite/*"],
  selectors: {
    code: "[data-ref-code], .referral-code",
    reward: ".reward-amount"
  },
  trust_initial: 0.7,
  classification: "probationary"
}
```

## Safety Rules

- HTTPS only
- 30s timeout per fetch
- 1MB payload limit
- Respect robots.txt (check via meta)
- Parse-only mode (no JS execution)
- Input sanitization

## Handoff Checklist

Before handing to Validation Agent:
- [ ] Discovery returns Deal[]
- [ ] Errors are captured and logged
- [ ] Source trust scores updated
- [ ] No unhandled exceptions

## Context for Next Agent

Validation Agent receives:
- Raw discovered deals
- Source trust information
- Discovery error log

## Dependencies

- Storage layer (to save results)
- Logger (to log discovery phase)
- Config (timeouts, limits)
- Types (Deal, SourceConfig)

## Blockers

None expected.
