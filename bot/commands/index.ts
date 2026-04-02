/**
 * Command Registry and Main Export
 *
 * Central command registry with lookup utilities.
 */

import {
  CommandContext,
  CommandHandler,
  Permission,
  CommandResult,
  Button,
} from "./types";

// Import all command modules
import {
  addCommand,
  searchCommand,
  getCommand,
  deactivateCommand,
  reactivateCommand,
} from "./referral";
import { researchCommand } from "./research";
import { statsCommand, helpCommand, startCommand } from "./admin";

// Re-export types
export type {
  CommandContext,
  CommandHandler,
  Permission,
  CommandResult,
  Button,
} from "./types";

// Re-export utilities
export { getErrorMessage, formatDate } from "./utils";

// ============================================================================
// Permission Helper
// ============================================================================

export function hasPermission(
  ctx: CommandContext,
  required: Permission[],
): boolean {
  // Admin has all permissions
  if (ctx.isAdmin) return true;

  // Check if user has any of the required permissions
  return required.some((perm) => ctx.permissions.includes(perm));
}

// ============================================================================
// Command Registry
// ============================================================================

export const commands: CommandHandler[] = [
  addCommand,
  searchCommand,
  getCommand,
  deactivateCommand,
  reactivateCommand,
  researchCommand,
  statsCommand,
  helpCommand,
  startCommand,
];

// ============================================================================
// Command Lookup
// ============================================================================

export function findCommand(
  name: string,
  platform: "telegram" | "discord",
): CommandHandler | undefined {
  const normalizedName = name.toLowerCase().replace(/^\//, "");

  return commands.find(
    (cmd) =>
      cmd.platforms.includes(platform) &&
      (cmd.name === normalizedName || cmd.aliases?.includes(normalizedName)),
  );
}

// ============================================================================
// Parse Command Arguments
// ============================================================================

export function parseCommandArgs(input: string): {
  command: string;
  args: string[];
} {
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase().replace(/^\//, "");
  const args = parts.slice(1);

  return { command, args };
}
