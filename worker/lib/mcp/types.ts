/**
 * MCP (Model Context Protocol) Types
 *
 * Complete TypeScript type definitions for MCP 2025-11-25 specification.
 * Implements JSON-RPC 2.0 structures, tool/resource schemas, and capability declarations.
 *
 * @module worker/lib/mcp/types
 */

import { z } from "zod";
import type { Env } from "../../types";

// ============================================================================
// JSON-RPC 2.0 Base Types
// ============================================================================

/**
 * Generic record type for object structures
 */
type StringKeyObject = { [key: string]: unknown };

/**
 * JSON-RPC 2.0 Request structure
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: StringKeyObject;
}

/**
 * JSON-RPC 2.0 Notification (no id, no response expected)
 */
export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: StringKeyObject;
}

/**
 * JSON-RPC 2.0 Success Response
 */
export interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

/**
 * JSON-RPC 2.0 Error Response
 */
export interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Union type for all JSON-RPC responses
 */
export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

// ============================================================================
// MCP Protocol Types
// ============================================================================

/**
 * MCP Protocol Version (current: 2025-11-25)
 */
export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_PROTOCOL_VERSION_FALLBACK = "2025-03-26";

/**
 * MCP Request method types
 */
export type MCPMethod =
  | "initialize"
  | "ping"
  | "tools/list"
  | "tools/call"
  | "resources/list"
  | "resources/read"
  | "resources/templates/list"
  | "prompts/list"
  | "prompts/get"
  | "completion/complete"
  | "notifications/initialized"
  | "notifications/tools/list_changed"
  | "notifications/resources/updated"
  | "notifications/resources/list_changed"
  | "notifications/prompts/list_changed";

// ============================================================================
// Content Block Types
// ============================================================================

/**
 * Annotations for content blocks
 */
export interface ContentAnnotations {
  audience?: ("user" | "assistant")[];
  priority?: number;
  lastModified?: string;
}

/**
 * Text content block
 */
export interface TextContent {
  type: "text";
  text: string;
  annotations?: ContentAnnotations;
  _meta?: StringKeyObject;
}

/**
 * Image content block
 */
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
  _meta?: StringKeyObject;
}

/**
 * Audio content block
 */
export interface AudioContent {
  type: "audio";
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
  _meta?: StringKeyObject;
}

/**
 * Resource link content block
 */
export interface ResourceLink {
  type: "resource_link";
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
  _meta?: StringKeyObject;
}

/**
 * Embedded resource content block
 */
export interface EmbeddedResource {
  type: "resource";
  resource: TextResourceContents | BlobResourceContents;
  annotations?: ContentAnnotations;
  _meta?: StringKeyObject;
}

/**
 * Union type for all content blocks
 */
export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool annotations for safety hints
 */
export interface ToolAnnotations {
  title?: string;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Tool definition schema
 */
export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: z.ZodType | object;
  outputSchema?: z.ZodType | object;
  annotations?: ToolAnnotations;
}

/**
 * Tool list request parameters
 */
export interface ToolsListParams {
  cursor?: string;
}

/**
 * Tool list response result
 */
export interface ToolsListResult {
  tools: Tool[];
  nextCursor?: string;
}

/**
 * Tool call request parameters
 */
export interface ToolCallParams {
  name: string;
  arguments?: StringKeyObject;
  _meta?: {
    progressToken?: string | number;
  };
}

/**
 * Tool call response result
 */
export interface ToolCallResult {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: unknown;
}

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Resource definition
 */
export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  annotations?: ContentAnnotations;
}

/**
 * Resource template for dynamic resources
 */
export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
}

/**
 * Resource list request parameters
 */
export interface ResourcesListParams {
  cursor?: string;
}

/**
 * Resource list response result
 */
export interface ResourcesListResult {
  resources: Resource[];
  nextCursor?: string;
}

/**
 * Resource templates list response result
 */
export interface ResourceTemplatesListResult {
  resourceTemplates: ResourceTemplate[];
  nextCursor?: string;
}

/**
 * Resource read request parameters
 */
export interface ResourceReadParams {
  uri: string;
}

/**
 * Text resource contents
 */
export interface TextResourceContents {
  uri: string;
  mimeType?: string;
  text: string;
}

/**
 * Binary resource contents (blob)
 */
export interface BlobResourceContents {
  uri: string;
  mimeType?: string;
  blob: string;
}

/**
 * Resource read response result
 */
export interface ResourceReadResult {
  contents: (TextResourceContents | BlobResourceContents)[];
}

// ============================================================================
// Initialization Types
// ============================================================================

/**
 * Server capabilities declaration
 */
export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {};
  completions?: {};
}

/**
 * Client capabilities declaration
 */
export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: {
    context?: {};
    tools?: {};
  };
  elicitation?: {
    form?: {};
    url?: {};
  };
}

/**
 * Server information
 */
export interface ServerInfo {
  name: string;
  version: string;
}

/**
 * Client information
 */
export interface ClientInfo {
  name: string;
  version: string;
}

/**
 * Initialize request parameters
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

/**
 * Initialize response result
 */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
  instructions?: string;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

/**
 * JSON-RPC Request schema
 */
export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

/**
 * Initialize request params schema
 */
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

/**
 * Tools list params schema
 */
export const ToolsListParamsSchema = z.object({
  cursor: z.string().optional(),
});

/**
 * Tool call params schema
 */
export const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
  _meta: z
    .object({ progressToken: z.union([z.string(), z.number()]).optional() })
    .optional(),
});

/**
 * Resources list params schema
 */
export const ResourcesListParamsSchema = z.object({
  cursor: z.string().optional(),
});

/**
 * Resource read params schema
 */
export const ResourceReadParamsSchema = z.object({
  uri: z.string(),
});

// ============================================================================
// Error Codes (JSON-RPC 2.0 + MCP specific)
// ============================================================================

export const MCPErrorCodes = {
  // Standard JSON-RPC 2.0 errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP specific errors
  RESOURCE_NOT_FOUND: -32002,
  TOOL_NOT_FOUND: -32001,
  INVALID_TOOL_ARGUMENTS: -32003,
  REQUEST_TIMEOUT: -32004,
} as const;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * MCP Handler function type
 */
export type MCPHandler<TParams, TResult> = (
  params: TParams,
  env: Env,
  request: Request,
) => Promise<TResult>;

/**
 * Tool handler function type
 */
export type ToolHandler = (
  args: StringKeyObject,
  env: Env,
  request: Request,
) => Promise<ToolCallResult>;

/**
 * Resource provider function type
 */
export type ResourceProvider = (
  uri: string,
  env: Env,
  request: Request,
) => Promise<ResourceReadResult>;
