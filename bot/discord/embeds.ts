/**
 * Discord Bot Embed Formatting
 *
 * Rich embed creation for Discord bot responses.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { CommandResult, Button } from "../commands/types";

export function createCommandEmbed(result: CommandResult): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(result.success ? "✅ Success" : "❌ Error")
    .setDescription(result.message)
    .setColor(result.success ? 0x00ff00 : 0xff0000)
    .setTimestamp();

  return embed;
}

export function createReferralEmbed(referral: {
  code: string;
  url: string;
  domain: string;
  status: string;
  id: string;
  reward?: string;
  deactivated_at?: string;
  reason?: string;
}): EmbedBuilder {
  const statusColors: Record<string, number> = {
    active: 0x00ff00,
    quarantined: 0xffaa00,
    inactive: 0xff0000,
    expired: 0x808080,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📋 Referral: ${referral.code}`)
    .setURL(referral.url) // Complete URL as embed link
    .setColor(statusColors[referral.status] || 0x808080)
    .addFields(
      { name: "🎯 Domain", value: referral.domain, inline: true },
      { name: "📊 Status", value: referral.status, inline: true },
      { name: "🆔 ID", value: `\`${referral.id}\``, inline: false },
      { name: "🔗 URL", value: referral.url, inline: false }, // Complete URL shown
    )
    .setTimestamp();

  if (referral.reward) {
    embed.addFields({
      name: "🎁 Reward",
      value: referral.reward,
      inline: true,
    });
  }

  if (referral.deactivated_at) {
    embed.addFields({
      name: "🚫 Deactivated",
      value: new Date(referral.deactivated_at).toLocaleString(),
      inline: true,
    });
  }

  return embed;
}

export function createButtons(result: CommandResult) {
  if (!result.buttons || result.buttons.length === 0) {
    return undefined;
  }

  const buttons = result.buttons.map((btn) =>
    new ButtonBuilder()
      .setCustomId(`${btn.action}:${btn.data || ""}`)
      .setLabel(btn.text)
      .setStyle(ButtonStyle.Primary),
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}
