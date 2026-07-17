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
import { paginateList } from "../../lib/mcp/pagination";

/**
 * Handle resources/list request with pagination support
 */
export async function handleResourcesList(params?: {
  cursor?: string;
}): Promise<ResourcesListResult> {
  const resources = getResources();

  const PAGE_SIZE = 20;
  const { items, nextCursor } = paginateList(
    resources,
    params?.cursor,
    PAGE_SIZE,
    (resource) => resource.uri,
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
