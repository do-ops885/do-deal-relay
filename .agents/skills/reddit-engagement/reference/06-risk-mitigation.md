# Risk Mitigation

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


> Extracted from: ../SKILL.md
