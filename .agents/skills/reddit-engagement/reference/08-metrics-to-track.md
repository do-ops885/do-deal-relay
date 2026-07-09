# Metrics to Track

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


> Extracted from: ../SKILL.md
