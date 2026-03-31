# GitHub Repository Configuration Guide

This document outlines the recommended GitHub repository settings for this project based on best practices.

## Current Configuration

**Repository:** do-ops885/do-deal-relay
**Visibility:** Private
**Default Branch:** main

## Recommended Settings

### Repository Details

- [x] **Wiki**: Disabled (documentation is in `/docs` and `/agents-docs`)
- [x] **Discussions**: Disabled (use GitHub Issues instead)
- [x] **Projects**: Currently enabled (consider disabling if not used)
- [x] **Sponsorships**: Disabled
- [x] **Preserve this repository**: Not archived

### Merge Settings (Recommended)

**Current:**

- ✅ Merge commits: Enabled
- ✅ Squash merging: Enabled
- ✅ Rebase merging: Enabled
- ❌ Delete head branches: Disabled

**Recommended for CI/CD workflow:**

```
✅ Allow squash merging (preferred for atomic commits)
✅ Allow rebase merging (for linear history)
❌ Allow merge commits (disabled - creates merge bubbles)
✅ Always suggest updating pull request branches
✅ Automatically delete head branches
```

**Rationale:**

- Squash merging keeps main branch history clean
- Rebase merging maintains linear history when needed
- Disabling merge commits prevents "merge bubble" history
- Auto-delete keeps branch list clean

### Pull Request Settings

- [ ] **Allow auto-merge**: Enable for faster merges after review
- [ ] **Automatically delete head branches**: Keep repository clean
- [ ] **Allow squash merging**: Preferred merge method
- [ ] **Allow rebase merging**: Secondary option
- [ ] **Allow merge commits**: Disable

### Branch Protection (main)

**Required:**

- [ ] **Require a pull request before merging**
  - Require approvals: 1
  - Dismiss stale PR approvals when new commits are pushed
  - Require review from Code Owners
  - Restrict who can dismiss PR reviews

- [ ] **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - Status checks that are required:
    - `Build Check`
    - `CI Summary`
    - `Lint & Format Check`
    - `TypeScript Check`
    - `Unit Tests`
    - `Validation Gates`
    - `Quality Gate`
    - `Secret Detection`
    - `Security Scan`
    - `CodeQL Analysis`

- [ ] **Require conversation resolution before merging**
- [ ] **Require signed commits** (optional)
- [ ] **Require linear history** (if using rebase merge)
- [ ] **Require deployments to succeed before merging**
  - `staging` environment

- [ ] **Lock branch**: No
- [ ] **Do not allow bypassing the above settings**: Yes
- [ ] **Restrict pushes that create files larger than 100 MiB**: Yes

### Tag Protection

- [ ] **Protect tags matching**: `v*`
  - Restrict creation: Write access
  - Restrict update: Admin access
  - Restrict deletion: Admin access

### Topics (Tags)

**Recommended topics to add:**

- `cloudflare-workers`
- `ai-agents`
- `deal-discovery`
- `typescript`
- `automation`
- `web-scraping`
- `serverless`
- `cloudflare`
- `kv-storage`
- `scheduled-jobs`

### Social Preview

- Add repository image for social sharing (Open Graph)

### Description

**Current:** None

**Recommended:**

```
Autonomous deal discovery system with coordinated AI agents.
Built on Cloudflare Workers with TypeScript, featuring two-phase
publishing (staging → production), 9 validation gates, and
intelligent deal scoring.
```

### Website

**Current:** None

**Recommended:** Set to Cloudflare Workers deployment URL once live:

```
https://do-deal-relay.your-subdomain.workers.dev
```

### Security

#### Code security and analysis

- [ ] **Private vulnerability reporting**: Enable
- [ ] **Dependabot alerts**: Enabled
- [ ] **Dependabot security updates**: Enabled
- [ ] **Secret scanning**: Enabled
- [ ] **Secret scanning push protection**: Enabled
- [ ] **Code scanning**: Enabled (CodeQL)

#### Access

- [ ] **Visibility**: Private (change to Public when ready for open source)
- [ ] **Collaborators**: Add team members
- [ ] **Outside collaborators**: Require approval

### Actions

#### General

- [ ] **Actions permissions**: Allow all actions and reusable workflows
- [ ] **Fork pull request workflows from outside collaborators**: Require approval
- [ ] **Workflow permissions**: Read and write permissions
- [ ] **GitHub Actions cache storage**: 10 GB default

#### Secrets

Set these in Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GITHUB_TOKEN` (auto-provided)

### Pages

- [ ] **Build and deployment**: Not configured (we use Cloudflare Workers, not Pages)

### Automation

#### GitHub Apps

Consider installing:

- **Probot Settings**: For declarative repository configuration (this file)
- **Renovate**: For automated dependency updates (alternative to Dependabot)
- **Mergify**: For advanced merge queue management

#### Webhooks

Configure for:

- Deployment notifications
- CI/CD status updates
- Slack/Discord integration

## How to Apply These Settings

### Manual Method

1. Go to: https://github.com/do-ops885/do-deal-relay/settings
2. Update each section according to this guide
3. For branch protection: Settings → Branches → Add rule

### Probot Settings Method (Recommended)

1. Install [Probot Settings](https://github.com/apps/settings) GitHub App
2. Push this `.github/settings.yml` file to main
3. Settings will be applied automatically

## Verification Checklist

After configuration, verify:

- [ ] PR requires review before merging
- [ ] Status checks block merging if failing
- [ ] Auto-merge is available on PRs
- [ ] Branches auto-delete after merge
- [ ] Topics display on repo homepage
- [ ] Description is set
- [ ] Security features are active
- [ ] Secrets are configured
- [ ] Branch protection rules are active

## CI/CD Integration

The repository is configured with 9 workflows:

- **ci.yml**: Main CI pipeline
- **security.yml**: Daily security scanning
- **deploy-staging.yml**: Automated staging deployment
- **deploy-production.yml**: Production deployment with rollback
- **discovery.yml**: Scheduled discovery runs
- **dependencies.yml**: Weekly dependency updates
- **cleanup.yml**: Monthly maintenance
- **kv-setup.yml**: Infrastructure setup
- **auto-merge.yml**: Dependabot PR automation

## See Also

- [Branch Protection Setup](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Repository Settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features)
- [Security Advisories](https://docs.github.com/en/code-security/security-advisories)
