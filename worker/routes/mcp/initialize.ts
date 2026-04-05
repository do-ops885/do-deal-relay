/**
 * MCP Route Handler - Initialize
 *
 * Handles the MCP initialize request for protocol version negotiation.
 */

import {
  MCP_PROTOCOL_VERSION,
  type InitializeResult,
  type InitializeParams,
} from "../../lib/mcp/types";
import { SERVER_INFO, SERVER_CAPABILITIES, SERVER_INSTRUCTIONS } from "./utils";

/**
 * Handle initialize request
 */
export async function handleInitialize(
  params: InitializeParams,
): Promise<InitializeResult> {
  // Negotiate protocol version - reject if incompatible
  if (params.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocol version: ${params.protocolVersion}. Expected: ${MCP_PROTOCOL_VERSION}`,
    );
  }

  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: SERVER_INSTRUCTIONS,
  };
}

/**
 * Handle ping request
 */
export async function handlePing(): Promise<{}> {
  return {};
}
