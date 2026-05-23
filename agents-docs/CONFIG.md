# Configuration Reference

Centralized configuration for do-deal-relay repository.
`agents-docs/CONFIG.md` - Detailed reference for `.agents/config.sh`

## Overview

`.agents/config.sh` is the machine-readable single source of truth for all repository constants. It contains named constants, utility functions, and configuration values used across scripts.

## Usage in Scripts

Source the config file at the start of your script:
```bash
#!/bin/bash
# Source config.sh from script location
source "$(dirname "$0")/../.agents/config.sh"

# Now use the constants
echo "Max lines per file: $MAX_LINES_PER_SOURCE_FILE"
log_info "Starting process..."
```

## Available Constants

### File Size Limits
- `MAX_LINES_PER_SOURCE_FILE`: 500 (Scripts, code files)
- `MAX_LINES_PER_SKILL_MD`: 250 (SKILL.md files)
- `MAX_LINES_PER_CONFIG_FILE`: 250 (Config files)
- `MAX_LINES_AGENTS_MD`: 200 (AGENTS.md)
- `MAX_CONTEXT_TOKENS`: 4000 (Context tokens for memory retrieval)

### Repository Constraints
- `TRUST_THRESHOLD_MIN`: 0.0
- `TRUST_THRESHOLD_MAX`: 1.0
- `GLOBAL_CANDIDATE_BUDGET`: 1000

### Retry and Polling
- `DEFAULT_MAX_RETRIES`: 3
- `DEFAULT_RETRY_DELAY_SECONDS`: 5
- `DEFAULT_POLL_INTERVAL_SECONDS`: 5
- `DEFAULT_MAX_POLL_ATTEMPTS`: 12
- `DEFAULT_TIMEOUT_SECONDS`: 1800 (30 min)

### Git / PR Configuration
- `MAX_COMMIT_SUBJECT_LENGTH`: 72
- `MAX_PR_TITLE_LENGTH`: 72
- `MAX_PR_BODY_LINE_LENGTH`: 80

### Quality Thresholds
- `MIN_TEST_COVERAGE_PERCENT`: 80
- `MAX_ALLOWED_WARNINGS`: 0
- `MAX_ALLOWED_LINT_ERRORS`: 0

## Utility Functions

### Logging Functions
- `log_info "Message"`
- `log_success "Message"`
- `log_warning "Message"`
- `log_error "Message"`
- `log_section "Header"`

### Helper Functions
- `command_exists "command"`: Check if command exists
- `count_content_lines "file"`: Count non-empty, non-comment lines
- `is_valid_version "1.2.3"`: Validate semantic version format
- `is_ci`: Check if running in CI
- `get_git_relative_path`: Get path from git root
