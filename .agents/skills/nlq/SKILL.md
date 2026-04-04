---
name: nlq
description: Natural Language Query skill for deal discovery. Converts conversational queries like "Find me trading deals with $100 bonuses" into structured database searches with intent classification, entity extraction, and AI-powered enhancements.
---

# Natural Language Query (NLQ) Skill

Convert conversational queries into structured deal searches with AI-powered understanding.

## Quick Start

```typescript
import { parseQuery, buildStructuredQuery, executeStructuredQuery } from "./lib/nlq";

// Parse natural language
const parsed = parseQuery("trading platforms with $100+ signup bonus");

// Build and execute
const result = await executeStructuredQuery(parsed, env);
```

## Usage Examples

### HTTP API
```bash
# POST with JSON body
curl -X POST /api/nlq \
  -H "Content-Type: application/json" \
  -d '{"query": "best crypto deals", "limit": 10}'

# GET with query parameter
curl "/api/nlq?q=finance%20deals%20expiring%20this%20week"

# Explain query parsing
curl "/api/nlq/explain?q=compare%20robinhood%20vs%20webull"
```

### MCP Tool
```json
{
  "name": "natural_language_query",
  "arguments": {
    "query": "deals with cashback over $50",
    "limit": 10
  }
}
```

## Query Capabilities

| Query Type | Example | Intent |
|------------|---------|--------|
| Category Search | "trading platforms" | search |
| Reward Filter | "deals with $100 bonus" | filter |
| Comparison | "Robinhood vs Webull" | compare |
| Ranking | "top 5 crypto exchanges" | rank |
| Time Constraint | "deals expiring this week" | filter |
| Sentiment | "best trading apps" | rank |
| Combined | "top crypto deals with $50+ bonus" | rank+filter |

## Real-World Evaluations

See `evals/evals.json` for 10 real-world test cases covering:
- Basic search queries
- Reward amount filtering
- Platform comparisons
- Time-based constraints
- Complex combined queries
- MCP tool integration
- Error handling
- Rate limiting
- AI enhancement

## Architecture

```
Query → Parser → Intent Classifier → Entity Extractor → Query Builder → D1 FTS5 → Results
              ↓
         AI Enhancer (complex queries)
```

## File Structure

```
worker/lib/nlq/
├── index.ts              # Main exports
├── types.ts              # Type definitions
├── parser/
│   ├── lexer.ts          # Tokenization
│   ├── entities.ts       # Entity extraction
│   └── parser.ts         # Main parser
├── query-builder/
│   ├── sql.ts            # SQL generation
│   ├── executor.ts       # Query execution
│   └── explanation.ts    # Query explanation
├── hybrid/
│   ├── rule-classifier.ts # Rule-based classification
│   └── ai-decision.ts     # AI decision logic
└── ai/
    ├── entities.ts       # AI entity extraction
    ├── intent.ts         # AI intent classification
    └── expansion.ts      # Query expansion
```

## Best Practices

- Use structured logging for all queries
- Cache AI enhancement results in KV
- Rate limit: 30 requests/minute
- Query length max: 500 characters
- AI enhancement for complex queries only

## Error Handling

All errors return structured JSON with:
- `error`: Error message
- `code`: Error code
- `details`: Additional context

Example:
```json
{
  "error": "Invalid query",
  "code": "VALIDATION_ERROR",
  "details": "Query must be between 1 and 500 characters"
}
```

## Performance

- Simple queries: < 50ms (rule-based)
- Complex queries: < 200ms (AI-enhanced)
- Cache hit: < 10ms
- Rate limited: 429 response

## References

- Full documentation: `docs/API.md` (NLQ section)
- Best practices: `docs/BEST_PRACTICES.md`
- Evaluations: `evals/evals.json`
