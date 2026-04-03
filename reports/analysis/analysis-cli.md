# Referral CLI Tool Design Document

**Version: 0.1.1  
**Date**: 2026-04-01  
**Status**: Design Phase  
**Author**: CLI Design Agent

---

## Executive Summary

This document outlines the design for a production-ready CLI tool (`refcli`) to manage referral codes/links within the do-deal-relay system. The CLI provides developers and administrators with direct control over referral data, web research capabilities, and system management.

---

## 1. CLI Framework Selection

### Chosen: oclif v4 (oclif/core)

**Rationale**:

| Framework | Pros | Cons | Decision |
|-----------|------|------|----------|
| **oclif** | Plugin system, auto-generated help, TypeScript native, hooks, testing tools | Slightly heavier | ✅ **Selected** |
| commander | Lightweight, simple | Manual help generation, no plugins | ❌ |
| ink | React-based TUI | Overkill for this use case | ❌ |
| yargs | Good arg parsing | Less structured than oclif | ❌ |

**oclif Advantages**:
- Industry standard (Heroku, Salesforce, Twilio CLIs)
- Automatic flag parsing and validation
- Built-in help generation
- Plugin architecture for extensibility
- Native TypeScript support
- Comprehensive testing framework
- Topic-based command organization

---

## 2. Command Structure

```
refcli
├── auth          # Authentication management
│   ├── login     # Authenticate with API key
│   ├── logout    # Clear credentials
│   └── whoami    # Show current user
├── codes         # Referral code management
│   ├── list      # List all codes
│   ├── add       # Add a new code
│   ├── get       # Get code details
│   ├── update    # Update code metadata
│   ├── deactivate # Deactivate a code
│   ├── reactivate # Reactivate a code
│   └── delete    # Hard delete a code
├── search        # Search and filter
│   ├── by-domain # Search by domain
│   ├── by-category # Search by category
│   └── advanced  # Complex query builder
├── import        # Bulk operations
│   ├── csv       # Import from CSV
│   ├── json      # Import from JSON
│   └── validate  # Validate import file
├── research      # Web research
│   ├── run       # Execute research query
│   ├── status    # Check research status
│   └── results   # View research results
├── discover      # Discovery pipeline
│   ├── trigger   # Trigger manual discovery
│   ├── status    # Check pipeline status
│   └── logs      # View discovery logs
├── system        # System operations
│   ├── health    # Check system health
│   ├── metrics   # View Prometheus metrics
│   └── export    # Export data
└── config        # Configuration
    ├── get       # Get config value
    ├── set       # Set config value
    └── list      # List all config
```

---

## 3. Command Specifications

### 3.1 Authentication Commands

#### `refcli auth login`
```bash
# Interactive mode
$ refcli auth login
Enter API endpoint: https://api.example.com
Enter API key: ********************************
✓ Authenticated as admin@example.com

# Non-interactive mode
$ refcli auth login --endpoint https://api.example.com --key $API_KEY
```

**Flags**:
- `--endpoint, -e`: API endpoint URL
- `--key, -k`: API key (warns if passed directly)
- `--environment, -E`: Environment (production, staging, development)

**Configuration Stored**:
```json
{
  "version": "1",
  "currentProfile": "default",
  "profiles": {
    "default": {
      "endpoint": "https://api.example.com",
      "apiKey": "encrypted:...",
      "environment": "production"
    }
  }
}
```

---

### 3.2 Code Management Commands

#### `refcli codes list`
```bash
# Default table output
$ refcli codes list
┌────────────────┬─────────────┬────────┬─────────────────────┐
│ Domain         │ Code        │ Status │ Reward              │
├────────────────┼─────────────┼────────┼─────────────────────┤
│ trading212.com │ GcCOCxbo    │ active │ Free share (£100)   │
│ coinbase.com   │ CB-REF-123  │ active │ $50 BTC             │
│ binance.com    │ BIN-456     │ inactive │ Expired           │
└────────────────┴─────────────┴────────┴─────────────────────┘
Showing 3 of 45 codes

# JSON output
$ refcli codes list --format json

# Filtered
$ refcli codes list --status active --domain coinbase.com
```

**Flags**:
- `--status, -s`: Filter by status (active, inactive, expired, quarantined, all)
- `--domain, -d`: Filter by domain
- `--category, -c`: Filter by category
- `--limit, -l`: Limit results (default: 100, max: 1000)
- `--offset, -o`: Pagination offset
- `--format, -f`: Output format (table, json, csv, yaml)
- `--no-header`: Hide table header

#### `refcli codes add`
```bash
# Interactive mode
$ refcli codes add
? Domain: trading212.com
? Referral Code: GcCOCxbo
? URL: https://trading212.com/invite/GcCOCxbo
? Reward Type: item
? Reward Value: Free share worth up to £100
? Categories (comma-separated): trading, investing
? Tags (comma-separated): uk, stock-market
? Expiry Date (ISO 8601): 2026-12-31T23:59:59Z
? Notes: UK-only referral program
✓ Code added successfully: GcCOCxbo
  ID: ref-trading212.com-GcCOCxbo-1234567890

# Non-interactive (JSON input)
$ refcli codes add --file new-code.json

# Non-interactive (flags)
$ refcli codes add \
  --domain trading212.com \
  --code GcCOCxbo \
  --url https://trading212.com/invite/GcCOCxbo \
  --reward-type item \
  --reward-value "Free share worth up to £100" \
  --categories trading,investing \
  --tags uk,stock-market
```

**Flags**:
- `--file, -f`: JSON file with code data
- `--domain, -d`: Domain (required if no file)
- `--code, -c`: Referral code (required if no file)
- `--url, -u`: Referral URL (required if no file)
- `--reward-type`: cash, credit, percent, item
- `--reward-value`: Reward value/description
- `--currency`: Currency code (USD, GBP, EUR)
- `--categories, -C`: Comma-separated categories
- `--tags, -t`: Comma-separated tags
- `--expiry`: Expiry date (ISO 8601)
- `--source`: Source of this code (manual, api, web_research)
- `--confidence`: Confidence score (0.0 - 1.0)
- `--requirements`: Comma-separated requirements

#### `refcli codes get`
```bash
$ refcli codes get GcCOCxbo

ID:              ref-trading212.com-GcCOCxbo-1234567890
Domain:          trading212.com
Code:            GcCOCxbo
Status:          active
URL:             https://trading212.com/invite/GcCOCxbo
Reward:          Free share worth up to £100
Reward Type:     item
Categories:      trading, investing
Tags:            uk, stock-market
Submitted:       2024-03-15T10:30:00Z
Source:          manual
Confidence:      0.85
Expires:         2026-12-31T23:59:59Z
```

#### `refcli codes deactivate`
```bash
$ refcli codes deactivate GcCOCxbo --reason expired --notes "Program ended Q1 2026"
✓ Deactivated GcCOCxbo
  Reason: expired
  Deactivated at: 2026-04-01T12:00:00Z

# With replacement code
$ refcli codes deactivate OLD-CODE --reason replaced --replaced-by NEW-CODE
```

**Flags**:
- `--reason, -r`: expired, invalid, violation, replaced, user_request
- `--replaced-by`: New code that replaces this one
- `--notes, -n`: Additional notes

#### `refcli codes reactivate`
```bash
$ refcli codes reactivate GcCOCxbo --notes "Program extended for Q2"
✓ Reactivated GcCOCxbo
  Previous status: inactive
  Reactivated at: 2026-04-01T12:00:00Z
```

#### `refcli codes delete`
```bash
$ refcli codes delete GcCOCxbo --confirm
⚠️  This will permanently delete the referral code.
Are you sure? (yes/no): yes
✓ Deleted GcCOCxbo
```

**Flags**:
- `--confirm`: Skip confirmation prompt (for scripts)

---

### 3.3 Search Commands

#### `refcli search by-domain`
```bash
$ refcli search by-domain coinbase.com
┌──────────────┬────────────┬────────┬────────────┐
│ Code         │ Status     │ Reward │ Updated    │
├──────────────┼────────────┼────────┼────────────┤
│ CB-REF-123   │ active     │ $50    │ 2024-03-15 │
│ CB-OLD-456   │ inactive   │ $25    │ 2023-12-01 │
└──────────────┴────────────┴────────┴────────────┘
```

#### `refcli search by-category`
```bash
$ refcli search by-category crypto --status active
```

#### `refcli search advanced`
```bash
# Complex query with multiple filters
$ refcli search advanced \
  --domain coinbase.com \
  --status active \
  --category crypto \
  --reward-min 50 \
  --reward-type cash \
  --sort-by confidence \
  --sort-order desc
```

---

### 3.4 Import Commands

#### `refcli import csv`
```bash
# Validate first
$ refcli import validate codes.csv
✓ File format valid
✓ 50 records found
✓ 48 records valid
⚠ 2 records have errors:
   - Row 15: Missing required field "url"
   - Row 23: Invalid URL format

# Import with validation
$ refcli import csv codes.csv --validate-only

# Import for real
$ refcli import csv codes.csv --dry-run
Dry run complete:
  - 48 codes would be added
  - 2 codes would be skipped (validation errors)

# Actual import
$ refcli import csv codes.csv
Importing...
[████████████████████] 100% | 48/48 codes imported

✓ Import complete:
  - 48 codes added successfully
  - 2 codes skipped (see import-log-2026-04-01.json)
```

**CSV Format**:
```csv
domain,code,url,reward_type,reward_value,currency,categories,tags,expiry,source,confidence
"trading212.com","GcCOCxbo","https://trading212.com/invite/GcCOCxbo","item","Free share worth up to £100","","trading,investing","uk,stock-market","2026-12-31T23:59:59Z","manual","0.85"
```

#### `refcli import json`
```bash
$ refcli import json codes.json --dry-run
```

**JSON Format**:
```json
{
  "import_metadata": {
    "source": "manual_migration",
    "imported_by": "admin@example.com",
    "imported_at": "2026-04-01T12:00:00Z"
  },
  "codes": [
    {
      "domain": "trading212.com",
      "code": "GcCOCxbo",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "reward_type": "item",
      "reward_value": "Free share worth up to £100",
      "categories": ["trading", "investing"],
      "tags": ["uk", "stock-market"]
    }
  ]
}
```

---

### 3.5 Research Commands

#### `refcli research run`
```bash
# Quick search
$ refcli research run "trading platform referral codes"
Research started:
  Query: trading platform referral codes
  Depth: quick
  Sources: all
  Max results: 20

Research ID: research-2026-04-01-abc123

Run `refcli research status research-2026-04-01-abc123` to check progress.

# Thorough search with specific sources
$ refcli research run "crypto exchange referrals" \
  --depth thorough \
  --sources producthunt,github,hackernews \
  --domain coinbase.com \
  --max-results 50

# Deep research (may take several minutes)
$ refcli research run "investment app deals" --depth deep
```

**Flags**:
- `--depth`: quick (1-2 min), thorough (5-10 min), deep (15-30 min)
- `--sources`: producthunt, github, hackernews, reddit, twitter, company_site, all
- `--domain`: Focus on specific domain
- `--max-results`: 1-100

#### `refcli research status`
```bash
$ refcli research status research-2026-04-01-abc123
Research Status: complete
Query: trading platform referral codes
Started: 2026-04-01T12:00:00Z
Duration: 2m 34s

Progress:
  ✓ ProductHunt: 3 codes found
  ✓ GitHub: 2 codes found
  ✓ HackerNews: 1 code found
  ✓ Reddit: 5 codes found

Results: 11 codes discovered
  - 8 high confidence (>0.8)
  - 3 medium confidence (0.5-0.8)

Run `refcli research results research-2026-04-01-abc123` to view details.
```

#### `refcli research results`
```bash
$ refcli research results research-2026-04-01-abc123

Discovered Codes:
┌─────────────────┬──────────────┬────────────┬────────────┬────────────┐
│ Domain          │ Code         │ Confidence │ Source     │ Reward     │
├─────────────────┼──────────────┼────────────┼────────────┼────────────┤
│ trading212.com  │ REF2026      │ 0.92       │ Reddit     │ Free share │
│ etoro.com       │ ETO-INVITE   │ 0.88       │ ProductHunt│ $50 credit │
│ robinhood.com   │ RH-NEW2026   │ 0.85       │ GitHub     │ Free stock │
│ webull.com      │ WEB-TRADE    │ 0.82       │ HackerNews │ 5 stocks   │
└─────────────────┴──────────────┴────────────┴────────────┴────────────┘

# Import discovered codes
$ refcli research results research-2026-04-01-abc123 --import --min-confidence 0.8
✓ 8 codes imported with confidence >= 0.8
```

---

### 3.6 Discovery Pipeline Commands

#### `refcli discover trigger`
```bash
$ refcli discover trigger
Discovery pipeline triggered successfully:
  Run ID: deals-2026-04-01-12-00-00
  Status: running
  Started: 2026-04-01T12:00:00Z

Run `refcli discover status` to monitor progress.
```

#### `refcli discover status`
```bash
$ refcli discover status
Pipeline Status: running
Current Phase: validate
Run ID: deals-2026-04-01-12-00-00
Started: 2026-04-01T12:00:00Z
Duration: 4m 12s

Pipeline Progress:
  ✓ init
  ✓ discover (15 candidates)
  ✓ normalize
  ✓ dedupe (2 duplicates removed)
  → validate (in progress: 8/13)
  ○ score
  ○ stage
  ○ publish
  ○ verify
  ○ finalize

Last Log:
  2026-04-01T12:04:10Z [validate] Processing candidate 8/13: binance.com
```

#### `refcli discover logs`
```bash
# Recent logs
$ refcli discover logs

# Specific run
$ refcli discover logs --run-id deals-2026-04-01-12-00-00

# Follow/live tail
$ refcli discover logs --follow

# Export as JSONL
$ refcli discover logs --format jsonl --output logs.jsonl
```

---

### 3.7 System Commands

#### `refcli system health`
```bash
$ refcli system health
System Status: healthy
Version: 0.1.1
Timestamp: 2026-04-01T12:00:00Z

Checks:
  ✓ KV Connection: connected
  ✓ Last Run: success (2026-04-01T06:00:00Z)
  ✓ Snapshot: valid (45 active deals)

Last Pipeline Run:
  Run ID: deals-2026-04-01-06-00-00
  Status: success
  Duration: 8m 23s
  Deals Published: 45
```

#### `refcli system metrics`
```bash
# Human readable
$ refcli system metrics

Metrics (last 24h):
  Total Runs: 4
  Successful: 4 (100%)
  Active Deals: 45
  Candidates Discovered: 62
  Valid Deals: 48
  Duplicates Filtered: 8
  Quarantined: 3

# Prometheus format
$ refcli system metrics --raw

# JSON format
$ refcli system metrics --format json
```

#### `refcli system export`
```bash
# Export all codes
$ refcli system export --output export-2026-04-01.json

# Export by filter
$ refcli system export --status active --format csv --output active-codes.csv

# Full snapshot
$ refcli system export --full-snapshot --output snapshot-2026-04-01.json
```

---

### 3.8 Config Commands

#### `refcli config`
```bash
# List all config
$ refcli config list
Current Profile: production

Settings:
  api.endpoint = https://api.example.com
  api.timeout = 30000
  output.format = table
  output.colors = true
  log.level = info
  log.file = ~/.refcli/logs/refcli.log

# Get specific value
$ refcli config get api.endpoint
https://api.example.com

# Set value
$ refcli config set output.format json
✓ Set output.format = json

# Set per-command default
$ refcli config set codes.list.format json
✓ Set codes.list.format = json (command-specific)
```

**Configuration Locations**:
- macOS: `~/Library/Application Support/refcli/config.json`
- Linux: `~/.config/refcli/config.json`
- Windows: `%APPDATA%\refcli\config.json`

---

## 4. Global Flags

All commands support these flags:

| Flag | Description | Default |
|------|-------------|---------|
| `--profile, -p` | Use specific auth profile | default |
| `--endpoint, -e` | Override API endpoint | from config |
| `--api-key, -k` | Override API key | from config |
| `--format, -f` | Output format | from config |
| `--quiet, -q` | Suppress non-error output | false |
| `--verbose, -v` | Enable verbose logging | false |
| `--dry-run` | Simulate without making changes | false |
| `--no-color` | Disable colored output | false |
| `--help, -h` | Show help | - |
| `--version, -V` | Show version | - |

---

## 5. Error Handling & Validation

### 5.1 Error Format

```bash
# CLI Error Output (human-readable)
$ refcli codes add --domain invalid
✗ Error: Invalid domain format
  Code: VALIDATION_ERROR
  Field: domain
  Value: invalid
  Hint: Domain must be a valid hostname (e.g., example.com)

# JSON Error Output
$ refcli codes add --domain invalid --format json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid domain format",
    "field": "domain",
    "value": "invalid",
    "hint": "Domain must be a valid hostname",
    "docs_url": "https://docs.refcli.dev/errors/VALIDATION_ERROR"
  }
}
```

### 5.2 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Authentication error |
| 4 | Not found |
| 5 | Validation error |
| 6 | Rate limited |
| 7 | Network error |
| 130 | Interrupted (Ctrl+C) |

### 5.3 Validation Strategy

**Client-side validation** (before API call):
- Required field presence
- Format validation (URLs, dates, emails)
- Type checking
- Range validation

**Server-side validation** (API):
- Duplicate checking
- Business rule validation
- Authorization

---

## 6. Output Formats

### 6.1 Table Format (default)

```bash
$ refcli codes list
┌────────────────┬─────────────┬────────┬─────────────────────┐
│ Domain         │ Code        │ Status │ Reward              │
├────────────────┼─────────────┼────────┼─────────────────────┤
│ trading212.com │ GcCOCxbo    │ active │ Free share (£100)   │
│ coinbase.com   │ CB-REF-123  │ active │ $50 BTC             │
└────────────────┴─────────────┴────────┴─────────────────────┘
```

### 6.2 JSON Format

```bash
$ refcli codes list --format json
{
  "codes": [
    {
      "id": "ref-trading212.com-GcCOCxbo-1234567890",
      "domain": "trading212.com",
      "code": "GcCOCxbo",
      "status": "active",
      "url": "https://trading212.com/invite/GcCOCxbo",
      "reward": {
        "type": "item",
        "value": "Free share worth up to £100"
      }
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 100,
    "offset": 0
  }
}
```

### 6.3 CSV Format

```bash
$ refcli codes list --format csv
domain,code,status,reward_type,reward_value
trading212.com,GcCOCxbo,active,item,"Free share worth up to £100"
coinbase.com,CB-REF-123,active,cash,50
```

### 6.4 YAML Format

```bash
$ refcli codes get GcCOCxbo --format yaml
id: ref-trading212.com-GcCOCxbo-1234567890
domain: trading212.com
code: GcCOCxbo
status: active
url: https://trading212.com/invite/GcCOCxbo
reward:
  type: item
  value: "Free share worth up to £100"
```

### 6.5 Silent/Minimal Output

```bash
$ refcli codes add --file code.json --quiet
ref-trading212.com-GcCOCxbo-1234567890

$ refcli codes list --quiet | jq '.codes[0].code'
"GcCOCxbo"
```

---

## 7. Authentication Methods

### 7.1 API Key Authentication

**Configuration file** (encrypted at rest):
```json
{
  "profiles": {
    "default": {
      "endpoint": "https://api.example.com",
      "apiKey": "ref_xxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

**Environment variable** (for CI/CD):
```bash
export REFCLI_API_KEY="ref_xxxxxxxxxxxxxxxxxxxx"
export REFCLI_ENDPOINT="https://api.example.com"
```

**Command line** (not recommended for production):
```bash
$ refcli codes list --api-key ref_xxxxxxxxxxxxxxxxxxxx
```

### 7.2 Security Considerations

- API keys stored with OS-native keychain when available
- Fallback to encrypted file storage
- Keys never logged or displayed
- Automatic token refresh if supported
- Support for short-lived tokens (CI/CD scenarios)

---

## 8. Interactive vs Non-Interactive Modes

### 8.1 Auto-Detection

The CLI automatically detects if it's running in an interactive terminal:

```typescript
// Pseudo-code
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
```

### 8.2 Interactive Mode Features

- Prompts for missing required fields
- Interactive selectors (checkboxes, pickers)
- Progress bars for long operations
- Confirmation prompts for destructive actions
- Rich error messages with suggestions

### 8.3 Non-Interactive Mode

- Fails fast on missing required fields
- No prompts (fails with error)
- JSON output by default when piped
- Progress as simple text

### 8.4 Forcing Modes

```bash
# Force interactive (even when piped)
$ refcli codes add --interactive

# Force non-interactive
$ refcli codes add --no-interactive
```

---

## 9. Configuration Management

### 9.1 Configuration Hierarchy

Values are resolved in order (later overrides earlier):

1. Default values
2. Config file (`~/.config/refcli/config.json`)
3. Environment variables (`REFCLI_*`)
4. Command-line flags

### 9.2 Environment Variables

| Variable | Description |
|----------|-------------|
| `REFCLI_API_KEY` | API key for authentication |
| `REFCLI_ENDPOINT` | API endpoint URL |
| `REFCLI_PROFILE` | Default profile to use |
| `REFCLI_FORMAT` | Default output format |
| `REFCLI_TIMEOUT` | Request timeout (ms) |
| `REFCLI_DEBUG` | Enable debug logging |
| `REFCLI_NO_COLOR` | Disable colored output |

### 9.3 Per-Project Configuration

```bash
# .refclirc.json in project root
{
  "endpoint": "https://staging-api.example.com",
  "format": "json"
}
```

---

## 10. Integration Points

### 10.1 API Integration

```typescript
// API Client Architecture
class ReferralAPI {
  constructor(config: APIConfig) {
    this.baseURL = config.endpoint;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  // Authentication header
  private getHeaders(): Headers {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `refcli/${VERSION}`
    };
  }

  // Endpoints mapped to CLI commands
  async listCodes(filters: Filters): Promise<Code[]> {
    return this.get('/deals', { params: filters });
  }

  async addCode(code: ReferralInput): Promise<Code> {
    return this.post('/api/submit', { body: code });
  }

  async deactivateCode(code: string, reason: string): Promise<Code> {
    return this.post('/api/codes/deactivate', { 
      body: { code, reason } 
    });
  }

  async searchCodes(query: SearchQuery): Promise<SearchResult> {
    return this.get('/api/search', { params: query });
  }

  async triggerResearch(request: ResearchRequest): Promise<ResearchJob> {
    return this.post('/api/research', { body: request });
  }

  async getResearchStatus(id: string): Promise<ResearchStatus> {
    return this.get(`/api/research/${id}/status`);
  }

  async triggerDiscovery(): Promise<DiscoveryJob> {
    return this.post('/api/discover');
  }

  async getDiscoveryStatus(): Promise<DiscoveryStatus> {
    return this.get('/api/status');
  }

  async getHealth(): Promise<HealthStatus> {
    return this.get('/health');
  }

  async getMetrics(): Promise<string> {
    return this.get('/metrics', { 
      headers: { 'Accept': 'text/plain' } 
    });
  }
}
```

### 10.2 Required API Extensions

The CLI requires these additional API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/codes` | GET | List all referral inputs |
| `/api/codes/:code` | GET | Get specific code details |
| `/api/codes/:code` | PUT | Update code metadata |
| `/api/codes/:code/deactivate` | POST | Deactivate code |
| `/api/codes/:code/reactivate` | POST | Reactivate code |
| `/api/codes/:code` | DELETE | Delete code |
| `/api/search` | GET | Search codes |
| `/api/research` | POST | Start research job |
| `/api/research/:id` | GET | Get research results |
| `/api/research/:id/status` | GET | Check research status |
| `/api/bulk/import` | POST | Bulk import codes |
| `/api/bulk/validate` | POST | Validate import file |

### 10.3 Data Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────────┐
│  User   │────▶│  refcli     │────▶│  Cloudflare     │
│         │     │  (oclif)    │     │  Worker API     │
└─────────┘     └─────────────┘     └─────────────────┘
                      │
                      ▼
                ┌─────────────┐
                │  KV Storage │
                │  - DEALS_*  │
                └─────────────┘
```

---

## 11. Sample Code Structure

### 11.1 Project Structure

```
cli/
├── bin/
│   ├── dev.js              # Development runner
│   ├── run.js              # Production entry
│   └── refcli              # CLI wrapper script
├── src/
│   ├── commands/           # Command implementations
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   └── whoami.ts
│   │   ├── codes/
│   │   │   ├── list.ts
│   │   │   ├── add.ts
│   │   │   ├── get.ts
│   │   │   ├── update.ts
│   │   │   ├── deactivate.ts
│   │   │   ├── reactivate.ts
│   │   │   └── delete.ts
│   │   ├── search/
│   │   │   ├── by-domain.ts
│   │   │   ├── by-category.ts
│   │   │   └── advanced.ts
│   │   ├── import/
│   │   │   ├── csv.ts
│   │   │   ├── json.ts
│   │   │   └── validate.ts
│   │   ├── research/
│   │   │   ├── run.ts
│   │   │   ├── status.ts
│   │   │   └── results.ts
│   │   ├── discover/
│   │   │   ├── trigger.ts
│   │   │   ├── status.ts
│   │   │   └── logs.ts
│   │   ├── system/
│   │   │   ├── health.ts
│   │   │   ├── metrics.ts
│   │   │   └── export.ts
│   │   └── config/
│   │       ├── get.ts
│   │       ├── set.ts
│   │       └── list.ts
│   ├── lib/
│   │   ├── api.ts          # API client
│   │   ├── auth.ts          # Authentication manager
│   │   ├── config.ts        # Configuration manager
│   │   ├── errors.ts        # Error handling
│   │   ├── formatters/      # Output formatters
│   │   │   ├── table.ts
│   │   │   ├── json.ts
│   │   │   ├── csv.ts
│   │   │   └── yaml.ts
│   │   ├── validators.ts    # Input validation
│   │   └── interactive.ts   # Interactive prompts
│   ├── types/
│   │   ├── api.ts           # API types
│   │   ├── config.ts        # Config types
│   │   └── commands.ts      # Command types
│   └── index.ts             # Main entry
├── test/
│   ├── commands/            # Command tests
│   ├── lib/                 # Library tests
│   └── fixtures/            # Test fixtures
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

### 11.2 Sample Command Implementation

```typescript
// src/commands/codes/add.ts
import { Command, Flags, Args } from '@oclif/core';
import { APIClient } from '../../lib/api';
import { formatOutput } from '../../lib/formatters';
import { promptForMissingFields } from '../../lib/interactive';
import { validateReferralInput } from '../../lib/validators';
import { ReferralInput } from '../../types/api';

export default class CodesAdd extends Command {
  static description = 'Add a new referral code';
  static examples = [
    '<%= config.bin %> <%= command.id %> --file new-code.json',
    '<%= config.bin %> <%= command.id %> --domain example.com --code REF123 --url https://example.com/invite/REF123',
  ];

  static flags = {
    file: Flags.string({
      char: 'f',
      description: 'JSON file with code data',
      helpValue: '<path>',
    }),
    domain: Flags.string({
      char: 'd',
      description: 'Domain name',
      helpValue: '<domain>',
    }),
    code: Flags.string({
      char: 'c',
      description: 'Referral code',
      helpValue: '<code>',
    }),
    url: Flags.string({
      char: 'u',
      description: 'Referral URL',
      helpValue: '<url>',
    }),
    'reward-type': Flags.string({
      description: 'Reward type',
      options: ['cash', 'credit', 'percent', 'item'],
    }),
    'reward-value': Flags.string({
      description: 'Reward value or description',
    }),
    currency: Flags.string({
      description: 'Currency code',
      options: ['USD', 'GBP', 'EUR', 'BTC', 'ETH'],
    }),
    categories: Flags.string({
      char: 'C',
      description: 'Comma-separated categories',
    }),
    tags: Flags.string({
      char: 't',
      description: 'Comma-separated tags',
    }),
    expiry: Flags.string({
      description: 'Expiry date (ISO 8601)',
    }),
    source: Flags.string({
      description: 'Source of this code',
      options: ['manual', 'api', 'web_research'],
      default: 'manual',
    }),
    confidence: Flags.string({
      description: 'Confidence score (0.0 - 1.0)',
      default: '0.5',
    }),
    requirements: Flags.string({
      description: 'Comma-separated requirements',
    }),
    format: Flags.string({
      char: 'F',
      description: 'Output format',
      options: ['table', 'json', 'yaml'],
      default: 'table',
    }),
    'dry-run': Flags.boolean({
      description: 'Validate without creating',
    }),
    quiet: Flags.boolean({
      char: 'q',
      description: 'Only output the ID',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CodesAdd);

    // Load from file or flags
    let input: Partial<ReferralInput> = {};
    
    if (flags.file) {
      input = await this.loadFromFile(flags.file);
    } else {
      input = this.buildFromFlags(flags);
    }

    // Interactive mode for missing fields
    if (this.isInteractive && (!input.domain || !input.code || !input.url)) {
      const answers = await promptForMissingFields(input);
      input = { ...input, ...answers };
    }

    // Validate
    const validation = validateReferralInput(input);
    if (!validation.valid) {
      this.error(validation.errors.join('\n'), { exit: 5 });
    }

    // Dry run
    if (flags['dry-run']) {
      this.log('Dry run - validation passed');
      this.log(formatOutput(input as ReferralInput, flags.format));
      return;
    }

    // API call
    const api = new APIClient(this.config);
    const result = await api.addCode(input as ReferralInput);

    // Output
    if (flags.quiet) {
      this.log(result.id);
    } else {
      this.log(`✓ Code added successfully: ${result.code}`);
      this.log(`  ID: ${result.id}`);
      this.log(formatOutput(result, flags.format));
    }
  }

  private async loadFromFile(path: string): Promise<Partial<ReferralInput>> {
    // Implementation...
  }

  private buildFromFlags(flags: Record<string, unknown>): Partial<ReferralInput> {
    // Implementation...
  }
}
```

### 11.3 API Client Implementation

```typescript
// src/lib/api.ts
import { Config } from '@oclif/core';
import fetch, { RequestInit, Response } from 'node-fetch';
import { APIError, AuthenticationError, NotFoundError } from './errors';

export class APIClient {
  private baseURL: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: Config) {
    this.baseURL = config.get('api.endpoint');
    this.apiKey = config.get('api.key');
    this.timeout = config.get('api.timeout', 30000);
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `refcli/${process.env.REFCLI_VERSION}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleError(response);
      }

      return await response.json() as T;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new APIError('Request timeout', 'TIMEOUT_ERROR');
      }
      throw error;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return this.request<T>(`${endpoint}${queryString}`, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  private async handleError(response: Response): Promise<void> {
    const body = await response.json().catch(() => ({}));
    
    switch (response.status) {
      case 401:
        throw new AuthenticationError(body.message || 'Invalid API key');
      case 404:
        throw new NotFoundError(body.message || 'Resource not found');
      case 429:
        throw new APIError('Rate limited', 'RATE_LIMIT', response.headers.get('Retry-After'));
      default:
        throw new APIError(
          body.message || `HTTP ${response.status}`,
          body.code || 'API_ERROR',
          body.details
        );
    }
  }

  // Convenience methods
  async listCodes(filters: CodeFilters): Promise<CodeListResponse> {
    return this.get('/api/codes', filters as Record<string, string>);
  }

  async addCode(code: ReferralInput): Promise<CodeResponse> {
    return this.post('/api/codes', code);
  }

  async getCode(code: string): Promise<CodeResponse> {
    return this.get(`/api/codes/${encodeURIComponent(code)}`);
  }

  async deactivateCode(code: string, reason: string): Promise<CodeResponse> {
    return this.post(`/api/codes/${encodeURIComponent(code)}/deactivate`, { reason });
  }

  // ... more methods
}
```

---

## 12. Pros and Cons Summary

### 12.1 oclif Framework

**Pros**:
- ✅ Mature, production-tested (Heroku, Twilio)
- ✅ Excellent TypeScript support
- ✅ Auto-generated help and documentation
- ✅ Plugin architecture for future extensibility
- ✅ Built-in argument/flag parsing and validation
- ✅ Hook system for customization
- ✅ Testing utilities
- ✅ Active community

**Cons**:
- ❌ Slightly larger bundle size (~2MB)
- ❌ Learning curve for advanced features
- ❌ Opinionated structure (can be restrictive)

### 12.2 API Key Authentication

**Pros**:
- ✅ Simple to implement
- ✅ Easy to rotate
- ✅ Works well for CLI use case
- ✅ Can be scoped (read-only, admin)

**Cons**:
- ❌ Less secure than OAuth for web apps
- ❌ Requires secure storage on client

### 12.3 Multiple Output Formats

**Pros**:
- ✅ Human-friendly (table)
- ✅ Scriptable (JSON, CSV)
- ✅ Configurable (YAML)
- ✅ Unix philosophy (pipeable)

**Cons**:
- ❌ More code to maintain
- ❌ Testing overhead

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Initialize oclif project
- [ ] Set up TypeScript, ESLint, Prettier
- [ ] Implement config management
- [ ] Implement authentication (login/logout/whoami)
- [ ] Create base API client
- [ ] Add error handling framework

### Phase 2: Core Commands (Week 2)
- [ ] Implement `codes list`
- [ ] Implement `codes add`
- [ ] Implement `codes get`
- [ ] Implement `codes deactivate`
- [ ] Implement `codes reactivate`
- [ ] Add output formatters (table, JSON)

### Phase 3: Advanced Features (Week 3)
- [ ] Implement `search` commands
- [ ] Implement `import csv` and `import json`
- [ ] Implement bulk validation
- [ ] Add CSV/YAML formatters
- [ ] Add progress bars for long operations

### Phase 4: Research & Discovery (Week 4)
- [ ] Implement `research run`
- [ ] Implement `research status`
- [ ] Implement `discover trigger`
- [ ] Implement `discover status`
- [ ] Implement `discover logs`

### Phase 5: Polish & Release (Week 5)
- [ ] Add comprehensive tests
- [ ] Write documentation
- [ ] Create installation scripts
- [ ] Set up CI/CD
- [ ] Publish to npm

---

## 14. Appendix

### A. Installation Methods

```bash
# npm (recommended)
npm install -g refcli

# Homebrew (macOS/Linux)
brew install refcli

# Direct download
curl -fsSL https://refcli.dev/install.sh | sh

# Docker
docker run -it --rm refcli/cli codes list
```

### B. Usage Examples

```bash
# Daily workflow
refcli auth login
refcli codes list --status active
refcli codes add --file new-deal.json
refcli codes deactivate OLD-CODE --reason expired
refcli system health

# Batch operations
refcli import csv codes.csv --dry-run
refcli import csv codes.csv
refcli system export --status active --format csv > active-codes.csv

# Research workflow
refcli research run "crypto exchange deals" --depth thorough
refcli research status research-abc123
refcli research results research-abc123 --import --min-confidence 0.8

# CI/CD integration
REFCLI_API_KEY=$API_KEY refcli codes list --format json | jq '.codes[] | select(.reward.type == "cash")'
```

---

**End of Document**
