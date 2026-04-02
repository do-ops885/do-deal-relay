# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-04-02

### Added

- Issue tracking guidelines in AGENTS.md for future work management
- Guidelines for creating GitHub issues for long-term enhancements
- Label taxonomy for issue categorization (enhancement, low-priority, future, refactor, tech-debt)
- Example gh CLI command for creating labeled issues
- Comprehensive skill evaluation check across all 34 skills

### Changed

- AGENTS.md updated with "Issue Tracking for Future Work" section

## [Unreleased] - Planned for 0.2.0

### Added

- Referral management system with full URL preservation
- CLI tool (refcli) for referral code management with smart-add capability
- Browser Extension for auto-detecting referral codes (Chrome/Firefox/Safari)
- Chat Bot integration (Telegram/Discord) for conversational referral management
- Email integration with parsing for forwarded referral emails
- Webhook system with HMAC signature verification for partner integrations
- Web research agent for discovering referral codes across ProductHunt, GitHub, HN, Reddit
- Swarm coordination configuration for multi-agent input method implementation
- Handoff protocol documentation for agent coordination
- URL preservation validation script for testing complete link handling
- Circuit breaker, cache, and metrics utility modules
- Production readiness checklist to AGENTS.md
- Code quality standards (max 500 lines per file, skill evaluation requirements)

### Changed

- AGENTS.md updated with URL handling rules (complete link preservation)
- Guard rails documentation updated with code quality standards
- Version preparation for 0.2.0 reflecting referral system completion
- All input method statuses updated to "Implemented" in documentation

### Fixed

- Missing module references (circuit-breaker, cache, metrics) causing TypeScript errors
- API responses now include full URL field in all referral endpoints
- Skill validation errors for refcli skill

## [0.1.1] - 2026-04-01

### Added

- GitHub Actions CI workflow with 8 parallel jobs
- Never-Bypass Validation System for git hooks with audit logging
- Pre-commit hook with guard rails (9 validation gates)
- Pre-push hook with quality checks
- Interactive main branch confirmation with Y/n prompt
- Global logger and error handler modules for consistent logging
- Skill evaluator framework for testing all 17 system skills
- Multi-agent infrastructure integration from github-template-ai-agents
- Pre-commit agent skill with examples and helper scripts
- Guard rail bypass policy documentation

### Changed

- Documentation synchronized across README, QUICKSTART, and CONTRIBUTING
- Guard rails audit completed with bypass prevention policy
- Version standardized to 0.1.1 across all files
- LESSONS.md reduced noise and updated stale references
- Test suite improved with proper vitest mocks
- Secret detection exclusions for .agents/skills directory

### Fixed

- 7 pre-existing test failures in publish and scheduled modules
- Validation false positives and version mismatch issues
- CI workflow shallow clone issue (fetch-depth fix)
- Pre-commit prettier file pattern for atomic matching

### Removed

- 9 dead scripts with no active references
- CI trigger files (temporary workflow triggers)

### Security

- Bypass prevention with audit logging to .agents/bypass-audit.log
- Secret detection in commits with gitleaks pattern matching
- Critical error non-bypassable protection (5 mandatory gates)
- Local secret patterns excluded from detection

## [0.1.0] - 2026-03-15

### Added

- Initial project structure
- Cloudflare Worker foundation
- Deal discovery system architecture
- Agent coordination framework
- Basic CI/CD pipeline
- Documentation foundation

### Security

- Basic secret detection patterns
- Agent authentication system
