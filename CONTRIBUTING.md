# Contributing to do-deal-relay

Welcome to the do-deal-relay project! We're excited that you're interested in contributing to our autonomous deal discovery system built on Cloudflare Workers.

## About This Project

do-deal-relay is a multi-agent deal discovery system that automatically finds, validates, scores, and publishes software deals and promotions. It leverages a 9-agent architecture running on Cloudflare's edge infrastructure to continuously monitor sources like ProductHunt, GitHub Trending, Hacker News, and RSS feeds.

**Key Technologies:**

- Cloudflare Workers (edge computing)
- TypeScript
- Vitest (testing)
- 9-Agent swarm coordination
- KV storage & Durable Objects

---

## Quick Start

### 1. Fork & Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/do-deal-relay.git
cd do-deal-relay

# Add upstream remote
git remote add upstream https://github.com/do-ops885/do-deal-relay.git
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies (requires Node.js >= 18.0.0)
npm install

# Install Wrangler CLI globally (if not already installed)
npm install -g wrangler

# Install Cloudflare Skills (optional, for agent coordination)
npx skills add https://github.com/cloudflare/skills
```

### 3. Setup Development Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your Cloudflare credentials
# Required: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

# Authenticate with Cloudflare
wrangler login
```

### 4. Run Quality Gates

```bash
# Validate everything is working
./scripts/quality_gate.sh

# Run tests
npm run test:ci

# Start local development server
npm run dev
```

---

## How to Contribute

### Finding Issues

We use GitHub Issues to track work:

- **Good First Issues**: Look for the `good-first-issue` label
- **Bug Reports**: Marked with `bug` label
- **Feature Requests**: Marked with `enhancement` label
- **Agent-Specific Tasks**: Marked with agent names (`discovery`, `scoring`, `validation`, etc.)

Browse issues at: https://github.com/do-ops885/do-deal-relay/issues

### Contribution Workflow

```
1. Find or create an issue
2. Create a feature branch
3. Make your changes
4. Run quality gates
5. Commit with conventional format
6. Push and create PR
7. Address review feedback
8. Merge!
```

### Step-by-Step Guide

#### 1. Create a Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create your feature branch
git checkout -b feat/add-github-trending-source
```

See [Branch Naming Conventions](#branch-naming-conventions) below.

#### 2. Make Changes

- Write clean, well-documented TypeScript code
- Follow the existing code style (see [Code Style](#code-style))
- Add or update tests for your changes
- Update documentation if needed
- **NEVER create files in the root directory** - use appropriate subfolders (see [Guard Rails](agents-docs/guard-rails.md))

#### 3. Run Quality Gates

```bash
# This MUST pass before committing
./scripts/quality_gate.sh
```

The quality gate checks:

1. TypeScript compilation
2. Unit tests (>80% coverage required)
3. Validation gates
4. Skill symlinks
5. Git hooks

#### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with conventional format
git commit -m "feat(sources): add GitHub Trending discovery source

- Implement GitHub Trending API client
- Add rate limiting and caching
- Include tests with 95% coverage

Closes #123"
```

See [Commit Message Format](#commit-message-format) for details.

#### 5. Push and Create PR

```bash
# Push to your fork
git push origin feat/add-github-trending-source

# Create PR via GitHub CLI (or use GitHub web UI)
gh pr create --title "feat: add GitHub Trending discovery source" \
  --body "Implements GitHub Trending as a new deal discovery source."
```

---

## Branch Naming Conventions

Use the following prefixes for branch names:

| Prefix      | Purpose           | Example                      |
| ----------- | ----------------- | ---------------------------- |
| `feat/`     | New features      | `feat/add-rss-parser`        |
| `fix/`      | Bug fixes         | `fix/score-calculation`      |
| `docs/`     | Documentation     | `docs/api-examples`          |
| `test/`     | Test improvements | `test/coverage-guard-rails`  |
| `refactor/` | Code refactoring  | `refactor/pipeline-async`    |
| `perf/`     | Performance       | `perf/kv-batch-ops`          |
| `chore/`    | Maintenance       | `chore/update-deps`          |
| `agent/`    | Agent-specific    | `agent/discovery-rate-limit` |

**Examples:**

```bash
# Adding a new deal source
git checkout -b feat/add-producthunt-v2

# Fixing a bug in the scoring algorithm
git checkout -b fix/score-null-handling

# Improving test coverage
git checkout -b test/publish-integration-tests

# Refactoring the state machine
git checkout -b refactor/state-machine-simplification
```

---

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary>

<body - optional>

<footer - optional>
```

### Types

| Type       | Description                                     |
| ---------- | ----------------------------------------------- |
| `feat`     | New feature                                     |
| `fix`      | Bug fix                                         |
| `docs`     | Documentation only                              |
| `test`     | Adding or fixing tests                          |
| `refactor` | Code change that neither fixes nor adds feature |
| `perf`     | Performance improvement                         |
| `chore`    | Build, dependencies, tooling                    |
| `ci`       | CI/CD changes                                   |

### Scopes

Common scopes for this project:

- `sources` - Deal discovery sources
- `pipeline` - Processing pipeline stages
- `scoring` - Deal scoring algorithms
- `validation` - Validation gates
- `publish` - Publishing to GitHub
- `storage` - KV and Durable Objects
- `agents` - Agent coordination
- `config` - Configuration
- `types` - TypeScript types
- `tests` - Test infrastructure
- `docs` - Documentation
- `worker` - Cloudflare Worker code

### Examples

```
feat(sources): add Hacker News discovery source

Implement HN API client with rate limiting and
duplicate detection. Supports filtering by minimum
points threshold.

Closes #145
```

```
fix(scoring): handle null description in score calculation

Prevents crash when deal description is undefined.
Adds fallback to title-based scoring.

Fixes #198
```

```
test(validation): add guard rails for XSS detection

Increases coverage to 95% for guard-rails.ts
Adds tests for edge cases in URL validation.
```

---

## Code Style

We follow the patterns established in [AGENTS.md](AGENTS.md) and enforced by our quality gates:

### TypeScript Guidelines

```typescript
// Use explicit types
interface Deal {
  id: string;
  code: string;
  title: string;
  url: string;
  reward?: number;
  source: string;
  discoveredAt: number;
}

// Use async/await, avoid callbacks
async function fetchDeals(source: string): Promise<Deal[]> {
  const response = await fetch(source);
  return response.json();
}

// Prefer const, use let only when necessary
const deals: Deal[] = [];
let processedCount = 0;

// Use descriptive variable names
const isValidDeal = validateDeal(deal);

// Export interfaces and types
export type { Deal };
```

### File Organization

**Critical**: Follow the root directory policy from [guard-rails.md](agents-docs/guard-rails.md):

| File Type       | Destination               |
| --------------- | ------------------------- |
| Worker code     | `worker/`                 |
| Tests           | `tests/`                  |
| Scripts         | `scripts/`                |
| Documentation   | `docs/` or `agents-docs/` |
| Temporary files | `temp/` (gitignored)      |
| Skills          | `.agents/skills/`         |

**Only these files belong in root:**

- `.gitignore`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vitest.config.ts`
- `wrangler.toml`
- `README.md`, `VERSION`, `LICENSE`

### Pipeline Architecture

When modifying the deal pipeline, follow the stage pattern:

```typescript
// worker/pipeline/stage.ts
export interface PipelineStage<T, R> {
  name: string;
  process(input: T): Promise<R>;
}

// Example implementation
export const discoverStage: PipelineStage<Config, RawDeal[]> = {
  name: "discover",
  async process(config) {
    // Implementation
  },
};
```

---

## Testing Requirements

We require **>80% test coverage** for all contributions.

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:ci

# Run specific test file
npm test -- tests/unit/score.test.ts

# Run in watch mode
npm test -- --watch
```

### Writing Tests

We use **Vitest** for testing:

```typescript
// tests/unit/score.test.ts
import { describe, it, expect } from "vitest";
import { calculateScore } from "../../worker/pipeline/score";

describe("calculateScore", () => {
  it("should score high-value deals higher", () => {
    const deal = {
      reward: 500,
      description: "Enterprise software",
      source: "producthunt",
    };

    const score = calculateScore(deal);
    expect(score).toBeGreaterThan(0.8);
  });

  it("should handle missing reward", () => {
    const deal = {
      description: "Free tier",
      source: "github",
    };

    const score = calculateScore(deal);
    expect(score).toBeGreaterThan(0);
  });
});
```

### Test Categories

1. **Unit Tests** (`tests/unit/*.test.ts`) - Test individual functions/modules
2. **Integration Tests** (`tests/integration/*.test.ts`) - Test component interactions
3. **Pipeline Tests** - Test deal flow through all stages

### Testing Cloudflare APIs

Use Miniflare for local Cloudflare API mocking:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getMiniflare } from "vitest-environment-miniflare";

describe("KV Storage", () => {
  let kv: KVNamespace;

  beforeAll(() => {
    const mf = getMiniflare();
    kv = mf.getKVNamespace("DEALS");
  });

  it("should store and retrieve deals", async () => {
    await kv.put("deal:123", JSON.stringify({ id: "123" }));
    const deal = await kv.get("deal:123");
    expect(deal).toBeDefined();
  });
});
```

---

## Documentation Updates

When contributing, update relevant documentation:

### Code Documentation

```typescript
/**
 * Calculates a deal score based on reward, description quality,
 * and source trustworthiness.
 *
 * @param deal - The deal to score
 * @returns Score between 0 and 1
 * @throws {ValidationError} If deal is missing required fields
 */
export function calculateScore(deal: Deal): number {
  // Implementation
}
```

### User Documentation

Update files in `docs/` when changing:

- API behavior
- Configuration options
- Deployment procedures
- Agent capabilities

### Architecture Documentation

Update files in `agents-docs/` when changing:

- Agent coordination patterns
- Pipeline stages
- State machine transitions
- System architecture

---

## PR Checklist

Before submitting your PR, ensure:

- [ ] Quality gates pass (`./scripts/quality_gate.sh`)
- [ ] Tests pass with >80% coverage
- [ ] TypeScript compiles without errors
- [ ] Code follows style guidelines
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventional format
- [ ] Branch is up-to-date with `main`
- [ ] No files created in root directory (except allowed ones)
- [ ] PR description explains the change
- [ ] Related issues linked (e.g., "Closes #123")

---

## Good First Contributions

New to the project? Here are some ways to get started:

### 1. Add New Deal Sources

The discovery pipeline supports multiple sources. Add a new one:

```typescript
// worker/sources/my-new-source.ts
export async function fetchFromMySource(): Promise<RawDeal[]> {
  // Implementation
}
```

**Ideas:**

- Reddit deals subreddits
- Indie Hackers product launches
- StackShare tool updates
- Twitter/X deal announcements

### 2. Improve Scoring Algorithms

Enhance the deal scoring in `worker/pipeline/score.ts`:

- Add ML-based relevance scoring
- Implement category-specific scoring
- Add time-decay for deal freshness
- Create user preference learning

### 3. Add Validation Gates

Extend the 9-gate validation system in `worker/lib/guard-rails.ts`:

- Add domain reputation check
- Implement spam detection
- Add content similarity detection
- Create deal categorization

### 4. Enhance Agent Coordination

Improve the multi-agent system:

- Add new skill to `.agents/skills/`
- Optimize handoff protocols
- Implement new swarm patterns
- Add agent health monitoring

### 5. Documentation Improvements

- Add API usage examples
- Create troubleshooting guides
- Improve setup instructions
- Add architecture diagrams

### 6. Test Coverage

Improve test coverage in under-tested areas:

- Add edge case tests
- Create integration tests for new sources
- Add performance benchmarks
- Implement contract tests

---

## Deal-Specific Contribution Ideas

### New Source Integrations

```typescript
// Example: Adding a new RSS feed source
// worker/sources/rss-source.ts

export interface RSSSourceConfig {
  url: string;
  category: string;
  trustScore: number;
}

export async function parseRSSFeed(
  config: RSSSourceConfig,
): Promise<RawDeal[]> {
  const feed = await fetch(config.url);
  const items = await parseFeed(await feed.text());

  return items.map((item) => ({
    code: extractCode(item.title),
    title: item.title,
    description: item.description,
    url: item.link,
    source: `rss:${config.category}`,
    discoveredAt: Date.now(),
  }));
}
```

### Scoring Algorithm Enhancements

```typescript
// Example: Time-based scoring decay
// worker/pipeline/score.ts

function applyTimeDecay(score: number, discoveredAt: number): number {
  const hoursSinceDiscovery = (Date.now() - discoveredAt) / (1000 * 60 * 60);
  const decayFactor = Math.exp(-hoursSinceDiscovery / 168); // 1 week half-life
  return score * decayFactor;
}
```

### Validation Improvements

```typescript
// Example: Domain reputation check
// worker/lib/guard-rails.ts

const TRUSTED_DOMAINS = new Set([
  "github.com",
  "producthunt.com",
  "appsumo.com",
  // ... more domains
]);

export function validateDomain(url: string): boolean {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  return TRUSTED_DOMAINS.has(domain);
}
```

---

## Questions & Help

### Getting Help

- **GitHub Issues**: https://github.com/do-ops885/do-deal-relay/issues
- **Discussions**: https://github.com/do-ops885/do-deal-relay/discussions
- **Documentation**: Check `docs/` and `agents-docs/` folders

### Common Issues

**Quality gate fails?**

```bash
# Check what's failing
./scripts/quality_gate.sh

# Run individual checks
npm run lint      # TypeScript
npm run test:ci   # Tests
npm run validate  # Validation gates
```

**Tests fail?**

```bash
# Run in verbose mode
npm test -- --reporter=verbose

# Check coverage
npm run test:ci -- --coverage
```

**Wrangler issues?**

```bash
# Re-authenticate
wrangler logout
wrangler login

# Check config
wrangler whoami
```

### Reporting Bugs

When reporting bugs, please include:

1. **Environment**: Node version, OS, Wrangler version
2. **Steps to reproduce**: Clear step-by-step instructions
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Logs**: Relevant error messages or stack traces
6. **Trace ID**: If available from `/health` endpoint

### Feature Requests

For feature requests:

1. Check existing issues first
2. Describe the use case
3. Explain why it benefits the project
4. Provide examples if possible

---

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on what's best for the project
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Personal attacks
- Publishing others' private information
- Other unprofessional conduct

### Enforcement

Violations may result in temporary or permanent ban from the project.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Acknowledgments

Thank you to all contributors who help make do-deal-relay better!

Special thanks to:

- The Cloudflare Workers team for the excellent platform
- Contributors who add new deal sources
- Bug reporters and testers
- Documentation writers

---

**Happy Contributing!** 🚀

_Questions? Open an issue or discussion on GitHub._
