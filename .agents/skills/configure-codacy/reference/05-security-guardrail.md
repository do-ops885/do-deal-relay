# Security guardrail

> **Every security concern must be covered by at least one active pattern.** This is a hard rule with no exceptions.

The guardrail operates at the **concern level**, not the individual pattern level. If two tools both detect "hardcoded secrets," disabling the less precise one is acceptable because the concern remains covered. However, if a security concern (e.g., SQL injection, XSS, path traversal, hardcoded secrets) would lose ALL active pattern coverage, the disable must be reverted.

When a security pattern is noisy and cannot be deduplicated:

- **Exclude specific files** where it triggers false positives (e.g., test fixtures, mock data)
- **Leave the false positives** for the user to triage in Codacy Cloud (they can ignore individual instances with a reason)
- **Never remove the last pattern covering a security concern** — it must stay active to catch real vulnerabilities in future code

For Critical/High severity patterns in non-Security categories, apply the same caution: prefer file exclusion over pattern disabling. Only disable these if they are clearly for the wrong stack (e.g., a Java Critical pattern in a pure Python project).


> Extracted from: ../SKILL.md
