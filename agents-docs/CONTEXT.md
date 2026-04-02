# Context Management and Back-Pressure

**System**: Deal Discovery Relay Worker
**Version**: 0.1.2
\*\*Last Updated\*\*: 2026-04-01

This guide covers context window management, back-pressure patterns, and strategies for handling large inputs in the deal discovery system.

## Context Window Overview

AI agents have finite context windows. Effective management is critical for handling large discovery pipelines.

| Agent  | Context Window | Optimal Use                           |
| ------ | -------------- | ------------------------------------- |
| Claude | 200K tokens    | Complex code, multi-file coordination |
| Gemini | 1M tokens      | Large document analysis, research     |
| Qwen   | 128K tokens    | Focused TS/JS tasks, validation       |

## Token Budgeting

### Budget Allocation

For a 200K context window:

| Category        | Tokens | Percentage | Purpose                     |
| --------------- | ------ | ---------- | --------------------------- |
| System prompt   | 2K     | 1%         | Agent identity, constraints |
| AGENTS.md       | 3K     | 1.5%       | Coordination protocol       |
| Skill content   | 10K    | 5%         | Loaded skills               |
| Handoff context | 5K     | 2.5%       | Previous agent outputs      |
| Source files    | 100K   | 50%        | Code being modified         |
| Output buffer   | 80K    | 40%        | Response generation         |

### Dynamic Adjustment

```typescript
interface ContextBudget {
  total: number;
  used: number;
  reserved: number;
  available: number;
}

function calculateBudget(files: File[]): ContextBudget {
  const fileTokens = files.reduce(
    (sum, f) => sum + estimateTokens(f.content),
    0,
  );
  const systemOverhead = 15000; // Base overhead

  return {
    total: 200000,
    used: fileTokens + systemOverhead,
    reserved: 80000, // For output
    available: 200000 - fileTokens - systemOverhead - 80000,
  };
}
```

## Back-Pressure Patterns

### Pattern 1: Chunking

Break large tasks into manageable chunks:

```
Large Input (10,000 deals)
├─→ Chunk 1 (Deals 1-100)
│   └─→ Process
├─→ Chunk 2 (Deals 101-200)
│   └─→ Process
├─→ Chunk 3 (Deals 201-300)
│   └─→ Process
└─→ ... (continue)
```

**Implementation**:

```typescript
async function processChunked<T>(
  items: T[],
  chunkSize: number,
  processor: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await processor(chunk);

    // Log progress
    console.log(`Processed ${i + chunk.length}/${items.length}`);
  }
}

// Usage
await processChunked(deals, 100, async (chunk) => {
  await validateChunk(chunk);
  await saveResults(chunk);
});
```

### Pattern 2: Pagination

For streaming or API-based processing:

```typescript
interface PaginationConfig {
  pageSize: number;
  maxPages: number;
  cursor?: string;
}

async function* paginatedDiscovery(
  config: PaginationConfig,
): AsyncGenerator<Deal[]> {
  let cursor = config.cursor;
  let pages = 0;

  while (pages < config.maxPages) {
    const result = await fetchDeals({
      limit: config.pageSize,
      cursor,
    });

    if (result.deals.length === 0) break;

    yield result.deals;
    cursor = result.nextCursor;
    pages++;

    // Back-pressure: pause between pages
    if (pages < config.maxPages) {
      await sleep(100);
    }
  }
}

// Usage
for await (const deals of paginatedDiscovery({ pageSize: 50, maxPages: 20 })) {
  await processDeals(deals);
}
```

### Pattern 3: Windowing

Sliding window for time-series or sequential data:

```typescript
interface WindowConfig {
  size: number;
  overlap: number; // Tokens to overlap between windows
}

function* slidingWindows<T>(items: T[], config: WindowConfig): Generator<T[]> {
  const step = config.size - config.overlap;

  for (let i = 0; i < items.length; i += step) {
    yield items.slice(i, i + config.size);
  }
}

// Usage: Process deals with context overlap
for (const window of slidingWindows(deals, { size: 100, overlap: 10 })) {
  // Last 10 deals from previous window provide context
  await analyzeWithContext(window);
}
```

### Pattern 4: Streaming

Process data as it arrives, maintaining bounded buffers:

```typescript
interface StreamConfig {
  highWaterMark: number; // Max buffered items
  lowWaterMark: number; // Resume threshold
}

class DealStream {
  private buffer: Deal[] = [];
  private paused = false;

  constructor(private config: StreamConfig) {}

  async write(deal: Deal): Promise<void> {
    if (this.buffer.length >= this.config.highWaterMark) {
      this.paused = true;
      await this.drain();
    }

    this.buffer.push(deal);
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > this.config.lowWaterMark) {
      const batch = this.buffer.splice(0, 10);
      await processBatch(batch);
    }
    this.paused = false;
  }
}
```

## File Size Management

### Large File Handling

When files exceed safe thresholds:

| File Size     | Action                      |
| ------------- | --------------------------- |
| <100 lines    | Include full content        |
| 100-500 lines | Include with summary header |
| >500 lines    | Split into focused files    |

### Progressive File Loading

```typescript
async function loadFilesForTask(
  task: Task,
  budget: ContextBudget,
): Promise<File[]> {
  const files: File[] = [];
  let usedTokens = 0;

  // Priority 1: Essential files (always include)
  for (const path of task.essentialFiles) {
    const file = await loadFile(path);
    const tokens = estimateTokens(file.content);

    if (usedTokens + tokens > budget.available * 0.8) {
      // Include summary instead
      files.push(await loadSummary(path));
    } else {
      files.push(file);
      usedTokens += tokens;
    }
  }

  // Priority 2: Context files (include if space)
  for (const path of task.contextFiles) {
    const tokens = estimateTokens(await readFile(path));

    if (usedTokens + tokens < budget.available * 0.95) {
      files.push(await loadFile(path));
      usedTokens += tokens;
    }
  }

  return files;
}
```

### Summarization Strategy

When full content doesn't fit, provide summaries:

```typescript
interface FileSummary {
  path: string;
  purpose: string;
  exports: string[];
  dependencies: string[];
  keyFunctions: Array<{ name: string; purpose: string }>;
}

function createSummary(file: File): FileSummary {
  return {
    path: file.path,
    purpose: extractPurpose(file.content),
    exports: extractExports(file.content),
    dependencies: extractImports(file.content),
    keyFunctions: extractFunctions(file.content).map((f) => ({
      name: f.name,
      purpose: extractJsDoc(f),
    })),
  };
}

// Summary format (compact)
const summaryTemplate = (s: FileSummary) => `
## ${s.path}
**Purpose**: ${s.purpose}
**Exports**: ${s.exports.join(", ")}
**Key Functions**:
${s.keyFunctions.map((f) => `- ${f.name}: ${f.purpose}`).join("\n")}
`;
```

## Context Pruning

### Selective Loading

Load only what's needed for the current task:

```typescript
const filePriorities: Record<string, string[]> = {
  discovery: [
    "worker/pipeline/discover.ts",
    "worker/lib/sources.ts",
    "worker/types.ts",
  ],
  validation: [
    "worker/pipeline/validate.ts",
    "worker/lib/validation.ts",
    "worker/types.ts",
  ],
  scoring: [
    "worker/pipeline/score.ts",
    "worker/lib/scoring.ts",
    "worker/types.ts",
  ],
};

function getRelevantFiles(task: string): string[] {
  return filePriorities[task] || [];
}
```

### Skill Lazy Loading

Don't load all skills upfront:

```typescript
class SkillManager {
  private loadedSkills: Set<string> = new Set();

  async load(skill: string): Promise<void> {
    if (this.loadedSkills.has(skill)) return;

    const skillContent = await fetchSkill(skill);
    const tokens = estimateTokens(skillContent);

    if (this.getUsedTokens() + tokens > this.budget.skillLimit) {
      // Unload least recently used skill
      this.unloadLRU();
    }

    this.loadedSkills.add(skill);
    this.activeSkills.set(skill, skillContent);
  }

  unloadLRU(): void {
    const lru = this.skillLRU.shift();
    if (lru) {
      this.loadedSkills.delete(lru);
      this.activeSkills.delete(lru);
    }
  }
}
```

### Conversation Truncation

For long-running conversations:

```typescript
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  importance: number; // 1-10, for pruning decisions
  timestamp: number;
}

function pruneConversation(messages: Message[], maxTokens: number): Message[] {
  // Always keep system message
  const systemMessages = messages.filter((m) => m.role === "system");

  // Sort by importance (desc), then recency (desc)
  const otherMessages = messages
    .filter((m) => m.role !== "system")
    .sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance;
      }
      return b.timestamp - a.timestamp;
    });

  // Keep messages until budget exhausted
  const pruned: Message[] = [...systemMessages];
  let usedTokens = countTokens(systemMessages);

  for (const msg of otherMessages) {
    const msgTokens = estimateTokens(msg.content);
    if (usedTokens + msgTokens > maxTokens) break;

    pruned.push(msg);
    usedTokens += msgTokens;
  }

  // Re-sort by timestamp for output
  return pruned.sort((a, b) => a.timestamp - b.timestamp);
}
```

## Monitoring and Alerts

### Token Usage Tracking

```typescript
class ContextMonitor {
  private usage: number[] = [];

  recordUsage(tokens: number): void {
    this.usage.push(tokens);

    // Alert if approaching limit
    if (tokens > 180000) {
      // 90% of 200K
      console.warn(`⚠️ High context usage: ${tokens} tokens`);
    }

    // Alert if consistently high
    const recent = this.usage.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avg > 150000) {
      console.warn(`⚠️ Sustained high context usage: ${avg.toFixed(0)} avg`);
    }
  }
}
```

### Adaptive Throttling

```typescript
class AdaptiveThrottler {
  private tokenRate: number = 0;
  private lastCheck: number = Date.now();

  async throttleIfNeeded(tokens: number): Promise<void> {
    this.tokenRate = this.tokenRate * 0.9 + tokens * 0.1;

    // If rate is high, add delays
    if (this.tokenRate > 50000) {
      const delay = Math.min(5000, (this.tokenRate - 50000) / 10);
      await sleep(delay);
    }
  }
}
```

## Best Practices

### 1. Measure First

```bash
# Estimate file sizes
wc -l worker/**/*.ts

# Estimate skill sizes
wc -l .agents/skills/*/*.md
```

### 2. Set Limits

```typescript
const CONTEXT_LIMITS = {
  maxFileLines: 500,
  maxFilesPerTask: 10,
  maxSkillsLoaded: 5,
  maxChunkSize: 100,
  outputBuffer: 80000,
};
```

### 3. Fail Gracefully

```typescript
function loadFileSafely(path: string): File | Summary {
  try {
    const content = readFile(path);
    const lines = content.split("\n").length;

    if (lines > CONTEXT_LIMITS.maxFileLines) {
      return createSummary({ path, content });
    }

    return { path, content };
  } catch (error) {
    return { path, error: "Failed to load", summary: true };
  }
}
```

### 4. Use Streaming for Large Outputs

```typescript
async function* streamLargeOutput(
  generator: () => AsyncIterable<string>,
): AsyncIterable<string> {
  let buffer = "";

  for await (const chunk of generator()) {
    buffer += chunk;

    // Yield complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line

    for (const line of lines) {
      yield line + "\n";
    }
  }

  if (buffer) yield buffer;
}
```

## Quick Reference

### Token Estimation

```typescript
// Rough estimation (4 chars ≈ 1 token for English)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// More accurate for code (3 chars ≈ 1 token)
function estimateCodeTokens(code: string): number {
  return Math.ceil(code.length / 3);
}
```

### File Size Guidelines

| Lines   | Strategy                   |
| ------- | -------------------------- |
| <100    | Full content               |
| 100-300 | Full + structure comment   |
| 300-500 | Summary + key functions    |
| >500    | Summary only, link to file |

### Context Checklist

- [ ] Measured file sizes before loading
- [ ] Set token budget for task
- [ ] Included only essential files
- [ ] Used summaries for large files
- [ ] Lazy-loaded skills as needed
- [ ] Left 40% buffer for output
- [ ] Monitored usage during execution
- [ ] Implemented chunking for large inputs

## Emergency Procedures

### Context Overflow Recovery

```bash
# 1. Check current context size
cat temp/current-context.md | wc -c

# 2. Clear non-essential files
rm temp/analysis-*.md
rm temp/research-*.md

# 3. Create minimal handoff
cat > temp/handoff-minimal.md << 'EOF'
# Minimal Handoff
**Status**: context-overflow-recovery
**Next**: Focus on core task only
**Files**: See AGENTS.md for essential files
EOF

# 4. Restart with sub-agent
# Delegate to focused sub-agent with minimal context
```

### Quick Context Reduction

```typescript
// Emergency context reduction
function emergencyReduce(files: File[]): File[] {
  return files
    .filter((f) => f.priority === "essential")
    .map((f) => (f.lines > 200 ? createSummary(f) : f));
}
```

## Related Documentation

- [HARNESS.md](./HARNESS.md) - System overview
- [SUB-AGENTS.md](./SUB-AGENTS.md) - Context isolation patterns
- `agents-docs/coordination/handoff-log.jsonl` - Usage tracking
