---
name: setup-coverage
description: Sets up test coverage reporting in a repository and configures upload to Codacy. Detects testing frameworks, CI/CD pipelines, and coverage gaps, then adds the missing pieces to generate and upload coverage reports. Use whenever the user wants to set up coverage, add coverage reporting, integrate coverage with Codacy, fix missing coverage uploads, troubleshoot coverage not showing up, or configure CI to send coverage data. Also trigger when the user mentions test coverage, code coverage, coverage reports, or wants to know why Codacy shows no coverage for their repo.
license: MIT
metadata:
  author: Codacy
  version: 1.2.0
---

# Setup Coverage

> **Glossary:** See [glossary.md](../../../agents-docs/references/glossary.md) for shared definitions of Codacy concepts (issues, findings, severity, coverage, tools, patterns, etc.).

This skill sets up test coverage reporting in a repository and configures automatic upload to Codacy. It detects what exists, identifies what is missing, and fills the gaps.

## Prerequisites

- `CODACY_PROJECT_TOKEN` or `CODACY_API_TOKEN` must be available for coverage uploads (see [Authentication](#authentication))
- The repository must be added to Codacy

## Workflow

```
Coverage Setup Progress:
- [ ] Step 1: Detect testing setup
- [ ] Step 2: Detect CI/CD pipeline
- [ ] Step 3: Identify coverage gaps
- [ ] Step 4: Add coverage generation
- [ ] Step 5: Add Codacy coverage upload
- [ ] Step 6: Verify the setup
```

### Step 1: Detect testing setup

Scan the repository to identify:

- **Languages** in use (check file extensions, build files, package manifests)
- **Test frameworks** (look for test directories, test files, framework configs):
  - JavaScript/TypeScript: Jest, Vitest, Mocha, NYC/Istanbul, c8
  - Python: pytest, unittest, coverage.py
  - Java: JUnit, JaCoCo, Maven Surefire/Failsafe
  - Kotlin: JUnit, JaCoCo (Gradle or Maven)
  - Android: JUnit, JaCoCo, Espresso, `createDebugCoverageReport`
  - Go: native `go test`
  - Ruby: RSpec, SimpleCov, Minitest
  - C#/.NET: xUnit, NUnit, MSTest, Coverlet, dotCover
  - Scala: sbt-jacoco, scoverage
  - PHP: PHPUnit
  - Swift/Obj-C: XCTest, Xcode Code Coverage
- **Existing coverage configuration** (NYC config, Jest `collectCoverage`, `pytest.ini` coverage settings, JaCoCo plugin in pom.xml/build.gradle, etc.)
- **Existing coverage reports** (look for `coverage/`, `lcov.info`, `cobertura.xml`, `jacoco*.xml`, etc.)

Report findings to the user before proceeding.

### Step 2: Detect CI/CD pipeline

Identify which CI/CD system is in use:

| CI/CD | Detection files |
|-------|-----------------|
| GitHub Actions | `.github/workflows/*.yml` |
| GitLab CI | `.gitlab-ci.yml` |
| CircleCI | `.circleci/config.yml` |
| Travis CI | `.travis.yml` |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` |
| Jenkins | `Jenkinsfile` |
| Azure DevOps | `azure-pipelines.yml` |

Read the CI config to understand:

- Which step runs tests
- Whether coverage is already being generated
- Whether there is already a coverage upload step
- What environment variables or secrets are configured

### Step 3: Identify coverage gaps

Based on steps 1 and 2, determine what is missing:

1. **No tests at all** — inform the user that tests are needed first. Offer to set up the testing framework skeleton but clarify that actual tests must be written.
2. **Tests exist but no coverage generation** — coverage tooling needs to be added (Step 4).
3. **Coverage is generated but not uploaded to Codacy** — upload step needs to be added (Step 5).
4. **Coverage is generated and uploaded but not working** — troubleshoot using the [Troubleshooting](#troubleshooting) section.

Present the gap analysis to the user and confirm the plan before making changes.

### Step 4: Add coverage generation

See [reference/01-add-coverage-generation.md](reference/01-add-coverage-generation.md)

### Step 5: Add Codacy coverage upload

See [reference/02-add-codacy-coverage-upload.md](reference/02-add-codacy-coverage-upload.md)

### Step 6: Verify the setup

After making changes:

1. **Confirm the CI config is valid** — check for YAML syntax errors and logical issues
2. **List what the user needs to do manually:**
   - Add `CODACY_PROJECT_TOKEN` (or account token variables) as a CI/CD secret
   - Push the changes to trigger a CI run
   - Check Codacy for coverage data after the pipeline completes
3. **Provide a verification checklist:**

```
After pushing, verify:
- [ ] CI pipeline passes (tests run, coverage report generated)
- [ ] Coverage upload step succeeds (no errors in CI logs)
- [ ] Codacy shows coverage data for the commit
```

## Troubleshooting

Common issues and their solutions:

| Status | Cause | Fix |
|--------|-------|-----|
| **Commit Not Found** | Webhook not received or wrong commit SHA | Wait 5-10 min; verify the commit SHA matches |
| **Pending** | File paths in report don't match repo structure | Ensure paths are relative to repo root (e.g., `src/index.js`, not `/home/ci/project/src/index.js`) |
| **Final Report Not Sent** | Used `--partial` without `final` | Add `bash <(curl -Ls https://coverage.codacy.com/get.sh) final` after all partial uploads |
| **Branch Not Enabled** | Coverage uploaded for unanalyzed branch | Enable the branch in Codacy repository settings |
| **No coverage shown on PRs** | Missing coverage for common ancestor commit | Ensure coverage runs on all branches, not just PRs |

## Important notes

- Coverage must be uploaded for **every push** to be useful for PR analysis — configure it to run on all branches, not just main
- For PR coverage metrics, Codacy needs coverage for both the PR head commit **and** the common ancestor commit with the target branch
- File paths in coverage reports must be **relative to the repository root**
- Coverage for multiple languages requires separate `-l <Language>` flags or partial uploads with language specification

## Rationalizations

- Skills imported from codacy/codacy-skills open-source repository
- Cross-skill references use relative paths to shared glossary
- All tools documented with CLI flags and JSON output for agent workflows

## Red Flags

- Requires Codacy API token for Cloud operations
- Local analysis may differ from Cloud analysis results
- Tool availability depends on machine dependencies (Docker, language runtimes)

