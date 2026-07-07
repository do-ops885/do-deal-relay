/**
 * Middleware Pipeline Types
 *
 * Central type definitions for the centralized middleware architecture.
 * See: plans/ADR-016-centralized-middleware-architecture.md
 */

import type { Env } from "../../types";

// ============================================================================
// Auth Tiers
// ============================================================================

/**
 * Authentication tiers for route protection.
 *
 * - `public`: No authentication required.
 * - `api-key`: Requires a valid API key via Bearer token or X-API-Key header.
 * - `internal`: Requires admin-level authentication (role: "admin").
 */
export type AuthTier = "public" | "api-key" | "internal";

// ============================================================================
// HTTP Methods
// ============================================================================

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// ============================================================================
// Route Configuration
// ============================================================================

/**
 * Configuration for a single route registered through the middleware pipeline.
 */
export interface RouteConfig {
  /** HTTP method */
  method: HttpMethod | HttpMethod[];
  /** Route path pattern (supports `:param` placeholders) */
  path: string;
  /** Route handler function */
  handler: RouteHandler;
  /** Authentication tier required */
  auth: AuthTier;
  /** Optional rate limit configuration (overrides endpoint defaults) */
  rateLimit?: {
    /** Time window in seconds */
    windowSeconds: number;
    /** Maximum requests within the window */
    maxRequests: number;
    /** Custom key prefix for rate limit storage */
    keyPrefix?: string;
  };
  /** Optional body size limit in bytes */
  bodySizeLimit?: number;
  /** Human-readable description for auto-generated API docs */
  description: string;
}

// ============================================================================
// Route Handler Signature
// ============================================================================

/**
 * Unified handler signature for pipeline-registered routes.
 * Receives the request, env, and matched route params.
 */
export type RouteHandler = (
  request: Request,
  env: Env,
  params: RouteParams,
) => Promise<Response>;

// ============================================================================
// Route Matching
// ============================================================================

/**
 * Extracted route parameters (path variable values).
 */
export interface RouteParams {
  [key: string]: string;
}

/**
 * Result of matching a request against registered routes.
 */
export interface RouteMatch {
  /** The matched route configuration */
  config: RouteConfig;
  /** Extracted path parameters */
  params: RouteParams;
}

// ============================================================================
// Middleware Function Signatures
// ============================================================================

/**
 * A middleware function that can short-circuit by returning a Response,
 * or pass through by returning null.
 */
export type MiddlewareFn = (
  request: Request,
  env: Env,
  config: RouteConfig,
  params: RouteParams,
) => Promise<Response | null>;

/**
 * Pipeline context passed through middleware chain.
 */
export interface PipelineContext {
  request: Request;
  env: Env;
  config: RouteConfig;
  params: RouteParams;
}
