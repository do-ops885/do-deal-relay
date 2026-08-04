import { describe, it, expect } from "vitest";
import { handleA2AAgentCard } from "../../worker/routes/a2a";
import type { Env } from "../../worker/types";

function mockEnv(): Env {
  return {} as unknown as Env;
}

function parseBody(response: Response): Promise<unknown> {
  return response.json();
}

describe("handleA2AAgentCard", () => {
  describe("response basics", () => {
    it("should return 200 status", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      expect(response.status).toBe(200);
    });

    it("should return application/json content-type", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    });

    it("should return a valid JSON object", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = await parseBody(response);
      expect(body).toBeDefined();
      expect(typeof body).toBe("object");
      expect(Array.isArray(body)).toBe(false);
    });
  });

  describe("baseUrl derivation", () => {
    it("should use request origin for interface and endpoint URLs", async () => {
      const request = new Request(
        "https://my-worker.workers.dev/.well-known/agent.json",
      );
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const interfaces = body.interfaces as Array<Record<string, unknown>>;
      expect(interfaces).toHaveLength(1);
      const intf = interfaces[0] as Record<string, unknown>;
      expect(intf.url).toBe("https://my-worker.workers.dev/mcp");

      const endpoints = body.endpoints as Record<string, string>;
      expect(endpoints.api).toBe("https://my-worker.workers.dev/api");
      expect(endpoints.health).toBe("https://my-worker.workers.dev/health");
      expect(endpoints.nlq).toBe("https://my-worker.workers.dev/api/nlq");
    });

    it("should use HTTPS origin when request uses HTTPS", async () => {
      const request = new Request(
        "https://secure.example.com/.well-known/agent.json",
      );
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const endpoints = body.endpoints as Record<string, string>;
      expect(endpoints.health).toBe("https://secure.example.com/health");
    });

    it("should use HTTP origin when request uses HTTP", async () => {
      const request = new Request(
        "http://localhost:8787/.well-known/agent.json",
      );
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const endpoints = body.endpoints as Record<string, string>;
      expect(endpoints.metrics).toBe("http://localhost:8787/metrics");
    });
  });

  describe("agent identity", () => {
    it("should have correct agent name and version", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const agent = body.agent as Record<string, unknown>;
      expect(agent.name).toBe("do-deal-relay");
      expect(agent.version).toBe("0.1.8");
    });

    it("should have a non-empty description", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const agent = body.agent as Record<string, unknown>;
      expect(typeof agent.description).toBe("string");
      expect((agent.description as string).length).toBeGreaterThan(20);
    });

    it("should have provider info", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const agent = body.agent as Record<string, unknown>;
      const provider = agent.provider as Record<string, unknown>;
      expect(provider.name).toBe("do-ops885");
      expect(provider.url).toBe("https://github.com/do-ops885/do-deal-relay");
    });
  });

  describe("capabilities", () => {
    it("should declare mcp, a2a, nlq, and semanticSearch as true", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const caps = body.capabilities as Record<string, boolean>;
      expect(caps.mcp).toBe(true);
      expect(caps.a2a).toBe(true);
      expect(caps.nlq).toBe(true);
      expect(caps.semanticSearch).toBe(true);
    });
  });

  describe("tools", () => {
    it("should have exactly 9 tools", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const tools = body.tools as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(9);
    });

    it("should include all expected tool names", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const tools = body.tools as Array<Record<string, unknown>>;
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("search_deals");
      expect(toolNames).toContain("get_deal");
      expect(toolNames).toContain("add_referral");
      expect(toolNames).toContain("research_domain");
      expect(toolNames).toContain("natural_language_query");
      expect(toolNames).toContain("list_categories");
      expect(toolNames).toContain("validate_deal");
      expect(toolNames).toContain("get_stats");
      expect(toolNames).toContain("get_pipeline_status");
    });

    it("should have name and description for every tool", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const tools = body.tools as Array<Record<string, unknown>>;
      for (const tool of tools) {
        expect(typeof tool.name).toBe("string");
        expect((tool.name as string).length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
        expect((tool.description as string).length).toBeGreaterThan(0);
      }
    });
  });

  describe("resources", () => {
    it("should have exactly 5 resources", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const resources = body.resources as Array<Record<string, unknown>>;
      expect(resources).toHaveLength(5);
    });

    it("should include all expected resource URIs", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const resources = body.resources as Array<Record<string, unknown>>;
      const uris = resources.map((r) => r.uri);

      expect(uris).toContain("deals://{dealId}");
      expect(uris).toContain("categories://list");
      expect(uris).toContain("analytics://summary");
      expect(uris).toContain("nlq://results?query={q}");
      expect(uris).toContain("dora://metrics");
    });

    it("should have uri and description for every resource", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const resources = body.resources as Array<Record<string, unknown>>;
      for (const resource of resources) {
        expect(typeof resource.uri).toBe("string");
        expect((resource.uri as string).length).toBeGreaterThan(0);
        expect(typeof resource.description).toBe("string");
        expect((resource.description as string).length).toBeGreaterThan(0);
      }
    });
  });

  describe("interfaces", () => {
    it("should have a single MCP interface", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const interfaces = body.interfaces as Array<Record<string, unknown>>;
      expect(interfaces).toHaveLength(1);
      const iface = interfaces[0] as Record<string, unknown>;
      expect(iface.type).toBe("mcp");
      expect(iface.version).toBe("2025-11-25");
    });

    it("should derive MCP URL from request origin", async () => {
      const request = new Request(
        "https://custom.example.com/.well-known/agent.json",
      );
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const interfaces = body.interfaces as Array<Record<string, unknown>>;
      expect(interfaces).toHaveLength(1);
      const intf = interfaces[0] as Record<string, unknown>;
      expect(intf.url).toBe("https://custom.example.com/mcp");
    });
  });

  describe("authentication", () => {
    it("should declare api_key and jwt auth types", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const auth = body.authentication as Record<string, unknown>;
      const types = auth.types as string[];
      expect(types).toContain("api_key");
      expect(types).toContain("jwt");
    });

    it("should document API key header", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const auth = body.authentication as Record<string, unknown>;
      const apiKey = auth.apiKey as Record<string, unknown>;
      expect(apiKey.header).toBe("X-API-Key");
      expect(typeof apiKey.description).toBe("string");
    });

    it("should document JWT bearer scheme", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const auth = body.authentication as Record<string, unknown>;
      const jwt = auth.jwt as Record<string, unknown>;
      expect(jwt.header).toBe("Authorization");
      expect(jwt.scheme).toBe("Bearer");
    });
  });

  describe("rate limiting", () => {
    it("should include default rate limiting", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const rl = body.rateLimiting as Record<string, unknown>;
      const def = rl.default as Record<string, number>;
      expect(def).toBeDefined();
      expect(def.windowSeconds).toBe(60);
      expect(def.maxRequests).toBe(100);
    });

    it("should include research rate limiting", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const rl = body.rateLimiting as Record<string, unknown>;
      const research = rl.research as Record<string, number>;
      expect(research).toBeDefined();
      expect(research.windowSeconds).toBe(60);
      expect(research.maxRequests).toBe(20);
    });
  });

  describe("endpoints", () => {
    it("should list all 7 expected endpoint keys", async () => {
      const request = new Request("https://example.com/.well-known/agent.json");
      const response = await handleA2AAgentCard(request, mockEnv());
      const body = (await parseBody(response)) as Record<string, unknown>;

      const endpoints = body.endpoints as Record<string, string>;
      expect(Object.keys(endpoints)).toHaveLength(7);
      expect(endpoints.api).toBeDefined();
      expect(endpoints.a2a).toBeDefined();
      expect(endpoints.health).toBeDefined();
      expect(endpoints.docs).toBeDefined();
      expect(endpoints.metrics).toBeDefined();
      expect(endpoints.nlq).toBeDefined();
      expect(endpoints.semanticSearch).toBeDefined();
    });
  });
});
