/**
 * MCP SSE Streaming Route Handler
 *
 * Server-Sent Events endpoint for streaming long-running tool executions.
 * Supports event types: progress, result, error.
 */

import type { Env } from "../types";
import type { ToolCallParams, ToolCallResult } from "../lib/mcp/types";
import { executeTool } from "../lib/mcp/tools";
import { createProgressTracker, getProgress } from "../lib/mcp/progress";
import { getMCPCorsHeaders } from "./mcp/utils";

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Handle a streaming tool execution via SSE.
 * Returns immediately with an SSE response that streams progress and result.
 */
export async function handleStreamingToolCall(
  params: ToolCallParams,
  env: Env,
  request: Request,
): Promise<Response> {
  const { name, arguments: args = {} } = params;
  const operationId = crypto.randomUUID();
  const tracker = createProgressTracker(operationId, env);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const streamPromise = (async () => {
    try {
      await writer.write(
        encoder.encode(
          encodeSSE("progress", {
            operationId,
            status: "running",
            progress: 0,
            total: 1,
            message: `Starting tool: ${name}`,
          }),
        ),
      );

      await tracker.updateProgress(0, 1, `Executing ${name}...`);

      const result: ToolCallResult = await executeTool(
        name,
        args as Record<string, unknown>,
        env,
        request,
      );

      await tracker.markCompleted(result);

      await writer.write(
        encoder.encode(
          encodeSSE("progress", {
            operationId,
            status: "completed",
            progress: 1,
            total: 1,
            message: `Tool "${name}" completed`,
          }),
        ),
      );

      await writer.write(encoder.encode(encodeSSE("result", result)));
    } catch (error) {
      const errorMessage = (error as Error).message;
      await tracker.markFailed(errorMessage);

      await writer.write(
        encoder.encode(
          encodeSSE("error", {
            operationId,
            error: errorMessage,
          }),
        ),
      );
    } finally {
      await writer.close();
    }
  })();

  streamPromise.catch(() => {
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      ...SSE_HEADERS,
      ...getMCPCorsHeaders(request, env),
      "X-Operation-Id": operationId,
    },
  });
}

/**
 * Handle a GET request to /mcp/stream?operationId=xxx
 * Streams progress of an ongoing operation via SSE.
 */
export async function handleMCPStream(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const operationId = url.searchParams.get("operationId");

  if (!operationId) {
    return new Response(
      JSON.stringify({ error: "Missing operationId query parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getMCPCorsHeaders(request, env),
        },
      },
    );
  }

  const initialState = await getProgress(operationId, env);
  if (!initialState) {
    return new Response(JSON.stringify({ error: "Operation not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...getMCPCorsHeaders(request, env),
      },
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const pollPromise = (async () => {
    try {
      const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

      let lastProgress = -1;

      while (true) {
        const state = await getProgress(operationId, env);
        if (!state) break;

        if (
          state.progress !== lastProgress ||
          terminalStatuses.has(state.status)
        ) {
          await writer.write(
            encoder.encode(
              encodeSSE("progress", {
                operationId: state.operationId,
                status: state.status,
                progress: state.progress,
                total: state.total,
                message: state.message,
              }),
            ),
          );
          lastProgress = state.progress;
        }

        if (terminalStatuses.has(state.status)) {
          if (state.status === "completed" && state.result) {
            await writer.write(
              encoder.encode(encodeSSE("result", state.result)),
            );
          }
          if (state.status === "failed" && state.error) {
            await writer.write(
              encoder.encode(
                encodeSSE("error", {
                  operationId: state.operationId,
                  error: state.error,
                }),
              ),
            );
          }
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch {
      // Stream disconnected
    } finally {
      await writer.close();
    }
  })();

  pollPromise.catch(() => {
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      ...SSE_HEADERS,
      ...getMCPCorsHeaders(request, env),
    },
  });
}
