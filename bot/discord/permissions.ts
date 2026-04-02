/**
 * Discord Bot Permission Management
 *
 * User permission checking and context creation for Discord interactions.
 */

import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { CommandContext, Permission } from "../commands/types";
import { DiscordBotConfig } from "./types";

export function getUserPermissions(
  member: GuildMember | null,
  config: DiscordBotConfig,
): Permission[] {
  if (!member) return ["public"];

  const roles = member.roles.cache.map((r) => r.id);

  // Check role-based permissions
  const isAdmin =
    config.adminRoleIds?.some((id) => roles.includes(id)) ||
    member.permissions.has(PermissionFlagsBits.Administrator);

  const isModerator =
    config.moderatorRoleIds?.some((id) => roles.includes(id)) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers);

  const isVerified = config.verifiedRoleIds?.some((id) => roles.includes(id));

  if (isAdmin) return ["public", "verified", "moderator", "admin"];
  if (isModerator) return ["public", "verified", "moderator"];
  if (isVerified) return ["public", "verified"];
  return ["public"];
}

export function createCommandContext(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
): CommandContext {
  const member = interaction.member as GuildMember | null;

  return {
    platform: "discord",
    userId: interaction.user.id,
    username: interaction.user.username,
    isAdmin:
      member?.permissions.has(PermissionFlagsBits.Administrator) || false,
    permissions: getUserPermissions(member, config),
  };
}
