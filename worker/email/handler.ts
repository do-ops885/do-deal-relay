import type { Env, ReferralInput } from "../types";
import type {
  ParsedEmail,
  ParsedCommand,
  EmailProcessingResult,
  ConfirmationEmailData,
} from "./types";
import { validateSecurity } from "./security";
import { extractReferralFromEmail, parseCommand } from "./extraction";
import {
  createConfirmationEmail,
  createHelpEmail,
  createLowConfidenceEmail,
  createSearchResultsEmail,
  createDeactivationConfirmation,
} from "./templates";
import { generateDealId } from "../lib/crypto";
import {
  storeReferralInput,
  getReferralByCode,
  searchReferrals,
  deactivateReferral,
} from "../lib/referral-storage";
import { logger } from "../lib/global-logger";

// ============================================================================
// Main Email Handler
// ============================================================================

/**
 * Process an incoming email
 * Handles security validation, parsing, extraction, and storage
 */
export async function processEmail(
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  try {
    // 1. Security validation
    logger.info("Validating email security", {
      component: "email",
      from: email.from,
      subject: email.subject,
    });

    const securityResult = await validateSecurity(email, env);
    if (!securityResult.valid) {
      logger.warn(`Email rejected: ${securityResult.reason}`, {
        component: "email",
        from: email.from,
      });

      return {
        success: false,
        message: `Security check failed: ${securityResult.reason}`,
        confirmationSent: false,
        error: securityResult.reason,
      };
    }

    // 2. Determine command type
    const command = parseCommand(email);
    logger.info(`Email type detected: ${command.type}`, {
      component: "email",
      command: command.type,
    });

    // 3. Process based on command type
    switch (command.type) {
      case "ADD":
        return handleAddCommand(command, email, env);

      case "DEACTIVATE":
        return handleDeactivateCommand(command, email, env);

      case "SEARCH":
        return handleSearchCommand(command, email, env);

      case "DIGEST":
        return handleDigestCommand(command, email, env);

      case "HELP":
        return handleHelpCommand(email, env);

      case "FORWARDED":
        return handleForwardedEmail(email, env);

      default:
        // Try to extract referral from unknown email
        return handleForwardedEmail(email, env);
    }
  } catch (error) {
    const err = error as Error;
    logger.error(`Email processing error: ${err.message}`, {
      component: "email",
      from: email.from,
      error: err.stack,
    });

    return {
      success: false,
      message: "Internal processing error",
      confirmationSent: false,
      error: err.message,
    };
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle ADD command - manually add a referral
 */
async function handleAddCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  // Validate required fields
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

  // Check for duplicate code
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

  // Create referral
  const id = await generateDealId(
    "email",
    command.code || "manual",
    "referral",
  );
  const now = new Date().toISOString();

  // Extract domain from URL if provided
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

  // Store referral
  await storeReferralInput(env, referral);

  logger.info(`Referral added via email: ${referral.code}`, {
    component: "email",
    referral_id: referral.id,
    domain: referral.domain,
  });

  // Send confirmation
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

/**
 * Handle DEACTIVATE command
 */
async function handleDeactivateCommand(
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

  // Get the referral
  const referral = await getReferralByCode(env, code);

  if (!referral) {
    return {
      success: false,
      message: "Referral not found",
      confirmationSent: false,
      error: `No referral found with code: ${code}`,
    };
  }

  // Update status
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

  // Send confirmation
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

/**
 * Handle SEARCH command
 */
async function handleSearchCommand(
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

  // Search referrals
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

  // Send results
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

/**
 * Handle DIGEST command
 */
async function handleDigestCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  const frequency = command.frequency || "weekly";

  // Get active referrals for digest
  const { referrals } = await searchReferrals(env, {
    status: "active",
    limit: 50,
  });

  // Format digest content
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

/**
 * Handle HELP command
 */
async function handleHelpCommand(
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  const template = createHelpEmail();
  await sendEmailReply(email.from, template, env);

  return {
    success: true,
    message: "Help email sent",
    confirmationSent: true,
  };
}

/**
 * Handle forwarded referral emails - auto extract
 */
async function handleForwardedEmail(
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  logger.info("Processing forwarded email", {
    component: "email",
    subject: email.subject,
  });

  // Extract referral information
  const extraction = extractReferralFromEmail(email);

  // If confidence is too low, ask for manual input
  if (extraction.confidence === 0) {
    logger.warn(
      "Could not extract referral from email, requesting manual input",
      {
        component: "email",
        subject: email.subject,
      },
    );

    const template = createLowConfidenceEmail(email.subject);
    await sendEmailReply(email.from, template, env);

    return {
      success: false,
      message: "Could not automatically extract referral code",
      confirmationSent: true,
      error: "Low confidence extraction - manual input requested",
    };
  }

  // Check for duplicate code
  if (extraction.code) {
    const existing = await getReferralByCode(env, extraction.code);
    if (existing) {
      logger.info(`Duplicate code detected: ${extraction.code}`, {
        component: "email",
        existing_id: existing.id,
      });

      // Send info about duplicate
      const errorData: ConfirmationEmailData = {
        service: extraction.service,
        code: extraction.code,
        referralUrl: extraction.referralUrl,
        reward: extraction.reward,
        expiry: extraction.expiry,
        confidence: extraction.confidence,
        source: "email",
        action: "error",
        errorMessage: `This code already exists (ID: ${existing.id})`,
      };
      const template = createConfirmationEmail(errorData);
      await sendEmailReply(email.from, template, env);

      return {
        success: false,
        message: "Referral code already exists",
        confirmationSent: true,
        error: "Duplicate code",
      };
    }
  }

  // CRITICAL: Must have a referral URL or code
  if (!extraction.referralUrl && !extraction.code) {
    const template = createLowConfidenceEmail(email.subject);
    await sendEmailReply(email.from, template, env);

    return {
      success: false,
      message: "Could not extract referral URL or code",
      confirmationSent: true,
      error: "No referral information found",
    };
  }

  // Generate referral ID
  const id = await generateDealId(
    "email",
    extraction.code || "auto",
    "referral",
  );
  const now = new Date().toISOString();

  // Extract domain from URL or service name
  let domain = extraction.service.toLowerCase().replace(/\s+/g, "");
  if (extraction.referralUrl) {
    try {
      const urlObj = new URL(extraction.referralUrl);
      domain = urlObj.hostname.replace(/^www\./, "");
    } catch {
      // Use service name if URL parsing fails
    }
  }

  // Create and store referral
  const referral: ReferralInput = {
    id,
    code: extraction.code || `auto-${Date.now()}`,
    url: extraction.referralUrl || "",
    domain,
    source: "manual",
    status: "quarantined",
    submitted_at: now,
    submitted_by: email.from,
    expires_at: extraction.expiry || undefined,
    metadata: {
      title: `${extraction.service} Referral`,
      description: `Auto-extracted from email forwarded by ${email.from}`,
      reward_type: "unknown",
      reward_value: extraction.reward || undefined,
      category: ["general"],
      tags: ["email", "auto-extracted"],
      requirements: [],
      confidence_score: extraction.confidence,
      notes: `Extracted using ${extraction.method} method from forwarded email`,
    },
  };

  await storeReferralInput(env, referral);

  logger.info(`Referral extracted and stored: ${referral.id}`, {
    component: "email",
    referral_id: referral.id,
    service: extraction.service,
    confidence: extraction.confidence,
  });

  // Send confirmation
  const confirmationData: ConfirmationEmailData = {
    service: extraction.service,
    code: extraction.code,
    referralUrl: extraction.referralUrl,
    reward: extraction.reward,
    expiry: extraction.expiry,
    confidence: extraction.confidence,
    source: "email_forward",
    action: "added",
  };

  const template = createConfirmationEmail(confirmationData);
  await sendEmailReply(email.from, template, env);

  return {
    success: true,
    message: "Referral extracted and stored successfully",
    referralId: referral.id,
    extracted: extraction,
    confirmationSent: true,
  };
}

// ============================================================================
// Email Sending
// ============================================================================

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

/**
 * Send email reply
 * In Cloudflare Workers, this would integrate with an email service
 */
async function sendEmailReply(
  to: string,
  template: EmailTemplate,
  env: Env,
): Promise<void> {
  logger.info(`Sending email reply to ${to}: ${template.subject}`, {
    component: "email",
    to,
    subject: template.subject,
  });

  // In production, integrate with SendGrid/Mailgun/AWS SES
  // For now, we log the email content for debugging

  // Store confirmation in KV for tracking
  const confirmationKey = `email_confirmation:${Date.now()}:${to}`;
  await env.DEALS_SOURCES.put(
    confirmationKey,
    JSON.stringify({
      to,
      subject: template.subject,
      sent_at: new Date().toISOString(),
    }),
    { expirationTtl: 7 * 24 * 60 * 60 }, // 7 days
  );
}

// ============================================================================
// Cloudflare Email Worker Entry Point
// ============================================================================

/**
 * Main entry point for Cloudflare Email Workers
 */
export async function emailWorkerHandler(
  message: {
    from: string;
    to: string;
    subject: string;
    headers: Headers;
    text?: string;
    html?: string;
    raw?: () => Promise<ReadableStream>;
  },
  env: Env,
): Promise<void> {
  logger.info(`Email received from ${message.from}`, {
    component: "email-worker",
    from: message.from,
    subject: message.subject,
  });

  // Parse email
  const email: ParsedEmail = {
    from: message.from,
    to: message.to.split(",").map((t) => t.trim()),
    subject: message.subject,
    text: message.text,
    html: message.html,
    dkimValid: message.headers.get("x-dkim-valid") === "true",
    spfValid: message.headers.get("x-spf-valid") === "true",
  };

  // Process email
  const result = await processEmail(email, env);

  logger.info(`Email processing complete: ${result.success}`, {
    component: "email-worker",
    success: result.success,
    message: result.message,
  });
}
