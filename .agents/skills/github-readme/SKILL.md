---
name: github-readme
description: "Create human-focused, well-structured README.md files for projects. Use when generating or updating project documentation, creating user-facing docs, or establishing project identity."
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# GitHub README Creator

Create human-friendly README.md files that communicate project value clearly to human developers, contributors, and users.

## When To Use

- Starting a new project and need a README
- Updating outdated or incomplete project documentation
- Reorganizing project docs for clarity
- Creating README for open source release
- Adding sections to existing README (badges, quickstart, examples)

## Required Inputs

```text
PROJECT_NAME: The name of the project or repository
PROJECT_TYPE: (lib/app/cli/service/extension/other)
PURPOSE: One-sentence description of what it does
```

## README Structure Template

### Standard Sections

````markdown
# Project Name

[![Build Status](badge-url)](link)
[![License](badge-url)](link)

> One-sentence description that captures the essence

## Quick Start

```bash
npm install your-project
npx your-project --help
```
````

## Features

- Feature 1: Brief description
- Feature 2: Brief description
- Feature 3: Brief description

## Installation

```bash
# npm
npm install your-project

# yarn
yarn add your-project
```

## Usage

### Basic Example

```javascript
const lib = require("your-project");
lib.run();
```

### Advanced Usage

Show more complex scenarios

## Configuration

Describe configuration options

## API Reference

Link to detailed API docs or include basic methods

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

[MIT](./LICENSE)

```

## Writing Principles

### 1. Human-First Language

**Good:**
- "Deploy your Workers in seconds"
- "Find deals before they go viral"
- "One command to start"

**Bad:**
- "This module provides functionality for..."
- "Implementation of algorithm X..."

### 2. Progressive Disclosure

Structure information from most to least important:
1. What is it? (1 sentence)
2. How do I try it? (Quick start)
3. How does it work? (Usage)
4. Tell me more (API, config, internals)

### 3. Show, Don't Tell

**Bad:**
```

This tool can fetch data from multiple sources.

````

**Good:**
```bash
$ deal-finder --source producthunt --days 7
Found 12 AI tools launched this week:
1. AI Image Generator - 500 upvotes
2. Code Review Bot - 342 upvotes
...
````

### 4. Badges That Matter

Include only relevant badges:

- Build status (CI/CD)
- Version
- License
- Coverage (if >70%)
- Downloads (if published)

### 5. Clear Installation Path

```bash
# Step 1: Install
npm install -g deal-finder

# Step 2: Configure (if needed)
deal-finder init

# Step 3: Run
deal-finder scan --sources producthunt
```

## Deal Discovery Context

When creating READMEs for deal discovery projects:

### Highlight Value Proposition

```markdown
# Deal Discovery Relay

> Autonomous deal discovery with AI-powered research coordination

## Why This Exists

Finding great deals requires monitoring multiple sources 24/7.
This agent system:

- Watches 10+ sources continuously
- Uses AI to extract deal signals
- Coordinates multiple research agents
- Delivers ranked opportunities to your inbox
```

### Show Multi-Agent Architecture

Use a diagram or list to explain how agents work together:

```markdown
## Architecture
```

[Research Agents] → [Deal Extractor] → [Ranker] → [Notifier]
↓ ↓ ↓ ↓
ProductHunt Deal Objects ML Score Email/Slack
GitHub Trending Validation Priority Webhook
Hacker News

```

```

### Document Agent CLI

```markdown
## Agent Commands

| Command            | Description            |
| ------------------ | ---------------------- |
| `npm run research` | Run research swarm     |
| `npm run validate` | Validate deal pipeline |
| `npm run notify`   | Send notifications     |
```

## References

- [references/section-templates.md](references/section-templates.md) - Reusable section templates
- [references/badges-guide.md](references/badges-guide.md) - Badge services and formatting
- [references/examples/](references/examples/) - Example READMEs for different project types

## Quality Checklist

Before finalizing a README:

- [ ] One-sentence description captures the essence
- [ ] Quick start works with copy-paste
- [ ] Installation steps are complete
- [ ] Examples show real usage, not placeholders
- [ ] All links work (use `markdown-link-check`)
- [ ] Badges render correctly
- [ ] License is specified
- [ ] Contributing section exists (even if it links elsewhere)

## Output Format

When generating a README, return:

1. The complete markdown content
2. A checklist of what's included
3. Suggestions for additional sections if needed

## Version History

- 1.0.0 (2025-01-21) - Initial release with deal discovery context
