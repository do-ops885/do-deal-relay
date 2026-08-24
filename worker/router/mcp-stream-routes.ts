import type { Env } from "../types";
import { checkBodySize } from "../middleware/body-limit";
import { withAuth } from "../lib/auth";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import { handleMCPStream, handleStreamingToolCall } from "../routes/mcp-stream";

/**
 * MCP SSE Streaming routes (MI-1), extracted from legacy-routes.ts to keep
 * the legacy dispatcher under the 500-line source limit.
 *
 * GET /mcp/stream?operationId=xxx streams progress events for long-running
 * tool executions started via handleStreamingToolCall. Auth + rate limiting
 * mirror the other MCP routes.
 *
 * Returns the matching Response, or `null` if no MCP stream route matched.
 */
export async function tryHandleMCPStreamRoutes(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  if (path === "/mcp/stream" && request.method === "GET") {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(env, "/mcp/stream", auth);
      return rateLimiter(request, () => handleMCPStream(request, env));
    });
  }

  if (path === "/mcp/stream/tools/call" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 10 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/mcp/stream/tools/call",
        auth,
      );
      return rateLimiter(request, async () => {
        const body = (await request.json()) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        if (!body.name) {
          return new Response(JSON.stringify({ error: "Missing 'name'" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return handleStreamingToolCall(
          { name: body.name, arguments: body.arguments ?? {} },
          env,
          request,
        );
      });
    });
  }

  // No MCP stream route matched.
  return null;
}
