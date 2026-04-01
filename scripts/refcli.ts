#!/usr/bin/env node

/**
 * refcli - CLI tool for managing referral codes in the do-deal-relay system
 * 
 * Usage:
 *   refcli auth login --endpoint https://api.example.com --key <api_key>
 *   refcli codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
 *   refcli codes deactivate ABC123 --reason expired --replaced-by NEW456
 *   refcli research run --domain example.com --depth thorough
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Configuration & State
// ============================================================================

const CONFIG_DIR = join(homedir(), ".refcli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_ENDPOINT = process.env.REFCLI_ENDPOINT || "http://localhost:8787";

interface Config {
  endpoint: string;
  apiKey?: string;
  defaultOutput: "table" | "json" | "csv" | "yaml";
}

let config: Config = {
  endpoint: DEFAULT_ENDPOINT,
  defaultOutput: "table",
};

// ============================================================================
// CLI Parser
// ============================================================================

interface ParsedArgs {
  command: string;
  subcommand: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    command: "",
    subcommand: "",
    flags: {},
    positional: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const flag = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[flag] = nextArg;
        i += 2;
      } else {
        result.flags[flag] = true;
        i++;
      }
    } else if (arg.startsWith("-")) {
      const flag = arg.slice(1);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[flag] = nextArg;
        i += 2;
      } else {
        result.flags[flag] = true;
        i++;
      }
    } else {
      if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand) {
        result.subcommand = arg;
      } else {
        result.positional.push(arg);
      }
      i++;
    }
  }

  return result;
}

// ============================================================================
// HTTP Client
// ============================================================================

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${config.endpoint}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `API Error ${response.status}: ${(data as { error?: string }).error || "Unknown error"}`,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Network error: ${String(error)}`);
  }
}

// ============================================================================
// Output Formatters
// ============================================================================

function formatTable(data: unknown[]): string {
  if (data.length === 0) return "No data";

  const firstRow = data[0] as Record<string, unknown>;
  const keys = Object.keys(firstRow);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = Math.max(
      key.length,
      ...data.map(row => String((row as Record<string, unknown>)[key] || "").length),
    );
  }

  // Build header
  const header = keys.map(k => k.padEnd(widths[k])).join(" | ");
  const separator = keys.map(k => "-".repeat(widths[k])).join("-+-");

  // Build rows
  const rows = data.map(row =>
    keys.map(k => String((row as Record<string, unknown>)[k] || "").padEnd(widths[k])).join(" | "),
  );

  return [header, separator, ...rows].join("\n");
}

function formatOutput(data: unknown, format: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "csv":
      if (Array.isArray(data)) {
        if (data.length === 0) return "";
        const keys = Object.keys(data[0] as object);
        const header = keys.join(",");
        const rows = data.map(row =>
          keys.map(k => JSON.stringify((row as Record<string, unknown>)[k])).join(","),
        );
        return [header, ...rows].join("\n");
      }
      return JSON.stringify(data);
    case "yaml":
      // Simple YAML formatter
      return JSON.stringify(data, null, 2)
        .replace(/"/g, "")
        .replace(/,$/gm, "");
    case "table":
    default:
      if (Array.isArray(data)) {
        return formatTable(data);
      }
      return JSON.stringify(data, null, 2);
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleAuth(args: ParsedArgs): Promise<void> {
  switch (args.subcommand) {
    case "login": {
      const endpoint = (args.flags.endpoint as string) || config.endpoint;
      const apiKey = (args.flags.key as string) || process.env.REFCLI_API_KEY;

      if (!apiKey) {
        console.error("Error: API key required. Use --key or set REFCLI_API_KEY");
        process.exit(1);
      }

      // Test connection
      try {
        config.endpoint = endpoint;
        config.apiKey = apiKey;
        await apiRequest("GET", "/health");
        console.log(`✓ Authenticated to ${endpoint}`);
      } catch (error) {
        console.error(`✗ Authentication failed: ${(error as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case "logout": {
      config.apiKey = undefined;
      console.log("✓ Logged out");
      break;
    }

    case "whoami": {
      console.log(`Endpoint: ${config.endpoint}`);
      console.log(`Authenticated: ${config.apiKey ? "Yes" : "No"}`);
      break;
    }

    default:
      console.log("Usage: refcli auth [login|logout|whoami]");
  }
}

async function handleCodes(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "list": {
      const status = args.flags.status as string | undefined;
      const domain = args.flags.domain as string | undefined;
      const limit = parseInt((args.flags.limit as string) || "100", 10);

      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (domain) query.set("domain", domain);
      query.set("limit", String(limit));

      const data = await apiRequest("GET", `/api/referrals?${query}`) as {
        referrals: unknown[];
        total: number;
      };

      console.log(formatOutput(data.referrals, output));
      console.log(`\nTotal: ${data.total} referrals`);
      break;
    }

    case "add": {
      const code = args.flags.code as string;
      const url = args.flags.url as string;
      const domain = args.flags.domain as string;

      if (!code || !url || !domain) {
        console.error("Error: --code, --url, and --domain are required");
        process.exit(1);
      }

      const body = {
        code,
        url,
        domain,
        source: "cli",
        submitted_by: "cli-user",
        metadata: {
          title: (args.flags.title as string) || `${domain} Referral`,
          description: args.flags.description as string | undefined,
          reward_type: (args.flags["reward-type"] as string) || "unknown",
          reward_value: args.flags["reward-value"] as string | number | undefined,
          currency: args.flags.currency as string | undefined,
          category: args.flags.category ? (args.flags.category as string).split(",") : ["general"],
          tags: args.flags.tags ? (args.flags.tags as string).split(",") : ["cli-added"],
          notes: args.flags.notes as string | undefined,
        },
      };

      const data = await apiRequest("POST", "/api/referrals", body) as {
        success: boolean;
        referral: unknown;
      };

      if (data.success) {
        console.log(`✓ Created referral: ${code}`);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    case "get": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const data = await apiRequest("GET", `/api/referrals/${code}`) as {
        referral: unknown;
      };
      console.log(formatOutput(data.referral, output));
      break;
    }

    case "deactivate": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const reason = (args.flags.reason as string) || "user_request";
      const replacedBy = args.flags["replaced-by"] as string | undefined;
      const notes = args.flags.notes as string | undefined;

      const body = {
        reason,
        replaced_by: replacedBy,
        notes,
      };

      const data = await apiRequest("POST", `/api/referrals/${code}/deactivate`, body) as {
        success: boolean;
        referral: unknown;
      };

      if (data.success) {
        console.log(`✓ Deactivated referral: ${code}`);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    case "reactivate": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const data = await apiRequest("POST", `/api/referrals/${code}/reactivate", {}) as {
        success: boolean;
        referral: unknown;
      };

      if (data.success) {
        console.log(`✓ Reactivated referral: ${code}`);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    default:
      console.log("Usage: refcli codes [list|add|get|deactivate|reactivate]");
  }
}

async function handleResearch(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "run": {
      const domain = args.flags.domain as string;
      const query = (args.flags.query as string) || `${domain} referral code`;
      const depth = (args.flags.depth as string) || "thorough";

      if (!domain) {
        console.error("Error: --domain is required");
        process.exit(1);
      }

      console.log(`Researching referral codes for ${domain}...`);

      const body = {
        query,
        domain,
        depth,
        sources: ["all"],
        max_results: 20,
      };

      const data = await apiRequest("POST", "/api/research", body) as {
        success: boolean;
        discovered_codes: number;
        stored_referrals: number;
        research_metadata: unknown;
      };

      if (data.success) {
        console.log(`✓ Research completed`);
        console.log(`  Discovered: ${data.discovered_codes} codes`);
        console.log(`  Stored: ${data.stored_referrals} referrals`);

        if (args.flags.verbose) {
          console.log("\nMetadata:");
          console.log(formatOutput(data.research_metadata, output));
        }
      }
      break;
    }

    case "results": {
      const domain = args.flags.domain as string;
      if (!domain) {
        console.error("Error: --domain is required");
        process.exit(1);
      }

      const data = await apiRequest("GET", `/api/research/${domain}`) as {
        discovered_codes: unknown[];
        research_metadata: unknown;
      };

      console.log(`Research results for ${domain}:`);
      console.log(formatOutput(data.discovered_codes, output));
      break;
    }

    default:
      console.log("Usage: refcli research [run|results]");
  }
}

async function handleSystem(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "health": {
      const data = await apiRequest("GET", "/health");
      console.log(formatOutput(data, output));
      break;
    }

    case "metrics": {
      const data = await apiRequest("GET", "/metrics");
      console.log(data);
      break;
    }

    default:
      console.log("Usage: refcli system [health|metrics]");
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Show help
  if (args.flags.help || args.flags.h) {
    console.log(`
refcli - CLI tool for managing referral codes

USAGE:
  refcli [command] [subcommand] [options]

COMMANDS:
  auth        Authentication management
    login     --endpoint <url> --key <api_key>
    logout
    whoami

  codes       Referral code management
    list      [--status active|inactive] [--domain <domain>] [--limit <n>]
    add       --code <code> --url <url> --domain <domain>
              [--title <title>] [--reward-type <type>] [--reward-value <val>]
    get       <code>
    deactivate <code> --reason <reason> [--replaced-by <new_code>]
    reactivate <code>

  research    Web research for referral codes
    run       --domain <domain> [--depth quick|thorough|deep]
    results   --domain <domain>

  system      System operations
    health    Check system health
    metrics   View system metrics

GLOBAL OPTIONS:
  --output    Output format: table, json, csv, yaml (default: table)
  --help      Show this help message

EXAMPLES:
  refcli auth login --endpoint https://api.example.com --key my-api-key
  refcli codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
  refcli codes list --status active --domain example.com
  refcli codes deactivate ABC123 --reason expired --replaced-by NEW456
  refcli research run --domain example.com --depth thorough
`);
    return;
  }

  // Route to command handler
  try {
    switch (args.command) {
      case "auth":
        await handleAuth(args);
        break;
      case "codes":
        await handleCodes(args);
        break;
      case "research":
        await handleResearch(args);
        break;
      case "system":
        await handleSystem(args);
        break;
      default:
        console.log("Usage: refcli [auth|codes|research|system] [--help]");
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run CLI
main();
