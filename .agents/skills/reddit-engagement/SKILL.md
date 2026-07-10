---
name: reddit-engagement
description: Safe Reddit community engagement for AI projects. Use for analyzing communities, building karma, and strategic promotion while avoiding risky communities (anti-AI, hackers, criminals). Research-only mode - no posting without explicit authorization.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
  mode: "research-only"
  warning: "Never post without explicit user authorization"
---

# Reddit Engagement for AI Projects

Safe, strategic Reddit community engagement for promoting AI agent projects like do-deal-relay.

**⚠️ CRITICAL: This skill is RESEARCH-ONLY. Never post to Reddit without explicit user authorization.**

## Quick Start

```typescript
import { RedditEngagement } from "./reddit-engagement";

// Initialize research mode (never posts)
const reddit = new RedditEngagement({
  mode: "research", // "research" | "engagement" (requires auth)
  projectName: "do-deal-relay",
  projectType: "ai-agent",
});

// Research safe communities
const communities = await reddit.analyzeCommunities({
  topic: "ai-agents",
  riskThreshold: "low", // Exclude medium/high risk
});

// Get engagement strategy
const strategy = await reddit.buildEngagementStrategy({
  targetCommunities: communities.safe,
  timeline: "90-days",
});
```


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This is just a small change, no need for coordination." | Even small changes can have side effects. Structured coordination ensures nothing is missed. |
| "Writing an ADR/Plan takes too much time." | Investing time in planning saves significantly more time during execution and debugging. |
| "I can do this all in one go." | Breaking tasks down into atomic steps increases reliability and allows for better verification. |


## Red Flags

- [ ] Starting execution before a plan is approved.
- [ ] Making multiple unrelated changes in a single commit.
- [ ] Skipping validation gates or quality checks.
- [ ] Lack of coordination between parallel tasks leading to conflicts.
- [ ] Failing to update documentation after architectural changes.

## Reference

- [Core Concepts](reference/01-core-concepts.md)
- [Community Risk Assessment](reference/02-community-risk-assessment.md)
- [Research Mode](reference/03-research-mode.md)
- [Safe Engagement Strategy](reference/04-safe-engagement-strategy.md)
- [Content Strategy](reference/05-content-strategy.md)
- [Risk Mitigation](reference/06-risk-mitigation.md)
- [Posting Schedule](reference/07-posting-schedule.md)
- [Metrics to Track](reference/08-metrics-to-track.md)
- [Emergency Procedures](reference/09-emergency-procedures.md)
- [Best Practices](reference/10-best-practices.md)
- [Integration](reference/11-integration.md)
- [References](reference/12-references.md)
- [Summary](reference/13-summary.md)
