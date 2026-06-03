/**
 * JWT Utilities
 *
 * Provides token hashing and family generation for refresh token management.
 * Uses Web Crypto API for secure hashing.
 *
 * @module worker/lib/jwt
 */

import { sha256, generateUUID } from "./crypto";

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Functions
// ============================================================================

/**
 * Hash a refresh token for secure storage.
 * Never store plaintext tokens - always hash before storage.
 *
 * @param token - The plaintext refresh token to hash
 * @returns SHA-256 hash of the token
 */
export async function hashRefreshToken(token: string): Promise<string> {
  return sha256(token);
}

/**
 * Generate a unique token family identifier.
 * Each login creates a new family; rotation extends within the same family.
 *
 * @returns Unique family identifier (UUID v4)
 */
export function generateTokenFamily(): string {
  return generateUUID();
}

/**
 * Generate a cryptographically secure refresh token.
 *
 * @returns Random refresh token string
 */
export function generateRefreshToken(): string {
  return generateUUID();
}
