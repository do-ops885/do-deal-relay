# Notify Agent

**Agent ID**: `notify-agent`
**Status**: ⚪ Pending
**Scope**: Notification system, Telegram, GitHub Issues, alerts
**Previous Agent**: Publish Agent
**Next Agent**: Test Agent

## Input

From Publish Agent:

- Publish success/failure status
- Quarantine list
- New snapshot metadata
- Error logs

## Deliverables

### Notification System

- [ ] `worker/notify.ts`
  - Telegram bot integration (optional)
  - GitHub Issues fallback
  - Notification deduplication
  - Severity classification

### Trigger Conditions

- `checks_failed` - Validation gate failure
- `publish_incomplete` - Publish aborted
- `concurrency_abort` - Lock conflict
- `high_value_deal` - Deal reward > $100
- `trust_anomaly` - Trust deviation > 0.3
- `system_error` - Unhandled exception

### Dedupe Logic

Max 1 per (type + source + 6h window)

## Interface Contract

```typescript
notify(env: Env, event: NotificationEvent): Promise<boolean>

interface NotificationEvent {
  type: 'checks_failed' | 'publish_incomplete' | 'concurrency_abort'
       | 'high_value_deal' | 'trust_anomaly' | 'system_error';
  severity: 'info' | 'warning' | 'critical';
  run_id: string;
  message: string;
  context?: Record<string, unknown>;
}

createGitHubIssue(
  repo: string,
  type: string,
  run_id: string,
  details: IssueDetails
): Promise<number>
```

## Channels

### Primary: Telegram (Optional)

- Bot token from env
- Chat ID from env
- Markdown formatting

### Fallback: GitHub Issues

- Always available
- Title: `[NOTIFY] {type} - {run_id}`
- Labels: type, severity, automated
- Body: Full context + log excerpt

## Severity Levels

- **info**: Routine events, low value deals
- **warning**: Validation failures, retries
- **critical**: Publish failures, system errors, high-value quarantined

## Handoff Checklist

Before handing to Test Agent:

- [ ] Telegram integration (if env vars present)
- [ ] GitHub Issues fallback working
- [ ] Notification deduplication active
- [ ] Test notifications sent

## Context for Next Agent

Test Agent receives:

- Notification system status
- Example notifications
- All components integrated

## Dependencies

- GitHub integration (lib/github.ts)
- Logger
- Config (thresholds, cooldown)
- Env vars (optional: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)

## Blockers

- Need GitHub token for Issues fallback
- Telegram optional (won't block if missing)
