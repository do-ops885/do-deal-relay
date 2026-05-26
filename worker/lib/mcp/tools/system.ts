/**
 * MCP Tool Definitions - System Tools
 *
 * Contains tool definitions and handlers for get_stats, get_pipeline_status,
 * trigger_discovery, get_similar_deals, get_deal_highlights, get_logs.
 */

import { z } from "zod";
import type { Env } from "../../../types";
import type { Tool, ToolHandler, ToolCallResult } from "../types";

import { handleGetStats } from "../handlers/stats";
import {
  handleGetPipelineStatus,
  handleTriggerDiscovery,
} from "../handlers/pipeline";
import {
  handleGetSimilarDeals,
  handleGetDealHighlights,
  GetSimilarDealsInputSchema,
} from "../handlers/discovery";
import { handleGetLogs, GetLogsInputSchema } from "../handlers/logging";

export const systemTools: Tool[] = [
  {
    name: "get_stats",
    title: "Get System Statistics",
    description: "Get system statistics and deal counts",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", default: 30 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        totalActiveDeals: { type: "number" },
        totalDealsDiscovered: { type: "number" },
        topCategory: { type: "string" },
        topSource: { type: "string" },
        expiringNext7Days: { type: "number" },
      },
    },
    annotations: {
      title: "Get Stats",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_pipeline_status",
    title: "Get Pipeline Status",
    description: "Get the current status of the deal discovery pipeline",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        locked: { type: "boolean" },
        last_run: { type: "object" },
      },
    },
    annotations: {
      title: "Pipeline Status",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "trigger_discovery",
    title: "Trigger Discovery",
    description: "Manually trigger the deal discovery pipeline",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
      },
    },
    annotations: {
      title: "Trigger Discovery",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_similar_deals",
    title: "Get Similar Deals",
    description: "Find referral deals similar to a specific code or domain",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        domain: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 50, default: 5 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        reference: { type: "object" },
        similar: { type: "array" },
        total: { type: "number" },
      },
    },
    annotations: {
      title: "Similar Deals",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_deal_highlights",
    title: "Get Deal Highlights",
    description: "Get top-rated, recently added, and soon-to-expire deals",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 20, default: 5 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        top_deals: { type: "array" },
        expiring_soon: { type: "array" },
        recently_added: { type: "array" },
      },
    },
    annotations: {
      title: "Deal Highlights",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_logs",
    title: "Get Pipeline Logs",
    description:
      "Retrieve recent or specific run logs for the discovery pipeline",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        count: { type: "number", minimum: 1, maximum: 1000, default: 100 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        logs: { type: "array" },
        count: { type: "number" },
      },
    },
    annotations: {
      title: "Pipeline Logs",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export const systemToolHandlers: Record<string, ToolHandler> = {
  get_stats: (args, env) => handleGetStats(args, env),
  get_pipeline_status: (args, env) => handleGetPipelineStatus(args, env),
  trigger_discovery: (args, env) => handleTriggerDiscovery(args, env),
  get_similar_deals: (args, env) =>
    handleGetSimilarDeals(GetSimilarDealsInputSchema.parse(args), env),
  get_deal_highlights: (args, env) => handleGetDealHighlights(args, env),
  get_logs: (args, env) => handleGetLogs(GetLogsInputSchema.parse(args), env),
};
