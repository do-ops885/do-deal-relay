import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Env } from "../../worker/types";
import type { AuthResult } from "../../worker/lib/auth";
import { executeTool } from "../../worker/lib/mcp/tools/index";
import {
  createProgressTracker,
  getProgress,
  listOperations,
} from "../../worker/lib/mcp/progress";
import {
  handleCheckProgress,
  handleCancelOperation,
  handleListOperations,
} from "../../worker/lib/mcp/handlers/progress";
import { handleMCPStream } from "../../worker/routes/mcp-stream";

function createMockEnv(): Env {
  const kvMap = new Map<string, string>();
  const dbRows: { operationId: string; toolName: string; createdAt: string; userId?: string }[] = [];

  return {
    DEALS_PROD: {
      get: vi.fn().mockImplementation(async (key: string) => kvMap.get(key) || null),
      put: vi.fn().mockImplementation(async (key: string, value: string) => {
        kvMap.set(key, value);
      }),
      delete: vi.fn().mockImplementation(async (key: string) => {
        kvMap.delete(key);
      }),
    },
    DEALS_DB: {
      exec: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: (...args: unknown[]) => {
            return {
              run: vi.fn().mockImplementation(async () => {
                if (query.includes("DELETE FROM")) {
                  const opId = args[0] as string;
                  const idx = dbRows.findIndex((r) => r.operationId === opId);
                  if (idx !== -1) dbRows.splice(idx, 1);
                }
                return { success: true };
              }),
              all: vi.fn().mockImplementation(async () => {
                if (query.includes("WHERE userId = ?")) {
                  const targetUserId = args[0] as string;
                  return { results: dbRows.filter((r) => r.userId === targetUserId) };
                }
                return { results: dbRows };
              }),
            };
          },
        };
      }),
    },
  } as unknown as Env;
}

describe("MCP Security & Auth Controls", () => {
  let env: Env;
  let dummyRequest: Request;

  beforeEach(() => {
    env = createMockEnv();
    dummyRequest = new Request("http://localhost/mcp");
  });

  describe("Admin-restricted tools enforcement", () => {
    const adminTools = ["trigger_discovery", "get_pipeline_status", "get_logs", "get_stats"];

    it.each(adminTools)("rejects execution of %s when user has 'user' role", async (toolName) => {
      const userAuth: AuthResult = {
        authenticated: true,
        userId: "user_123",
        role: "user",
      };

      const result = await executeTool(toolName, {}, env, dummyRequest, userAuth);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(`Forbidden: Tool "${toolName}" requires admin role`);
    });

    it.each(adminTools)("rejects execution of %s when unauthenticated (no auth object)", async (toolName) => {
      const result = await executeTool(toolName, {}, env, dummyRequest, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(`Forbidden: Tool "${toolName}" requires admin role`);
    });

    it("allows execution of trigger_discovery when user has 'admin' role", async () => {
      const adminAuth: AuthResult = {
        authenticated: true,
        userId: "admin_123",
        role: "admin",
      };

      // Mock executePipeline to avoid full execution
      const result = await executeTool("trigger_discovery", {}, env, dummyRequest, adminAuth);
      // Execution attempted (may fail at state-machine due to mocks, but not blocked by role gate)
      expect(result.content[0].text).not.toContain("Forbidden: Tool");
    });
  });

  describe("Progress operation ownership scoping (IDOR prevention)", () => {
    const opUserA = "op_user_a";
    const userA: AuthResult = { authenticated: true, userId: "user_A", role: "user" };
    const userB: AuthResult = { authenticated: true, userId: "user_B", role: "user" };
    const admin: AuthResult = { authenticated: true, userId: "admin_user", role: "admin" };

    beforeEach(async () => {
      const tracker = createProgressTracker(opUserA, env, userA.userId);
      await tracker.updateProgress(0.5, 1, "Working...");
    });

    it("allows user A to check progress of their own operation", async () => {
      const result = await handleCheckProgress({ operationId: opUserA }, env, userA);
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(opUserA);
      expect(result.content[0].text).toContain("user_A");
    });

    it("prevents user B from checking progress of user A's operation", async () => {
      const result = await handleCheckProgress({ operationId: opUserA }, env, userB);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Forbidden: Operation belongs to another user");
    });

    it("allows admin to check progress of user A's operation", async () => {
      const result = await handleCheckProgress({ operationId: opUserA }, env, admin);
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(opUserA);
    });

    it("prevents user B from cancelling user A's operation", async () => {
      const result = await handleCancelOperation({ operationId: opUserA }, env, userB);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Forbidden: Operation belongs to another user");

      const state = await getProgress(opUserA, env);
      expect(state?.status).toBe("running");
    });

    it("allows user A to cancel their own operation", async () => {
      const result = await handleCancelOperation({ operationId: opUserA }, env, userA);
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("cancelled");

      const state = await getProgress(opUserA, env);
      expect(state?.status).toBe("cancelled");
    });

    it("blocks user B from streaming user A's operation via SSE /mcp/stream", async () => {
      const streamReq = new Request(`http://localhost/mcp/stream?operationId=${opUserA}`);
      const response = await handleMCPStream(streamReq, env, userB);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain("Forbidden");
    });
  });
});
