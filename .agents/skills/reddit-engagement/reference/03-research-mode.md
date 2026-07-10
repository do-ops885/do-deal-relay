# Research Mode

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


> Extracted from: ../SKILL.md
