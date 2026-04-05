/**
 * MCP Tool Definitions - Deal-Related Tools
 *
 * Contains tool definitions and handlers for search_deals, get_deal, add_referral.
 */

import { z } from "zod";
import type { Env } from "../../../types";
import type { Tool, ToolCallResult, ToolHandler } from "../types";

import { handleSearchDeals, SearchDealsInputSchema } from "../handlers/search";
import {
  handleGetDeal,
  handleAddReferral,
  GetDealInputSchema,
  AddReferralInputSchema,
} from "../handlers/referrals";

export const dealTools: Tool[] = [
  {
    name: "search_deals",
    title: "Search Deals",
    description:
      "Search for referral deals by domain, category, status, or keywords",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter by domain (e.g., 'scalable.capital')",
        },
        category: {
          type: "string",
          description: "Filter by category (e.g., 'finance', 'shopping')",
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "expired", "all"],
          description: "Filter by status",
        },
        query: { type: "string", description: "Free text search query" },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100,
          default: 10,
          description: "Maximum results",
        },
        sort_by: {
          type: "string",
          enum: ["confidence", "recency", "value", "expiry", "trust"],
          description: "Field to sort by",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        min_confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum confidence score",
        },
        min_trust: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum trust score",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        deals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string" },
              url: { type: "string" },
              domain: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              reward: { type: "object" },
              confidence: { type: "number" },
            },
          },
        },
        total: { type: "number" },
      },
    },
    annotations: {
      title: "Search Deals",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_deal",
    title: "Get Deal Details",
    description: "Get detailed information about a specific referral code",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "The referral code to look up" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        reward: { type: "object" },
        confidence: { type: "number" },
        submitted_at: { type: "string" },
      },
    },
    annotations: {
      title: "Get Deal",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "add_referral",
    title: "Add Referral Code",
    description: "Add a new referral code to the system",
    inputSchema: {
      type: "object",
      required: ["code", "url", "domain"],
      properties: {
        code: { type: "string", description: "The referral code" },
        url: { type: "string", description: "Full referral URL" },
        domain: { type: "string", description: "Domain (e.g., 'example.com')" },
        title: { type: "string", description: "Title/description of the deal" },
        description: { type: "string", description: "Detailed description" },
        reward_type: {
          type: "string",
          enum: ["cash", "credit", "percent", "item"],
          default: "cash",
        },
        reward_value: {
          type: ["string", "number"],
          description: "Reward amount",
        },
        category: {
          type: "array",
          items: { type: "string" },
          description: "Categories",
        },
        expiry_date: {
          type: "string",
          description: "Expiration date (ISO format)",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        id: { type: "string" },
        code: { type: "string" },
        status: { type: "string" },
        message: { type: "string" },
      },
    },
    annotations: {
      title: "Add Referral",
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

export const dealToolHandlers: Record<string, ToolHandler> = {
  search_deals: (args, env) =>
    handleSearchDeals(SearchDealsInputSchema.parse(args), env),
  get_deal: (args, env) => handleGetDeal(GetDealInputSchema.parse(args), env),
  add_referral: (args, env) =>
    handleAddReferral(AddReferralInputSchema.parse(args), env),
};
