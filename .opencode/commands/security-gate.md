---
description: Run security-specific verification checks
subtask: true
---

# Security Gate Command

Run security-specific checks on current changes. Critical and high findings block the pipeline.

## Usage

```
/security-gate [deals|code|all]
```

- `deals`: Check deal data for security issues (default)
- `code`: Check codebase for security patterns
- `all`: Run both checks

## Security Checks

### 1. SSRF Protection
Blocks requests to internal/private networks.

**Blocked**:
- `localhost`, `127.0.0.1`, `metadata.google.internal`
- Private IP ranges: `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`
- Non-HTTP protocols

### 2. Credential Leakage
Detects exposed secrets in deal data.

**Patterns detected**:
- `password=`, `secret=`, `api_key=`, `token=`
- `private_key=`, `bearer` tokens
- OpenAI keys (`sk-...`)

### 3. Injection Detection
Checks for SQL/NoSQL injection patterns.

**Patterns detected**:
- SQL: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `UNION`
- NoSQL: `${...}`, `$where`, `$regex`
- XSS: `<script>`, `javascript:` URIs
- Path traversal: `../`, `..\`

### 4. URL Validation
Validates URLs use safe protocols.

**Checks**:
- HTTPS preferred (HTTP flagged)
- URL length < 2048 characters
- Valid port numbers

### 5. Content Safety
Flags suspicious content patterns.

**Patterns flagged**:
- Malicious: `scam`, `phishing`, `malware`, `virus`, `hack`
- Fraud: `get rich quick`, `guaranteed returns`, `risk-free`
- Pyramid: `earn $X per day/week/month`

## Severity Levels

| Level | Blocks Pipeline | Action Required |
|-------|-----------------|-----------------|
| Critical | Yes | Must fix before merge |
| High | Yes | Must fix before merge |
| Medium | No | Should fix, log warning |
| Low | No | Informational |
| Info | No | No action needed |

## Output

```
Security Gate Report
═══════════════════
Overall: FAIL
Critical: 0 | High: 1 | Medium: 2 | Low: 1

Failed Checks:
- [HIGH] credential_leakage: Potential api_key detected: sk-abc...
- [MEDIUM] url_validation: HTTP (not HTTPS): http://example.com
- [MEDIUM] content_safety: Suspicious fraud language: "guaranteed returns"
- [LOW] injection_detection: Potential SQL pattern: SELECT
```

## Failure Handling

If critical or high findings:
1. Report structured findings
2. Feed back to PEV PLAN phase
3. Must resolve before merge
4. No bypass without human approval

## Integration

- `worker/pipeline/security-gate.ts` — Security check implementations
- `worker/config.ts` — `BLOCKED_HOSTS`, `BLOCKED_IP_RANGES`
- Part of PEV loop verification
- Standalone command for focused security review
