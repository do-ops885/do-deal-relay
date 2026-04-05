/**
 * MCP Tool Definitions - User Tools
 *
 * Contains tool definitions and handlers for experience_deal, report_deal, natural_language_query.
 */

import { z } from "zod";
import type { Env } from "../../../types";
import type { Tool, ToolHandler } from "../types";

import {
  handleExperienceDeal,
  ExperienceDealInputSchema,
} from "../handlers/experience";
import { handleReportDeal, ReportDealInputSchema } from "../handlers/report";
import {
  handleNaturalLanguageQuery,
  NaturalLanguageQueryInputSchema,
} from "../handlers/nlq";

export const userTools: Tool[] = [
  {
    name: "report_deal",
    title: "Report Deal",
    description: "Report a broken, expired, or fraudulent referral code",
    inputSchema: {
      type: "object",
      required: ["code", "reason"],
      properties: {
        code: { type: "string", description: "The referral code to report" },
        reason: {
          type: "string",
          enum: ["broken", "expired", "fraudulent", "inaccurate", "duplicate"],
          description: "Reason for reporting",
        },
        comment: { type: "string", description: "Optional details" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        code: { type: "string" },
        reason: { type: "string" },
        status: { type: "string" },
      },
    },
    annotations: {
      title: "Report Deal",
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "experience_deal",
    title: "Experience Deal",
    description: "Report your success or failure with a specific referral code",
    inputSchema: {
      type: "object",
      required: ["code", "success"],
      properties: {
        code: { type: "string", description: "The referral code used" },
        success: { type: "boolean", description: "Whether the deal worked" },
        comment: { type: "string", description: "Optional comment" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        code: { type: "string" },
        reported_success: { type: "boolean" },
        new_confidence: { type: "number" },
        total_experiences: { type: "number" },
      },
    },
    annotations: {
      title: "Experience Deal",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "natural_language_query",
    title: "Natural Language Query",
    description:
      "Search deals using natural language. Understands queries like 'finance deals', 'codes from trading212.com', 'best offers expiring this week'",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Natural language query (e.g., 'finance deals', 'codes from trading212.com')",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "Maximum results to return",
        },
        includeSql: {
          type: "boolean",
          default: false,
          description: "Include generated SQL in response (debug mode)",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        query: { type: "string" },
        parsed: {
          type: "object",
          properties: {
            type: { type: "string" },
            params: { type: "object" },
            originalQuery: { type: "string" },
          },
        },
        count: { type: "number" },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              deal_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              domain: { type: "string" },
              code: { type: "string" },
              url: { type: "string" },
              reward_type: { type: "string" },
              reward_value: { type: "number" },
              status: { type: "string" },
              category: { type: "array", items: { type: "string" } },
              confidence_score: { type: "number" },
            },
          },
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Alternative search suggestions if no results found",
        },
      },
    },
    annotations: {
      title: "Natural Language Query",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export const userToolHandlers: Record<string, ToolHandler> = {
  natural_language_query: (args, env) =>
    handleNaturalLanguageQuery(
      NaturalLanguageQueryInputSchema.parse(args),
      env,
    ),
  experience_deal: (args, env) =>
    handleExperienceDeal(ExperienceDealInputSchema.parse(args), env),
  report_deal: (args, env) =>
    handleReportDeal(ReportDealInputSchema.parse(args), env),
};
