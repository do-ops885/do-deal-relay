# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-01

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
- Version standardized to 0.2.0 across all files
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
