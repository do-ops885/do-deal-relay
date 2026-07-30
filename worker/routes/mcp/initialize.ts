/**
 * MCP Route Handler - Initialize
 *
 * Handles the MCP initialize request for protocol version negotiation.
 * Implements MCP 2025-11-25 spec version negotiation:
 * - Accepts exact match for current version
 * - Accepts compatible date-based versions (same year = compatible)
 * - Negotiates to highest common supported version
 * - Rejects incompatible versions (different year) with clear error
 */

import {
  MCP_PROTOCOL_VERSION,
  type InitializeResult,
  type InitializeParams,
} from "../../lib/mcp/types";
import { SERVER_INFO, SERVER_CAPABILITIES, SERVER_INSTRUCTIONS } from "./utils";
import { logger } from "../../lib/global-logger";

/** Supported MCP protocol versions (ordered newest first). */
const SUPPORTED_VERSIONS = ["2025-11-25", "2024-11-05"];

/**
 * Parse a date-based MCP protocol version (e.g., "2025-11-25") into its year.
 */
function parseVersionYear(version: string): number | null {
  const match = version.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}

/**
 * Negotiate the highest common protocol version between client and server.
 *
 * Date-based MCP versions use the format YYYY-MM-DD.
 * Compatible versions share the same year (major).
 * Returns the negotiated version string, or null if no compatible version found.
 */
function negotiateVersion(clientVersion: string): string | null {
  const clientYear = parseVersionYear(clientVersion);
  if (clientYear === null) return null;

  for (const serverVersion of SUPPORTED_VERSIONS) {
    const serverYear = parseVersionYear(serverVersion);
    if (serverYear !== null && serverYear === clientYear) {
      return serverVersion;
    }
  }

  return null;
}

/**
 * Handle initialize request with version negotiation.
 */
export async function handleInitialize(
  params: InitializeParams,
): Promise<InitializeResult> {
  // Fast path: exact match for current version
  if (params.protocolVersion === MCP_PROTOCOL_VERSION) {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    };
  }

  // Negotiate compatible version
  const negotiated = negotiateVersion(params.protocolVersion);
  if (negotiated) {
    logger.info("MCP version negotiated", {
      component: "mcp",
      client_version: params.protocolVersion,
      negotiated_version: negotiated,
    });
    return {
      protocolVersion: negotiated,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    };
  }

  // No compatible version found — reject with supported versions list
  throw new Error(
    `Unsupported protocol version: ${params.protocolVersion}. ` +
    `Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`,
  );
}

/**
 * Handle ping request
 */
export async function handlePing(): Promise<{}> {
  return {};
}
