# Context Management and Back-Pressure

**Reference doc** - loaded on demand, not by default.

> Systematically managing what enters the context window to maximize reliability and minimize cost.

## Context Window Overview

AI agents have finite context windows. Effective management is critical for handling large tasks.

| Agent | Context Window | Optimal Use |
|-------|---------------|-------------|
| Claude | 200K tokens | Complex code, multi-file coordination |
| Gemini | 1M tokens | Large document analysis, research |
| Qwen | 128K tokens | Focused TS/JS tasks, validation |

## Token Budgeting

### Budget Allocation

For a 200K context window:

| Category | Tokens | Percentage | Purpose |
|----------|--------|------------|---------|
| System prompt | 2K | 1% | Agent identity, constraints |
| AGENTS.md | 3K | 1.5% | Coordination protocol |
| Skill content | 10K | 5% | Loaded skills |
| Handoff context | 5K | 2.5% | Previous agent outputs |
| Source files | 100K | 50% | Code being modified |
| Output buffer | 80K | 40% | Response generation |

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
Large Input (10,000 items)
├─→ Chunk 1 (Items 1-100)
│   └─→ Process
├─→ Chunk 2 (Items 101-200)
│   └─→ Process
├─→ Chunk 3 (Items 201-300)
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
  overlap: number; // Items to overlap between windows
}

function* slidingWindows<T>(items: T[], config: WindowConfig): Generator<T[]> {
  const step = config.size - config.overlap;

  for (let i = 0; i < items.length; i += step) {
    yield items.slice(i, i + config.size);
  }
}

// Usage: Process items with context overlap
for (const window of slidingWindows(items, { size: 100, overlap: 10 })) {
  // Last 10 items from previous window provide context
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

class ItemStream {
  private buffer: Item[] = [];
  private paused = false;

  constructor(private config: StreamConfig) {}

  async write(item: Item): Promise<void> {
    if (this.buffer.length >= this.config.highWaterMark) {
      this.paused = true;
      await this.drain();
    }

    this.buffer.push(item);
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

| File Size | Action |
|-----------|--------|
| <100 lines | Include full content |
| 100-500 lines | Include with summary header |
| >500 lines | Split into focused files |

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

## Context Hygiene

- `/clear` between unrelated tasks
- `Glob`/`Grep` instead of reading whole files
- Sub-agents for research (noise stays in their window)
- Load skills progressively - not at session start
- Prefer CLI tools over MCP servers for well-known services

## Skills Architecture (Progressive Disclosure)

```
AGENTS.md (concise, universal)
  +-- agents-docs/ (detailed reference, loaded on demand)
       +-- Skills with SKILL.md (loaded when agent needs them)
            +-- reference/ within each skill (read only what is needed)
```

All skills are canonical in `.agents/skills/`.
Claude Code, Gemini CLI, and Qwen Code use symlinks (`.claude/skills/`, `.gemini/skills/`, `.qwen/skills/`);
OpenCode reads directly from `.agents/skills/`.
Run `./scripts/setup-skills.sh` to create symlinks for Claude Code, Gemini CLI, and Qwen Code.

## Back-Pressure Priority Order

Implement from top down:

1. **Typechecks / build** - fast, deterministic, catches structural errors instantly
2. **Unit tests** - validates logic
3. **Integration tests** - validates system behavior
4. **Lint / format** - enforces style
5. **Coverage reporting** - surface drops via hook
6. **UI/browser testing** - Playwright, agent-browser

**Critical:** All verification must be context-efficient.
Swallow passing output - surface only failures.

## Anti-Patterns

- Running the full test suite after every change
- Reading large file trees into context
- Installing many MCP servers just in case
- One very long session for a multi-day project
- Using larger context windows as a substitute for context isolation
- Auto-generating AGENTS.md (hurts performance; always human-written)

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

## Token Estimation

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

| Lines | Strategy |
|-------|----------|
| <100 | Full content |
| 100-300 | Full + structure comment |
| 300-500 | Summary + key functions |
| >500 | Summary only, link to file |

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
