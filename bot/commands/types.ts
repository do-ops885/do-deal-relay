/**
 * Bot Command Type Definitions
 *
 * Centralized type definitions for bot commands across all platforms.
 */

import { DealRelayAPI } from "../api-client";

// ============================================================================
// Command Types
// ============================================================================

export interface CommandContext {
  platform: "telegram" | "discord";
  userId: string;
  username?: string;
  isAdmin: boolean;
  permissions: Permission[];
}

export type Permission = "public" | "verified" | "moderator" | "admin";

export interface CommandHandler {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  permissions: Permission[];
  platforms: ("telegram" | "discord")[];
  execute: (
    ctx: CommandContext,
    args: string[],
    api: DealRelayAPI,
  ) => Promise<CommandResult>;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  buttons?: Button[];
}

export interface Button {
  text: string;
  action: string;
  data?: string;
}
