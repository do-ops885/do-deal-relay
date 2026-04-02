# Setup Phase Complete - Handoff to Implementation Agents

**From:** api-interface-agent, synthesis-agent  
**To:** extension-agent, bot-agent, email-agent, webhook-agent  
**Phase:** setup → implementation  
**Timestamp:** 2026-04-01T19:30:00Z  
**Swarm:** input-methods-swarm  

## Summary

Setup phase complete. All implementation agents can now begin parallel work.

## API Specification

### Available Endpoints

**Create Referral:**
```
POST /api/referrals
Content-Type: application/json

{
  "code": "DOMI6869",
  "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
  "domain": "picnic.app",
  "source": "extension|bot|email|webhook",
  "submitted_by": "user-id",
  "metadata": {
    "title": "Optional Title",
    "reward_type": "cash|credit|percent|item|unknown",
    "category": ["general"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "referral": {
    "id": "ref-xxx",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app",
    "status": "quarantined"
  }
}
```

**CRITICAL: url field contains COMPLETE FULL URL**

### Other Endpoints
- `GET /api/referrals/:code` - Get referral by code
- `GET /api/referrals?domain=xxx&status=active` - List referrals
- `POST /api/referrals/:code/deactivate` - Deactivate
- `POST /api/referrals/:code/reactivate` - Reactivate
- `POST /api/research` - Web research

## Integration Requirements

1. **URL Preservation (CRITICAL)**
   - Always send complete URLs to API
   - Never modify or shorten URLs
   - Example: Use `https://picnic.app/de/freunde-rabatt/DOMI6869`
   - Not: `picnic.app/DOMI6869` or any shortened form

2. **Authentication**
   - Use API keys or JWT tokens
   - Include in Authorization header

3. **Error Handling**
   - Handle 404 (not found), 409 (duplicate), 500 (server error)
   - Retry with exponential backoff

## Reference Documents

Each agent should read their design document:

| Agent | Design Doc |
|-------|------------|
| extension-agent | `temp/analysis-extension.md` |
| bot-agent | `temp/analysis-chatbot.md` |
| email-agent | `temp/analysis-email.md` |
| webhook-agent | `temp/analysis-webhook.md` |

## Swarm Configuration

- Config: `agents-docs/coordination/input-methods-swarm-config.json`
- Protocol: `agents-docs/coordination/input-methods-handoff-protocol.md`

## Next Steps

Each implementation agent:
1. Read this handoff
2. Read your design document
3. Implement your component
4. Write handoff to `temp/handoff-{agent-id}.md`
5. Signal completion

## Coordination

All four agents work in parallel. Synthesis agent monitors progress.
Sync point before integration phase.

## Quality Gates (Must Pass)

- URL preservation check: URLs must be complete
- API integration check: Must use correct endpoints
- Basic functionality: Create, read operations work

## Questions?

Escalate to synthesis-agent via `temp/handoff-QUESTION.md`
