# Sentinel's Journal - Security Findings

This journal records critical security findings, vulnerabilities, and learnings discovered during the project.

## 2026-04-12 - [Improved Webhook API Authentication]
**Vulnerability:** Several webhook management endpoints (listing subscriptions, getting partner details, DLQ management, sync state) lacked authentication, allowing unauthorized access to webhook configuration and history. Additionally, API key validation was susceptible to timing attacks.
**Learning:** Security middleware should be consistently applied to all sensitive management endpoints, not just creation/deletion.
**Prevention:** Always verify that every route in a management API includes an authentication check. Use timing-safe comparison for all secret/key validations.
