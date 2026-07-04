---
name: agentic-abstention
description: Use this skill when you encounter environment-revealed infeasibility or external blockers that prevent task completion. It provides stopping rules and a protocol for documenting the state and requirements for resumption.
license: MIT
---

# Agentic Abstention

Protocol for graceful stopping when a task becomes impossible to complete due to environmental factors, missing credentials, or external dependencies.

## Stopping Rules

Abstain immediately if any of the following conditions are met:

1.  **Missing Credentials**: Task requires secret keys, tokens, or environment variables that are not present and cannot be generated autonomously.
2.  **External Service Downtime**: Required external APIs or services are unreachable or returning persistent errors (after retries).
3.  **Ambiguous Requirements**: Multiple valid interpretations exist, and the decision has significant architectural or product impact (and the user is not responding).
4.  **Resource Exhaustion**: The task requires significantly more resources (tokens, time, tools) than allowed by system constraints.
5.  **Capability Gap**: The task requires a specific capability or tool that is explicitly missing from the current environment.

## Abstention Protocol

1.  **Identify Signal**: Note the specific error, missing file, or environmental cue that triggered the stopping rule.
2.  **Document State**:
    -   Create an ADR in `plans/` (e.g., `plans/ABSTAIN-ADR-XXX.md`) documenting the root cause.
    -   Update `plans/GOAP_STATE.md` marking the task as `blocked`.
3.  **Provide Resume Hint**: Clearly state what needs to happen for the task to be unblocked (e.g., "User must provide CLOUDFLARE_API_TOKEN").
4.  **Log Metrics**: Follow the Post-Task Protocol with `abstained: true`.

## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "I should keep trying different approaches." | If the environment is fundamentally missing a requirement, trying different code approaches is wasteful and may lead to hallucination. |
| "Abstaining looks like failure." | Graceful abstention is a mark of a high-reliability agent. It prevents "flailing" and provides clear signals to human operators. |

## Red Flags

- [ ] Abstaining without documenting the specific environmental blocker.
- [ ] Abstaining for a task that *can* be solved by better planning or tool use.
- [ ] Failing to update metrics with the abstention reason.
