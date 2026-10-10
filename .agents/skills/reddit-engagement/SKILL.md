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
| "The subreddit is about AI agents, so a promo post will land without a risk check." | `analyzeCommunities` runs with `riskThreshold: "low"` first; `reference/02-community-risk-assessment.md` still marks r/ChatGPT and r/ArtificialIntelligence as medium risk. |
| "Replying in a thread is not a post, so the research-only rule does not apply." | The skill ships `mode: "research"` and its metadata forbids posting without explicit authorization; a comment reply is an engagement action too. |
| "The account has enough karma, so the pre-posting checklist is done." | `reference/06-risk-mitigation.md` requires 90+ days of account age and 50+ comments in the target subreddit, not a karma number alone. |
| "The demo link explains everything, so no AI disclosure is needed." | The pre-posting checklist requires a disclosure statement and a reply plan before any promotional activity. |

## Red Flags

- [ ] A subreddit is added to the target list without the anti-AI and malicious-actor scans from `reference/06-risk-mitigation.md`.
- [ ] A post or comment is drafted for r/SideProject or r/AI_Agents while `mode` is still `research`.
- [ ] Account age, karma, or prior comments in the target subreddit are assumed rather than verified.
- [ ] A promo goes out without the AI disclosure statement or a plan to answer replies.
- [ ] A medium-risk community is reclassified as low so it stays in scope.

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
