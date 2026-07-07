/**
 * MCP Zod Schemas for Request Validation
 *
 * Extracted from types.ts to keep file sizes under the 500-line limit.
 * Re-exported by types.ts for backward compatibility.
 *
 * @module worker/lib/mcp/schemas
 */

import { z } from "zod";

// ============================================================================
// JSON-RPC Request Schema
// ============================================================================

export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

// ============================================================================
// Initialize Request Params Schema
// ============================================================================

export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.object({
    roots: z.object({ listChanged: z.boolean().optional() }).optional(),
    sampling: z.object({}).optional(),
  }),
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
});

// ============================================================================
// Tools Schemas
// ============================================================================

export const ToolsListParamsSchema = z.object({
  cursor: z.string().optional(),
});

export const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
  _meta: z
    .object({ progressToken: z.union([z.string(), z.number()]).optional() })
    .optional(),
});

// ============================================================================
// Resources Schemas
// ============================================================================

export const ResourcesListParamsSchema = z.object({
  cursor: z.string().optional(),
});

export const ResourceReadParamsSchema = z.object({
  uri: z.string(),
});
