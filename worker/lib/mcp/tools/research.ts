/**
 * MCP Tool Definitions - Research Tools
 *
 * Contains tool definitions and handlers for research_domain, list_categories, validate_deal.
 */

import type { Tool, ToolHandler } from "../types";

import {
  handleResearchDomain,
  ResearchDomainInputSchema,
} from "../handlers/research";
import {
  handleListCategories,
  ListCategoriesInputSchema,
} from "../handlers/categories";
import {
  handleValidateDeal,
  ValidateDealInputSchema,
} from "../handlers/validation";

export const researchTools: Tool[] = [
  {
    name: "research_domain",
    title: "Research Domain",
    description: "Research a domain for available referral programs",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          description: "Domain to research (e.g., 'dropbox.com')",
        },
        depth: {
          type: "string",
          enum: ["quick", "thorough", "deep"],
          default: "thorough",
        },
        max_results: { type: "number", minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        discovered_codes: { type: "array" },
        research_metadata: { type: "object" },
      },
    },
    annotations: {
      title: "Research Domain",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "list_categories",
    title: "List Categories",
    description: "List all available deal categories with descriptions",
    inputSchema: {
      type: "object",
      properties: {
        include_descriptions: { type: "boolean", default: false },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    annotations: {
      title: "List Categories",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "validate_deal",
    title: "Validate Deal",
    description: "Validate a deal's URL and check if it's still active",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL to validate" },
        check_status: { type: "boolean", default: true },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        url: { type: "string" },
        extracted_code: { type: ["string", "null"] },
        domain: { type: "string" },
        security_check: { type: "object" },
        status_check: { type: "object" },
      },
    },
    annotations: {
      title: "Validate Deal",
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

export const researchToolHandlers: Record<string, ToolHandler> = {
  research_domain: (args, env) =>
    handleResearchDomain(ResearchDomainInputSchema.parse(args), env),
  list_categories: (args) =>
    handleListCategories(ListCategoriesInputSchema.parse(args)),
  validate_deal: (args, env) =>
    handleValidateDeal(ValidateDealInputSchema.parse(args), env),
};
