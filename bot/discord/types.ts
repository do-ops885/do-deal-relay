/**
 * Discord Bot Type Definitions
 *
 * Centralized type definitions for the Discord bot implementation.
 */

import { GuildMember } from "discord.js";

// ============================================================================
// Configuration Types
// ============================================================================

export interface DiscordBotConfig {
  botToken: string;
  clientId: string;
  guildId?: string; // Optional - for guild-specific commands
  apiUrl: string;
  apiKey?: string;
  adminRoleIds?: string[];
  moderatorRoleIds?: string[];
  verifiedRoleIds?: string[];
  allowedChannelIds?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}
