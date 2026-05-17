# URL Handling Rules (CRITICAL)

**Status**: Active
**Version: 0.1.1
**Applies To**: All agents, CLI tools, API endpoints, and integrations
**Enforcement\*\*: FATAL - Violations block execution

This document defines the mandatory URL handling rules for the referral management system. **All agents MUST follow these rules.**

---

## 1. Always Preserve Complete Links (Input)

When adding referral codes, **ALWAYS use the COMPLETE link** as provided by the user:

```bash
# CORRECT: Full link preserved
npx ts-node scripts/refcli.ts codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869

# WRONG: Never use partial URLs
npx ts-node scripts/refcli.ts codes smart-add picnic.app/DOMI6869  # NEVER DO THIS
```

**Why This Matters**:

- Partial URLs may not include required path segments (`/de/freunde-rabatt/`)
- Missing protocol (https://) can cause security issues
- Domain-only URLs fail to redirect to the correct referral landing page
- User's referral credit depends on the complete URL being preserved

---

## 2. Full URL Always Returned (Output)

When querying the system, the **COMPLETE URL is always returned** in the `url` field:

```json
{
  "referral": {
    "id": "ref-abc123",
    "code": "DOMI6869",
    "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
    "domain": "picnic.app"
  }
}
```

**All API endpoints return full URLs:**

| Endpoint                               | URL Field Behavior                               |
| -------------------------------------- | ------------------------------------------------ |
| `GET /api/referrals`                   | List includes complete `url` field for each item |
| `GET /api/referrals/:code`             | Returns full `url` in response                   |
| `POST /api/referrals`                  | Created referral includes full `url`             |
| `POST /api/referrals/:code/deactivate` | Returns full `url` in response                   |
| `POST /api/referrals/:code/reactivate` | Returns full `url` in response                   |

**Storage Implementation**:

- The `url` field is stored as-is in KV storage
- The `domain` field is extracted for indexing but the original URL is never modified
- No URL shortening or normalization occurs

---

## 3. Agent Communication

When one agent queries the system and shares results with other agents, **the full URL must always be included**:

```
Agent A: Query system for picnic.app referrals
System: Returns { url: "https://picnic.app/de/freunde-rabatt/DOMI6869", ... }
Agent A: Shares with Agent B
Agent B: Receives FULL URL, not shortened version
```

**Communication Patterns**:

| Pattern                | URL Handling                         |
| ---------------------- | ------------------------------------ |
| Agent-to-Agent handoff | Include full URL in handoff document |
| Swarm coordination     | Pass complete URL in shared state    |
| Sub-agent delegation   | Pass full URL in task parameters     |
| Research results       | Store and share complete URLs        |

**Enforcement**:

- Handoff documents are validated to ensure URLs are complete
- Incomplete URLs trigger a FATAL guard rail violation
- Agent receiving incomplete URLs must escalate to blockers

---

## 4. Validation Rules

### Input Validation

```typescript
interface ReferralInput {
  code: string;
  url: string; // MUST be complete URL
  domain: string; // Extracted from url
  status?: string;
}

// Validation logic
function validateReferralInput(input: ReferralInput): ValidationResult {
  // Check URL is complete (has protocol)
  if (!input.url.startsWith("http://") && !input.url.startsWith("https://")) {
    return {
      valid: false,
      error: "URL must include protocol (http:// or https://)",
    };
  }

  // Check URL contains the referral code
  if (!input.url.includes(input.code)) {
    return { valid: false, error: "URL must contain the referral code" };
  }

  // Check URL is parseable
  try {
    new URL(input.url);
  } catch {
    return { valid: false, error: "URL must be valid and parseable" };
  }

  return { valid: true };
}
```

### Guard Rail Integration

URL validation is enforced by the guard rail system:

```typescript
// In worker/lib/guard-rails.ts
{
  name: 'url-completeness',
  check: (data) => {
    if (data.url && !data.url.startsWith('http')) {
      return { level: 'FATAL', message: 'Incomplete URL detected - must include protocol' };
    }
    return { level: 'PASS' };
  }
}
```

---

## 5. Common Mistakes to Avoid

| Mistake               | Example                       | Why Wrong                   |
| --------------------- | ----------------------------- | --------------------------- |
| Omitting protocol     | `picnic.app/invite/ABC`       | Security risk, may not work |
| Using domain only     | `example.com`                 | Loses referral path         |
| Truncating path       | `https://picnic.app/DOMI6869` | Missing locale/service path |
| URL shortening        | `bit.ly/xyz123`               | Hides actual destination    |
| User-provided partial | `DOMI6869`                    | Not a valid URL             |

---

## 6. Testing URL Handling

```bash
# Test input validation
npx ts-node scripts/cli/index.ts codes add \
  --code TEST123 \
  --url "https://example.com/referral/TEST123" \
  --domain example.com

# Verify output contains full URL
curl -s http://localhost:8787/api/referrals/TEST123 | jq '.referral.url'
# Expected: "https://example.com/referral/TEST123"
```

---

## Related Documentation

- [Guard Rails](./guard-rails.md) - Safety mechanisms including URL validation
- [AGENTS.md](../AGENTS.md) - Master coordination hub
- [API Documentation](../docs/API.md) - API endpoint specifications
