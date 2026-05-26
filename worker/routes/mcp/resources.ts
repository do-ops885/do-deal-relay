/**
 * MCP Route Handler - Resources
 *
 * Handles resources/list, resources/templates/list, and resources/read JSON-RPC methods.
 * Supports cursor-based pagination for resource listing.
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
import { paginateList, DEFAULT_PAGE_SIZE } from "../../lib/mcp/pagination";

/**
 * Handle resources/list request with cursor-based pagination
 */
export async function handleResourcesList(params?: {
  cursor?: string;
  limit?: number;
}): Promise<ResourcesListResult> {
  const resources = getResources();

  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, limit), 100);

  const { items, nextCursor } = paginateList(
    resources,
    params?.cursor,
    pageSize,
    (item) => item.uri,
  );

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
