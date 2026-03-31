# Handoff Protocol Examples

## Example 1: Bootstrap → Storage

```json
{
  "handoff_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-03-31T16:00:00Z",
  "from_agent": "bootstrap-agent",
  "to_agent": "storage-agent",
  "state": "complete",
  "deliverables": [
    {
      "path": "worker/types.ts",
      "type": "file",
      "checksum": "abc123...",
      "description": "TypeScript types and schemas"
    },
    {
      "path": "worker/config.ts",
      "type": "file",
      "checksum": "def456...",
      "description": "Configuration constants"
    },
    {
      "path": "wrangler.toml",
      "type": "file",
      "checksum": "ghi789...",
      "description": "Cloudflare Worker config with KV placeholders"
    }
  ],
  "context": {
    "variables": {
      "KV_NAMESPACES": 5,
      "SCHEMA_VERSION": "1.0.0"
    },
    "notes": "KV IDs are placeholders. Storage agent needs to implement all storage operations."
  },
  "blockers": [],
  "next_steps": [
    "Implement storage.ts",
    "Implement lock.ts",
    "Implement logger.ts",
    "Implement crypto.ts"
  ]
}
```

## Example 2: Storage → Discovery

```json
{
  "handoff_id": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2024-03-31T17:00:00Z",
  "from_agent": "storage-agent",
  "to_agent": "discovery-agent",
  "state": "complete",
  "deliverables": [
    {
      "path": "worker/lib/storage.ts",
      "type": "file",
      "checksum": "jkl012...",
      "description": "KV storage abstraction"
    },
    {
      "path": "worker/lib/lock.ts",
      "type": "file",
      "checksum": "mno345...",
      "description": "Distributed locking"
    },
    {
      "path": "worker/lib/logger.ts",
      "type": "file",
      "checksum": "pqr678...",
      "description": "JSONL logging"
    },
    {
      "path": "worker/lib/crypto.ts",
      "type": "file",
      "checksum": "stu901...",
      "description": "Hashing and crypto utilities"
    }
  ],
  "context": {
    "variables": {
      "STORAGE_TESTED": true,
      "LOCK_TTL": 300
    },
    "notes": "All storage operations working. Logger writes to KV. Lock tested with 5min TTL."
  },
  "blockers": [],
  "next_steps": [
    "Implement discovery engine",
    "Add source registry support",
    "Test with trading212.com"
  ]
}
```

## Example 3: Validation → Scoring (with quarantine)

```json
{
  "handoff_id": "550e8400-e29b-41d4-a716-446655440003",
  "timestamp": "2024-03-31T18:30:00Z",
  "from_agent": "validation-agent",
  "to_agent": "scoring-agent",
  "state": "partial",
  "deliverables": [
    {
      "path": "worker/pipeline/normalize.ts",
      "type": "file",
      "checksum": "vwx234...",
      "description": "Deal normalization"
    },
    {
      "path": "worker/pipeline/dedupe.ts",
      "type": "file",
      "checksum": "yza567...",
      "description": "Deduplication logic"
    },
    {
      "path": "worker/pipeline/validate.ts",
      "type": "file",
      "checksum": "bcd890...",
      "description": "9 validation gates"
    }
  ],
  "context": {
    "variables": {
      "VALID_DEALS": 12,
      "QUARANTINED_DEALS": 2,
      "REJECTED_DEALS": 3,
      "DUPLICATES": 5
    },
    "notes": "2 deals quarantined due to high reward ($150) + low trust (0.4). Scoring agent should flag for notification."
  },
  "blockers": [
    {
      "type": "review",
      "description": "Quarantined deals need review before publish",
      "blocking_agents": ["scoring-agent"]
    }
  ],
  "next_steps": [
    "Calculate confidence scores",
    "Update source trust",
    "Flag high-value anomalies for notification"
  ]
}
```

## Example 4: Publish → Notify (failure)

```json
{
  "handoff_id": "550e8400-e29b-41d4-a716-446655440004",
  "timestamp": "2024-03-31T19:00:00Z",
  "from_agent": "publish-agent",
  "to_agent": "notify-agent",
  "state": "blocked",
  "deliverables": [
    {
      "path": "worker/pipeline/stage.ts",
      "type": "file",
      "checksum": "efg123...",
      "description": "Staging logic"
    },
    {
      "path": "worker/publish.ts",
      "type": "file",
      "checksum": "hij456...",
      "description": "Publish flow"
    }
  ],
  "context": {
    "variables": {
      "PUBLISH_STATUS": "failed",
      "ERROR": "Hash mismatch in step 6",
      "ROLLBACK": "successful"
    },
    "notes": "Hash chain broke during publish. Rolled back to previous snapshot. Need immediate notification."
  },
  "blockers": [
    {
      "type": "error",
      "description": "Publish failed due to concurrent modification",
      "blocking_agents": ["notify-agent"]
    }
  ],
  "next_steps": [
    "Send critical notification",
    "Create GitHub issue",
    "Escalate to human review"
  ]
}
```

## Creating a Handoff

To create a handoff:

1. Update your agent status to `complete` or `blocked`
2. List all deliverables with checksums
3. Document any blockers
4. Append to `/agents-docs/coordination/handoff-log.jsonl`
5. Update `/agents-docs/coordination/state.json`
6. Notify next agent (via file change)

## Handoff Log Format

Each line in `handoff-log.jsonl` is a JSON handoff object.

## Receiving a Handoff

1. Read latest entry from `handoff-log.jsonl`
2. Check if `to_agent` matches your ID
3. Verify deliverables exist
4. Review blockers and context
5. Begin your scope
