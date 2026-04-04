# MCP (Model Context Protocol) Documentation

**Protocol Version**: 2025-11-25
**Server Version**: 0.2.0
**Base URL**: `https://your-worker.workers.dev/mcp`

## Overview

The Model Context Protocol (MCP) is an open protocol that enables AI agents to securely interact with the deal discovery system through standardized tools and resources. This implementation follows the MCP 2025-11-25 specification.

## Authentication

No authentication required for public endpoints. Rate limiting applies: 100 requests per minute per IP.

## MCP Endpoints

### GET /mcp

Returns server information and protocol capabilities.

**Response:**

```json
{
  "server": "do-deal-relay-mcp",
  "version": "0.2.0",
  "protocol_version": "2025-11-25",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": false, "listChanged": false },
    "prompts": { "listChanged": false },
    "logging": {},
    "completions": {}
  },
  "tools_available": 8,
  "documentation": "https://do-deal-relay.com/docs/mcp"
}
```

---

### POST /mcp/v1/tools/list

List all available MCP tools with their schemas.

**Request Body (JSON-RPC 2.0):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "search_deals",
        "title": "Search Deals",
        "description": "Search for referral deals by domain, category, status, or keywords",
        "inputSchema": {
          "type": "object",
          "properties": {
            "domain": { "type": "string", "description": "Filter by domain" },
            "category": { "type": "string", "description": "Filter by category" },
            "status": { "type": "string", "enum": ["active", "inactive", "expired", "all"] },
            "query": { "type": "string", "description": "Free text search query" },
            "limit": { "type": "number", "minimum": 1, "maximum": 100, "default": 10 }
          }
        },
        "annotations": {
          "destructiveHint": false,
          "idempotentHint": true,
          "openWorldHint": false
        }
      }
      // ... additional tools
    ]
  }
}
```

---

### POST /mcp/v1/tools/call

Execute a specific MCP tool.

**Request Body (JSON-RPC 2.0):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_deals",
    "arguments": {
      "domain": "trading212.com",
      "status": "active",
      "limit": 5
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 deals matching your criteria"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "deals://search?domain=trading212.com&status=active",
          "mimeType": "application/json",
          "text": "{\"deals\": [...], \"total\": 3}"
        }
      }
    ],
    "structuredContent": {
      "deals": [...],
      "total": 3
    }
  }
}
```

---

### GET /mcp/v1/info

Get server information and metadata.

**Response:**

```json
{
  "name": "do-deal-relay-mcp",
  "version": "0.2.0",
  "protocol_version": "2025-11-25",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": false, "listChanged": false }
  }
}
```

---

## Available Tools

### 1. search_deals

Search for referral deals by domain, category, status, or keywords.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domain | string | No | Filter by domain (e.g., 'scalable.capital') |
| category | string | No | Filter by category (e.g., 'finance', 'shopping') |
| status | string | No | Filter by status: 'active', 'inactive', 'expired', 'all' |
| query | string | No | Free text search query |
| limit | number | No | Max results (1-100, default: 10) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_deals",
    "arguments": {
      "domain": "trading212.com",
      "status": "active",
      "limit": 5
    }
  }
}
```

**Example Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 deals matching your criteria"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "deals://search",
        "mimeType": "application/json",
        "text": "{\"deals\":[{\"code\":\"ABC123\",\"url\":\"...\",\"domain\":\"trading212.com\"}]}"
      }
    }
  ],
  "structuredContent": {
    "deals": [...],
    "total": 3
  }
}
```

---

### 2. get_deal

Get detailed information about a specific referral code.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | The referral code to look up |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_deal",
    "arguments": {
      "code": "GcCOCxbo"
    }
  }
}
```

---

### 3. add_referral

Add a new referral code to the system.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | The referral code |
| url | string | Yes | Full referral URL |
| domain | string | Yes | Domain (e.g., 'example.com') |
| title | string | No | Title/description of the deal |
| description | string | No | Detailed description |
| reward_type | string | No | Type: 'cash', 'credit', 'percent', 'item' (default: 'cash') |
| reward_value | string/number | No | Reward amount or description |
| category | string[] | No | Categories (e.g., ['finance', 'investing']) |
| expiry_date | string | No | Expiration date in ISO format |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "add_referral",
    "arguments": {
      "code": "MYCODE123",
      "url": "https://example.com/invite/MYCODE123",
      "domain": "example.com",
      "title": "Example Referral",
      "reward_type": "cash",
      "reward_value": 10
    }
  }
}
```

**Note:** New referrals are placed in quarantine for review before activation.

---

### 4. research_domain

Research a domain for available referral programs.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domain | string | Yes | Domain to research (e.g., 'dropbox.com') |
| depth | string | No | Research depth: 'quick', 'thorough', 'deep' (default: 'thorough') |
| max_results | number | No | Maximum results (1-50, default: 10) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "research_domain",
    "arguments": {
      "domain": "dropbox.com",
      "depth": "thorough",
      "max_results": 10
    }
  }
}
```

---

### 5. list_categories

List all available deal categories with descriptions.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| include_descriptions | boolean | No | Include category descriptions (default: false) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_categories",
    "arguments": {
      "include_descriptions": true
    }
  }
}
```

---

### 6. validate_deal

Validate a deal's URL and check if it's still active.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | URL to validate |
| check_status | boolean | No | Check if deal is in database (default: true) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "validate_deal",
    "arguments": {
      "url": "https://trading212.com/invite/GcCOCxbo",
      "check_status": true
    }
  }
}
```

**Response includes:**
- Security checks (HTTPS, no path traversal, valid domain)
- Extracted referral code
- Database status (if check_status is true)

---

### 7. get_stats

Get system statistics and deal counts.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| days | number | No | Time period in days (default: 30) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_stats",
    "arguments": {
      "days": 30
    }
  }
}
```

**Example Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "📊 System Statistics (last 30 days)\n\nActive Deals: 150\nDiscovered: 45\nTop Category: finance\nTop Source: api"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "analytics://summary",
        "mimeType": "application/json",
        "text": "{\"totalActiveDeals\":150,...}"
      }
    }
  ],
  "structuredContent": {
    "totalActiveDeals": 150,
    "totalDealsDiscovered": 45,
    "topCategory": "finance",
    "topSource": "api",
    "expiringNext7Days": 3
  }
}
```

---

### 8. natural_language_query

Search deals using natural language. The AI parses your query into structured search parameters.

**Supported Query Patterns:**

| Pattern | Example | Description |
|---------|---------|-------------|
| Category search | "finance deals", "shopping offers" | Find deals by category |
| Domain search | "codes from trading212.com", "dropbox.com referrals" | Find deals from specific websites |
| Expiring soon | "deals expiring in 7 days" | Find time-sensitive deals |
| Reward type | "cash bonus deals", "percentage offers" | Filter by reward type |
| High confidence | "best deals", "verified offers" | Find top-quality deals |
| Recent deals | "new deals", "latest referrals" | Find recently added deals |
| Free text | "stock trading signup bonus" | General keyword search |

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Natural language query |
| limit | number | No | Max results (1-50, default: 10) |
| includeSql | boolean | No | Include generated SQL (debug mode) |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "natural_language_query",
    "arguments": {
      "query": "finance deals expiring this week",
      "limit": 5
    }
  }
}
```

**Example Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "🔍 Natural Language Query: \"finance deals expiring this week\"\n\nParsed as: expiring_soon\nFound 3 deals\n\nTop results:\n1. Trading212 Signup Bonus (trading212.com) - GcCOCxbo\n2. Scalable Capital Offer (scalable.capital) - SC2024\n3. FreeTrade Referral (freetrade.io) - FTBONUS"
    },
    {
      "type": "resource",
      "resource": {
        "uri": "nlq://results?finance+deals+expiring+this+week",
        "mimeType": "application/json",
        "text": "{\"deals\":[{\"deal_id\":\"...\",\"title\":\"...\"}],\"count\":3}"
      }
    }
  ],
  "structuredContent": {
    "success": true,
    "query": "finance deals expiring this week",
    "parsed": {
      "type": "expiring_soon",
      "params": { "expiringDays": 7, "category": "finance", "limit": 5 }
    },
    "count": 3,
    "deals": [...],
    "suggestions": null
  }
}
```

**Query Tips:**

- Be specific: "trading212.com deals" works better than "trading deals"
- Use categories: "finance", "shopping", "tech", "crypto"
- Mention time: "expiring in 7 days", "new this week"
- Specify rewards: "cash bonus", "percentage discount"

---

## Tool Annotations

Each tool includes safety annotations:

| Annotation | Description |
|------------|-------------|
| `destructiveHint` | True if the tool may modify or delete data |
| `idempotentHint` | True if calling the tool multiple times produces the same result |
| `openWorldHint` | True if the tool interacts with external systems |

## Error Handling

MCP uses JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Tool not found",
    "data": { "tool_name": "unknown_tool" }
  }
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32001 | Tool not found |
| -32002 | Resource not found |
| -32003 | Invalid tool arguments |
| -32004 | Request timeout |

## Rate Limiting

- 100 requests per minute per IP
- Exceeded limit returns HTTP 429 with `Retry-After` header

## CORS Support

All endpoints support CORS:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Client Examples

### cURL Example

```bash
# List available tools
curl -X POST https://your-worker.workers.dev/mcp/v1/tools/list \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# Call search_deals tool
curl -X POST https://your-worker.workers.dev/mcp/v1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_deals",
      "arguments": {
        "domain": "trading212.com",
        "limit": 5
      }
    }
  }'

# Natural language query
curl -X POST https://your-worker.workers.dev/mcp/v1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "natural_language_query",
      "arguments": {
        "query": "best finance deals expiring soon",
        "limit": 10
      }
    }
  }'
```

### JavaScript/TypeScript Example

```typescript
async function callMcpTool(toolName: string, args: object) {
  const response = await fetch('https://your-worker.workers.dev/mcp/v1/tools/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.random().toString(36),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });
  return await response.json();
}

// Usage
const result = await callMcpTool('search_deals', {
  domain: 'trading212.com',
  status: 'active'
});

// Natural language query example
const nlqResult = await callMcpTool('natural_language_query', {
  query: 'finance deals expiring this week',
  limit: 10
});
```

## Related Documentation

- [API Documentation](API.md) - REST API reference
- [AGENTS.md](../AGENTS.md) - System architecture
- [MCP Specification](https://modelcontextprotocol.io) - Official protocol docs
