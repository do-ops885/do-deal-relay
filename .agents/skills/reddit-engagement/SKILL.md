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

## Core Concepts

| Concept             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| **90/10 Rule**      | 9 non-promotional contributions for every 1 promotional     |
| **Karma Building**  | 100+ karma minimum before any promotion (500+ ideal)        |
| **Risk Assessment** | Analyze communities for anti-AI sentiment, malicious actors |
| **Value-First**     | Solve problems first, mention product as ONE solution       |
| **Research Mode**   | Always research before engaging - never post blindly        |

## Community Risk Assessment

### Safe Communities (🟢 Low Risk)

**AI Agent Specific:**

- r/AI_Agents (212K) - Purpose-built for AI agents
- r/AgentsOfAI (68K) - Developer-focused
- r/Build_AI_Agents (2.6K) - Agent development
- r/aiagents (51K) - AI agent discussions

**Technical:**

- r/artificial (1.1M) - Academic/professional
- r/LLMDevs (112K) - Developer-focused
- r/LocalLLaMA (541K) - Local deployment

**Project Showcase:**

- r/SideProject (453K) - Founder-friendly
- r/coolgithubprojects (60K) - Technical projects
- r/alphaandbetausers (22K) - Beta testing

### Communities to Avoid (🔴 High Risk)

**Anti-AI Sentiment:**

- Mainstream tech subs (r/technology) - often anti-AI in comments
- Creative communities (r/art, r/writing) - AI art concerns

**Security Risks:**

- Communities encouraging jailbreaking/exploits
- Low moderation communities with spam
- Any community with criminal activity coordination

**Caution Required (🟡 Medium Risk):**

- r/ChatGPT (11M) - High volume, strict rules
- r/ArtificialIntelligence (1.6M) - Low moderation, spam
- r/OpenAI (2.5M) - Anti-corporate sentiment

## Research Mode

**Always start with research:**

```typescript
// Phase 1: Community Analysis
const analysis = await reddit.researchCommunities({
  queries: ["AI agents", "deal discovery", "referral automation"],
  depth: "thorough",
});

// Risk assessment
for (const community of analysis.communities) {
  const risk = await reddit.assessRisk(community, {
    checkAntiAISentiment: true,
    checkMaliciousActors: true,
    checkModerationQuality: true,
    checkSpamLevel: true,
  });

  if (risk.level === "high") {
    console.log(`🚫 Avoid: ${community.name} - ${risk.reasons.join(", ")}`);
  } else if (risk.level === "medium") {
    console.log(`⚠️ Caution: ${community.name} - ${risk.reasons.join(", ")}`);
  } else {
    console.log(`✅ Safe: ${community.name}`);
  }
}
```

## Safe Engagement Strategy

### Phase 1: Foundation (Days 1-30)

**No promotional activity. Karma building only.**

```typescript
const phase1 = {
  activities: [
    "Create Reddit account (if new)",
    "Join 5-7 target subreddits",
    "Comment 5-10x daily on rising posts",
    "Answer questions, share expertise",
    "Build 100+ karma (target 500+)",
  ],
  rules: [
    "ZERO promotional activity",
    "Never mention your project",
    "Focus on helping others",
    "Understand community culture",
  ],
};
```

### Phase 2: Integration (Days 31-60)

**Community integration with minimal mentions.**

```typescript
const phase2 = {
  activities: [
    "Continue 5-10 value-add comments daily",
    "Add 1-2 value-first mentions weekly",
    "Participate in discussions",
    "Build relationships",
  ],
  ratio: "15:1 helpful-to-promotional",
};
```

### Phase 3: Strategic Promotion (Day 90+)

**Full promotion with established reputation.**

```typescript
const phase3 = {
  activities: [
    "Post in showcase threads",
    "Share case studies with data",
    "Create technical tutorials",
    "Respond to ALL comments within 2 hours",
  ],
  ratio: "9:1 non-promotional-to-promotional",
  requirements: {
    karma: 500,
    accountAge: "90+ days",
    commentsInTargetSubs: 50,
  },
};
```

## Content Strategy

### High-Performing Post Types

1. **Technical Tutorials**
   - "How I built X using Y"
   - Architecture explanations
   - Problem-solution deep dives

2. **Case Studies**
   - "How we increased [metric] by [%]"
   - Before/after comparisons
   - Specific metrics and results

3. **Personal Journey**
   - "I built X to solve Y"
   - Technical challenges overcome
   - Honest lessons learned

4. **Open Source Tools**
   - Free resources that drive awareness
   - Code examples and demos

### Effective Disclosure Templates

**Always disclose your affiliation:**

```
"Full disclosure: I built this tool to solve [problem]
after struggling with [pain point]. Happy to answer questions!"

"This is my product... [clear, honest statement]"

"Shameless plug, but... [humble approach]"
```

### Value-First Comment Pattern

```
When someone asks "How do you discover AI/tech deals?"

> "I've tried manual monitoring, RSS feeds, and now AI agents.
>
> Manual works but doesn't scale. RSS is good for news but misses signals.
>
> AI agents can monitor multiple sources and score opportunities.
> The trade-off is setup complexity and API costs.
>
> We built [do-deal-relay] specifically for this - it uses coordinated
> agents to watch multiple sources. Trade-off: requires Cloudflare setup.
>
> Happy to share more about the agent architecture if anyone's interested."
```

## Risk Mitigation

### Anti-AI Detection

```typescript
async function detectAntiAISentiment(subreddit: string): Promise<Risk> {
  const indicators = [
    "Frequent 'AI is overhyped' discussions",
    "Downvoting of AI-related posts",
    "Job displacement fear discussions",
    "Creative community concerns about AI art",
  ];

  // Analyze recent posts and comments
  const recentContent = await fetchRecentContent(subreddit, 100);
  const sentiment = analyzeSentiment(recentContent, "anti-AI");

  return {
    level:
      sentiment.score > 0.7 ? "high" : sentiment.score > 0.3 ? "medium" : "low",
    indicators: sentiment.matches,
  };
}
```

### Malicious Actor Detection

```typescript
async function detectMaliciousActivity(subreddit: string): Promise<Risk> {
  const redFlags = [
    "Discussions of jailbreaking/bypassing safety",
    "Coordination of bot spam",
    "Requests for exploits or vulnerabilities",
    "Criminal activity discussions",
  ];

  const analysis = await analyzeCommunityContent(subreddit, redFlags);

  return {
    level: analysis.matches.length > 0 ? "high" : "low",
    redFlags: analysis.matches,
  };
}
```

### Pre-Posting Checklist

**Before ANY promotional activity:**

- [ ] Account is 90+ days old
- [ ] 500+ karma achieved
- [ ] 50+ meaningful comments in target subreddit
- [ ] Read and understood subreddit rules
- [ ] Risk assessment completed (anti-AI, malicious actors)
- [ ] Demo video/content prepared
- [ ] Disclosure statement ready
- [ ] UTM tracking configured
- [ ] Response plan (will reply to ALL comments)

## Posting Schedule

### Optimal Timing

- **Best Days:** Tuesday-Thursday
- **Best Time:** 6-8 AM EST
- **Critical First 2 Hours:** Respond to EVERY comment
- **Active Engagement:** 67% more upvotes with creator participation

### Cross-Posting Strategy

```typescript
const safeCrossPosting = {
  maxCommunities: 3,
  spacing: "2-4 hours between posts",
  customization: "Customize title for each community",
  never: "Copy-paste same content",

  schedule: [
    {
      time: "Day 1 8 AM",
      community: "r/AI_Agents",
      angle: "Agent architecture",
    },
    {
      time: "Day 1 2 PM",
      community: "r/SideProject",
      angle: "Founder journey",
    },
    {
      time: "Day 2 10 AM",
      community: "r/coolgithubprojects",
      angle: "Technical implementation",
    },
  ],
};
```

## Metrics to Track

```typescript
interface EngagementMetrics {
  // Karma growth
  totalKarma: number;
  commentKarma: number;
  linkKarma: number;

  // Engagement rates
  commentsToUpvoteRatio: number; // Target > 0.05
  clickThroughRate: number; // 2.1% average, 8.3% top 10%
  conversionRate: number; // 1.2% average, 4.7% top 10%

  // Community health
  responseRate: number; // % of comments you respond to
  positiveSentiment: number; // % positive responses

  // Warning signs
  downvoteRatio: number; // Watch for > 20%
  removalRate: number; // Posts removed by mods
}
```

## Emergency Procedures

### If Account Gets Shadowbanned

```typescript
const recoveryPlan = {
  detection: [
    "Posts not appearing in r/new",
    "Comments invisible to others",
    "Check r/ShadowBan",
  ],
  immediate: [
    "Stop all promotional activity",
    "Contact Reddit support",
    "Review recent posts for rule violations",
  ],
  prevention: [
    "Never use multiple accounts",
    "Never manipulate votes",
    "Maintain 9:1 ratio strictly",
  ],
};
```

### If Receiving Negative Feedback

1. **Acknowledge immediately**
2. **Ask clarifying questions**
3. **Offer solutions or explanations**
4. **Never argue or become defensive**
5. **Take detailed feedback to improve**

## Best Practices

### DO:

✓ Research communities thoroughly before engaging  
✓ Build karma and reputation first (30+ days minimum)  
✓ Provide value before promotion (9:1 ratio minimum)  
✓ Always disclose your affiliation  
✓ Respond to all comments within 2 hours  
✓ Customize content for each community  
✓ Focus on problem-solving, not product features  
✓ Be humble and transparent about limitations

### DON'T:

✗ Post without explicit user authorization  
✗ Engage with anti-AI or toxic communities  
✗ Post in communities with poor moderation  
✗ Ignore the 90/10 rule  
✗ Copy-paste content across communities  
✗ Get defensive about criticism  
✗ Post without understanding community culture  
✗ Use clickbait or misleading titles

## Integration

### With web-search-researcher

```typescript
// Research communities before engaging
skill web-search-researcher
query: "r/AI_Agents community quality reviews"
output: temp/reddit-community-research.md

// Analyze findings
skill reddit-engagement
research: temp/reddit-community-research.md
riskThreshold: "low"
output: temp/safe-communities.json
```

### With self-learning-feedback

```typescript
// Review engagement effectiveness
skill self-learning-feedback
analyze: temp/reddit-engagement-results.md
criteria: ["karma_growth", "sentiment", "conversion"]
lesson: "What worked and what didn't"
```

## References

- **Full Community Analysis:** [temp/reddit-ai-communities-analysis.md](../../../temp/reddit-ai-communities-analysis.md)
- **Reddit Site Rules:** https://www.reddit.com/rules/
- **Self-Promotion Guidelines:** https://www.reddit.com/wiki/selfpromotion
- **Reddit Marketing Stats:** Pew Research 2024, HubSpot 2025

## Summary

**Key Success Factors:**

1. **Research first** - Never post blindly
2. **Build reputation** - 30+ days, 500+ karma
3. **Value-first** - 9:1 non-promotional ratio
4. **Safe communities** - Avoid anti-AI, malicious actors
5. **Active engagement** - Respond to all comments
6. **Full disclosure** - Always state affiliation

**Remember: This skill is RESEARCH-ONLY. Never post without explicit authorization.**

For complete community analysis and risk assessment, see `temp/reddit-ai-communities-analysis.md`.
