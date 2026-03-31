# Publish Agent

**Agent ID**: `publish-agent`
**Status**: ⚪ Pending  
**Scope**: Staging, production publish, GitHub commits, rollback
**Previous Agent**: Scoring Agent  
**Next Agent**: Notify Agent

## Input

From Scoring Agent:
- Scored deals (confidence_score set)
- Quarantine list
- Source trust updates

## Deliverables

### Staging
- [ ] `worker/pipeline/stage.ts`
  - Build candidate snapshot
  - Calculate snapshot hash
  - Write to DEALS_STAGING
  - Read-after-write verification

### Production Publish
- [ ] `worker/publish.ts`
  - Two-phase publish flow
  - Hash chain verification
  - Atomic promotion staging→prod
  - GitHub commit of deals.json
  - Verify commit SHA

### Rollback
- [ ] Rollback mechanism
  - Revert to previous snapshot
  - Log rollback event
  - Clear staging

## Interface Contract

```typescript
// Staging
stage(deals: Deal[], ctx: PipelineContext): Promise<Snapshot>

// Publish
publish(env: Env, snapshot: Snapshot, expectedHash: string): Promise<{
  snapshot: Snapshot;
  commitSha: string;
}>

// Rollback
rollback(env: Env, previousSnapshot: Snapshot): Promise<void>
```

## Transactional Flow

1. Build candidate snapshot
2. Hash snapshot (SHA256)
3. Validate snapshot
4. Write to DEALS_STAGING
5. Read-after-write verify
6. Verify previous hash matches
7. Publish to DEALS_PROD
8. Verify production write
9. Commit to GitHub
10. Verify commit SHA
11. Update status.json

**Failure at any step → rollback**

## GitHub Integration

- Commit message: `[AUTO] Update deals - ${run_id}`
- Include stats and hash
- Tag with `[skip ci]`
- Verify via GitHub API

## Safety Rules

- NEVER publish directly from discovery
- ALL 9 gates must pass
- Hash chain must be intact
- Lock must be held
- Verify each step

## Handoff Checklist

Before handing to Notify Agent:
- [ ] Snapshot published to production
- [ ] GitHub commit verified
- [ ] Status.json updated
- [ ] Rollback tested (or procedure documented)

## Context for Next Agent

Notify Agent receives:
- Publish success/failure status
- Quarantine list (for alerts)
- New snapshot metadata

## Dependencies

- Scored deals
- Storage layer
- GitHub integration (lib/github.ts)
- Lock mechanism
- Logger

## Blockers

None expected.
