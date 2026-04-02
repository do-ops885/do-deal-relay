import type { Env, ReferralInput } from "../../types";
import type {
  ParsedEmail,
  ParsedCommand,
  EmailProcessingResult,
  ConfirmationEmailData,
} from "../types";
import {
  createHelpEmail,
  createConfirmationEmail,
  createSearchResultsEmail,
  createDeactivationConfirmation,
} from "../templates";
import { generateDealId } from "../../lib/crypto";
import {
  storeReferralInput,
  getReferralByCode,
  searchReferrals,
  deactivateReferral,
} from "../../lib/referral-storage";
import { logger } from "../../lib/global-logger";
import { sendEmailReply } from "./utils";

export async function handleAddCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  if (!command.service) {
    const template = createHelpEmail();
    await sendEmailReply(email.from, template, env);

    return {
      success: false,
      message: "Missing required field: service",
      confirmationSent: true,
      error: "Service name is required. See help email sent.",
    };
  }

  if (!command.code && !command.referralUrl) {
    const template = createHelpEmail();
    await sendEmailReply(email.from, template, env);

    return {
      success: false,
      message: "Missing required field: code or referral URL",
      confirmationSent: true,
      error: "Either code or referral URL is required. See help email sent.",
    };
  }

  if (command.code) {
    const existing = await getReferralByCode(env, command.code);
    if (existing) {
      return {
        success: false,
        message: "Referral code already exists",
        confirmationSent: false,
        error: `Code ${command.code} already exists (ID: ${existing.id})`,
      };
    }
  }

  const id = await generateDealId(
    "email",
    command.code || "manual",
    "referral",
  );
  const now = new Date().toISOString();

  let domain = command.service.toLowerCase();
  if (command.referralUrl) {
    try {
      const urlObj = new URL(command.referralUrl);
      domain = urlObj.hostname.replace(/^www\./, "");
    } catch {
      // Use service name as domain if URL parsing fails
    }
  }

  const referral: ReferralInput = {
    id,
    code: command.code || `manual-${Date.now()}`,
    url: command.referralUrl || "",
    domain,
    source: "manual",
    status: "quarantined",
    submitted_at: now,
    submitted_by: email.from,
    expires_at: command.expiry,
    metadata: {
      title: `${command.service} Referral`,
      description: `Referral code for ${command.service}`,
      reward_type: "unknown",
      reward_value: command.reward,
      category: command.category ? [command.category] : ["general"],
      tags: ["email", "manual-add"],
      requirements: [],
      confidence_score: 0.8,
      notes: command.notes,
    },
  };

  await storeReferralInput(env, referral);

  logger.info(`Referral added via email: ${referral.code}`, {
    component: "email",
    referral_id: referral.id,
    domain: referral.domain,
  });

  const confirmationData: ConfirmationEmailData = {
    service: command.service,
    code: command.code || null,
    referralUrl: command.referralUrl || null,
    reward: command.reward || null,
    expiry: command.expiry || null,
    confidence: 0.8,
    source: "email",
    action: "added",
  };

  const template = createConfirmationEmail(confirmationData);
  await sendEmailReply(email.from, template, env);

  return {
    success: true,
    message: "Referral added successfully",
    referralId: referral.id,
    confirmationSent: true,
  };
}

export async function handleDeactivateCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  const code = command.code;

  if (!code) {
    return {
      success: false,
      message: "Missing required field: code",
      confirmationSent: false,
      error: "Referral code is required for deactivation",
    };
  }

  const referral = await getReferralByCode(env, code);

  if (!referral) {
    return {
      success: false,
      message: "Referral not found",
      confirmationSent: false,
      error: `No referral found with code: ${code}`,
    };
  }

  await deactivateReferral(
    env,
    code,
    (command.reason as ReferralInput["deactivated_reason"]) || "user_request",
    undefined,
    command.notes,
  );

  logger.info(`Referral deactivated via email: ${code}`, {
    component: "email",
    code,
    reason: command.reason,
  });

  const template = createDeactivationConfirmation(
    referral.domain,
    referral.code,
    command.reason || "User request",
  );
  await sendEmailReply(email.from, template, env);

  return {
    success: true,
    message: "Referral deactivated successfully",
    confirmationSent: true,
  };
}

export async function handleSearchCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  const query = command.query || command.service || "";

  if (!query) {
    return {
      success: false,
      message: "Missing search query",
      confirmationSent: false,
      error: "Search query is required",
    };
  }

  const { referrals } = await searchReferrals(env, {
    domain: query,
    status: "all",
    limit: 20,
  });

  logger.info(
    `Search performed via email: "${query}" (${referrals.length} results)`,
    {
      component: "email",
      query,
      results: referrals.length,
    },
  );

  const searchResults = referrals.map((r) => ({
    code: r.code,
    url: r.url,
    domain: r.domain,
    status: r.status,
  }));

  const template = createSearchResultsEmail(query, searchResults);
  await sendEmailReply(email.from, template, env);

  return {
    success: true,
    message: `Found ${referrals.length} referral(s)`,
    confirmationSent: true,
  };
}

export async function handleDigestCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  const frequency = command.frequency || "weekly";

  const { referrals } = await searchReferrals(env, {
    status: "active",
    limit: 50,
  });

  const lines = [
    `Your ${frequency} Referral Digest`,
    "",
    `You have ${referrals.length} active referral(s):`,
    "",
  ];

  referrals.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.domain}`);
    lines.push(`   Code: ${r.code}`);
    lines.push(`   URL: ${r.url}`);
    if (r.metadata.reward_value) {
      lines.push(`   Reward: ${r.metadata.reward_value}`);
    }
    lines.push("");
  });

  const text = lines.join("\n");
  const subject = `Your ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Referral Digest`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .referral { margin: 15px 0; padding: 15px; background: white; border-radius: 4px; border: 1px solid #ddd; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Your ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest</h1>
    </div>
    <div class="content">
      <p>You have <strong>${referrals.length}</strong> active referral(s):</p>
      ${referrals
        .map(
          (r) => `
      <div class="referral">
        <strong>${r.domain}</strong><br>
        Code: ${r.code}<br>
        URL: <a href="${r.url}">${r.url}</a><br>
        ${r.metadata.reward_value ? `Reward: ${r.metadata.reward_value}` : ""}
      </div>
      `,
        )
        .join("")}
    </div>
    <div class="footer">
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  await sendEmailReply(email.from, { subject, text, html }, env);

  return {
    success: true,
    message: `Digest sent with ${referrals.length} referrals`,
    confirmationSent: true,
  };
}
