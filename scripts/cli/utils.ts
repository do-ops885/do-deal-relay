/**
 * CLI Utilities
 * Utility functions for parsing arguments, formatting output, and HTTP requests
 */

import { ParsedArgs, ParsedReferralUrl } from "./types.js";
import { config } from "./config.js";

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[]): ParsedArgs {
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

/**
 * Parse a referral URL to extract domain, code, and path
 */
export function parseReferralUrl(input: string): ParsedReferralUrl | null {
  try {
    // Ensure it starts with protocol
    let urlStr = input.trim();
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      urlStr = "https://" + urlStr;
    }

    const url = new URL(urlStr);
    const domain = url.hostname.replace(/^www\./, "");
    const path = url.pathname;

    // Extract code from path (last segment after last /)
    const segments = path.split("/").filter((s) => s.length > 0);
    const lastSegment = segments[segments.length - 1] || "";

    // Code should be alphanumeric and at least 4 chars
    const codeMatch = lastSegment.match(/^[A-Z0-9]{4,}$/i);
    const code = codeMatch ? codeMatch[0].toUpperCase() : lastSegment;

    if (!code || code.length < 3) {
      return null;
    }

    return { url: urlStr, domain, code, path };
  } catch {
    return null;
  }
}

/**
 * Make an HTTP request to the API
 */
export async function apiRequest(
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

/**
 * Format data as a table
 */
function formatTable(data: unknown[]): string {
  if (data.length === 0) return "No data";

  const firstRow = data[0] as Record<string, unknown>;
  const keys = Object.keys(firstRow);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = Math.max(
      key.length,
      ...data.map(
        (row) => String((row as Record<string, unknown>)[key] || "").length,
      ),
    );
  }

  // Build header
  const header = keys.map((k) => k.padEnd(widths[k])).join(" | ");
  const separator = keys.map((k) => "-".repeat(widths[k])).join("-+-");

  // Build rows
  const rows = data.map((row) =>
    keys
      .map((k) =>
        String((row as Record<string, unknown>)[k] || "").padEnd(widths[k]),
      )
      .join(" | "),
  );

  return [header, separator, ...rows].join("\n");
}

/**
 * Format output based on the specified format
 */
export function formatOutput(data: unknown, format: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "csv":
      if (Array.isArray(data)) {
        if (data.length === 0) return "";
        const keys = Object.keys(data[0] as object);
        const header = keys.join(",");
        const rows = data.map((row) =>
          keys
            .map((k) => JSON.stringify((row as Record<string, unknown>)[k]))
            .join(","),
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
