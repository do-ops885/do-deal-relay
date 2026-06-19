# GOAP: Coding Workflow Improvements from Template Analysis

**Date**: 2026-06-09
**Source**: https://github.com/d-o-hub/github-template-ai-agents
**Status**: COMPLETED

## Task Analysis

**Primary Goal**: Adapt proven coding workflow improvements from the template into do-deal-relay
**Constraints**: Must not break existing functionality, must follow existing conventions
**Complexity**: Medium (5 parallel workstreams)

## Improvements Identified

| # | Improvement | Value | Effort |
|---|-------------|-------|--------|
| 1 | CI Status Artifacts | Agents check CI before proposing changes | Medium |
| 2 | Enhanced Quality Gate (drift detection, LOC limits) | Catches regressions earlier | Medium |
| 3 | Back-pressure patterns | Structured verification priority | Low |
| 4 | Enhanced post-task metrics | Better observability | Low |
| 5 | Delegation routing rules | Clearer agent coordination | Low |

## Decomposition

### Sub-Goals

1. **CI Status Script** - Priority: P0, Deps: none
   - Create `scripts/update-ci-status.sh` that writes `.github/ci-status/ci-status.json`
   - Create `scripts/check-ci-status.sh` for agents to verify CI state

2. **Quality Gate Enhancements** - Priority: P0, Deps: none
   - Add drift detection (check CI status before changes)
   - Add LOC enforcement gate
   - Add ADR compliance check integration

3. **AGENTS.md Enrichment** - Priority: P1, Deps: 1,2
   - Add delegation routing rules
   - Add back-pressure priority order
   - Enhance post-task protocol with richer metrics

4. **Sub-Agent Definitions** - Priority: P1, Deps: 3
   - Create `.opencode/agents/` with specialized sub-agent definitions
   - code-reviewer, test-runner, research-agent

5. **Context Hygiene Skill** - Priority: P2, Deps: 3
   - Create skill for context management patterns

## Execution Plan

- **Strategy**: Parallel (P0 tasks independent), then Sequential (P1 depends on P0)
- **Quality Gates**: 2 checkpoints

### Phase 1: Parallel (3 agents)
- Agent A: CI Status artifacts (script + format)
- Agent B: Quality Gate enhancements
- Agent C: AGENTS.md enrichment + delegation routing

### Phase 2: Sequential
- Agent D: Sub-agent definitions (depends on AGENTS.md)
- Agent E: Context hygiene skill (depends on AGENTS.md)

### Phase 3: Validation
- Run quality gate
- Verify all scripts are executable
- Check AGENTS.md under 200 lines
