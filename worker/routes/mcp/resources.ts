/**
 * MCP Route Handler - Resources
 *
 * Handles resources/list, resources/templates/list, and resources/read JSON-RPC methods.
 */

import type { Env } from "../../types";
import {
  type ResourcesListResult,
  type ResourceTemplatesListResult,
  type ResourceReadResult,
  type ResourceReadParams,
} from "../../lib/mcp/types";
import {
  getResources,
  getResourceTemplates,
  readResource,
} from "../../lib/mcp/resources";
import { paginate } from "../../lib/mcp/utils";

/**
 * Handle resources/list request with pagination support
 */
export async function handleResourcesList(params?: {
  cursor?: string;
}): Promise<ResourcesListResult> {
  const resources = getResources();

  const PAGE_SIZE = 5;
  const { items, nextCursor } = paginate(resources, params?.cursor, PAGE_SIZE);

  return { resources: items, nextCursor };
}

/**
 * Handle resources/templates/list request
 */
export async function handleResourceTemplatesList(): Promise<ResourceTemplatesListResult> {
  const resourceTemplates = getResourceTemplates();
  return { resourceTemplates };
}

/**
 * Handle resources/read request
 */
export async function handleResourceRead(
  params: ResourceReadParams,
  env: Env,
): Promise<ResourceReadResult> {
  const { uri } = params;
  return readResource(uri, env);
}
