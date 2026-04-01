# Automation Patterns

## Scheduled Research

```javascript
// research-scheduler.js
const SOURCES = [
  { name: "ProductHunt", cron: "0 9 * * *", query: "top 10 today" },
  { name: "GitHub", cron: "0 10 * * 1", query: "trending this week" },
  { name: "HackerNews", cron: "0 */6 * * *", query: "show hn score>50" },
];

async function runScheduledResearch() {
  for (const source of SOURCES) {
    const signals = await fetchSignals(source);
    for (const signal of signals) {
      await queueResearch(signal);
    }
  }
}
```

## Research Queue (Durable Object)

```javascript
export class ResearchQueue {
  async fetch(request) {
    const task = await this.getNextTask();
    const research = await conductResearch({
      query: task.company,
      depth: task.priority === "high" ? "thorough" : "quick",
      context: task.signal_source,
    });
    await this.saveResults(task.id, research);
    await this.notifyScorer(task.id);
  }
}
```

## Research-to-Deal Pipeline

```
Signal → Research → Validation → Deal Score
   ↓         ↓           ↓            ↓
ProductHunt  Company   Funding     8.5/10
Trending     info      verify      Priority: High
```

## Batch Research

```bash
# Batch from signals file
npm run research:batch -- --input=./signals/this-week.json

# Results saved to:
# temp/research/YYYY-MM-DD-{company}.md
# deals/active/{company}.md
```

## Integration Flow

```
1. WebSocket receives signal spike
2. Signal Extractor creates JSON
3. Research Agent loads skill
4. Web search conducted
5. Output saved to markdown
6. Validation Agent cross-references
7. Deal Scorer calculates
8. Notifier sends high-score deals
```
