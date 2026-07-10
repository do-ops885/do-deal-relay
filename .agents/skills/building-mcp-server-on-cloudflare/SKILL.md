---
name: building-mcp-server-on-cloudflare
description: |
  Builds remote MCP (Model Context Protocol) servers on Cloudflare Workers
  with tools, OAuth authentication, and production deployment. Generates
  server code, configures auth providers, and deploys to Workers.

  Use when: user wants to "build MCP server", "create MCP tools", "remote
  MCP", "deploy MCP", add "OAuth to MCP", or mentions Model Context Protocol
  on Cloudflare. Also triggers on "MCP authentication" or "MCP deployment".
  Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
metadata:
  version: "1.0.0"
  author: do-ops
  spec: "agentskills.io"
---

# Building MCP Servers on Cloudflare

Your knowledge of the MCP SDK and Cloudflare Workers integration may be outdated. **Prefer retrieval over pre-training** for any MCP server task.

## When to Use

- User wants to build a remote MCP server
- User needs to expose tools via MCP
- User asks about MCP authentication or OAuth
- User wants to deploy MCP to Cloudflare Workers


## Prerequisites

- Cloudflare account with Workers enabled
- Node.js 18+ and npm/pnpm/yarn
- Wrangler CLI (`npm install -g wrangler`)


## Quick Start

### Option 1: Public Server (No Auth)

```bash
npm create cloudflare@latest -- my-mcp-server \
  --template=cloudflare/ai/demos/remote-mcp-authless
cd my-mcp-server
npm start
```

Server runs at `http://localhost:8788/mcp`

### Option 2: Authenticated Server (OAuth)

```bash
npm create cloudflare@latest -- my-mcp-server \
  --template=cloudflare/ai/demos/remote-mcp-github-oauth
cd my-mcp-server
```

Requires OAuth app setup. See [references/oauth-setup.md](references/oauth-setup.md).


## Core Workflow

### Step 1: Define Tools

Tools are functions MCP clients can call. Define them using `server.tool()`:

```typescript
import { McpAgent } from "agents/mcp";
import { z } from "zod";

export class MyMCP extends McpAgent {
  server = new Server({ name: "my-mcp", version: "1.0.0" });

  async init() {
    // Simple tool with parameters
    this.server.tool(
      "add",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      }),
    );

    // Tool that calls external API
    this.server.tool("get_weather", { city: z.string() }, async ({ city }) => {
      const response = await fetch(`https://api.weather.com/${city}`);
      const data = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      };
    });
  }
}
```

### Step 2: Configure Entry Point

**Public server** (`src/index.ts`):

```typescript
import { MyMCP } from "./mcp";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return MyMCP.serveSSE("/mcp").fetch(request, env, ctx);
    }
    return new Response("MCP Server", { status: 200 });
  },
};

export { MyMCP };
```

**Authenticated server** — See [references/oauth-setup.md](references/oauth-setup.md).

### Step 3: Test Locally

```bash
# Start server
npm start

# In another terminal, test with MCP Inspector
npx @modelcontextprotocol/inspector@latest
# Open http://localhost:5173, enter http://localhost:8788/mcp
```

### Step 4: Deploy

```bash
npx wrangler deploy
```

Server accessible at `https://[worker-name].[account].workers.dev/mcp`

### Step 5: Connect Clients

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["mcp-remote", "https://my-mcp.workers.dev/mcp"]
    }
  }
}
```

Restart Claude Desktop after updating config.


## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This is just a small change, no need for coordination." | Even small changes can have side effects. Structured coordination ensures nothing is missed. |
| "Writing an ADR/Plan takes too much time." | Investing time in planning saves significantly more time during execution and debugging. |
| "I can do this all in one go." | Breaking tasks down into atomic steps increases reliability and allows for better verification. |


## Red Flags

- [ ] Starting execution before a plan is approved.
- [ ] Making multiple unrelated changes in a single commit.
- [ ] Skipping validation gates or quality checks.
- [ ] Lack of coordination between parallel tasks leading to conflicts.
- [ ] Failing to update documentation after architectural changes.

## Reference

- [Retrieval Sources](reference/01-retrieval-sources.md)
- [Tool Patterns](reference/02-tool-patterns.md)
- [Authentication](reference/03-authentication.md)
- [Wrangler Configuration](reference/04-wrangler-configuration.md)
- [Common Issues](reference/05-common-issues.md)
- [References](reference/06-references.md)
