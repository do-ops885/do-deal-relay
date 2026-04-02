import type { Env, ReferralInput } from "../../types";
import type {
  ParsedEmail,
  ParsedCommand,
  EmailProcessingResult,
  ConfirmationEmailData,
} from "../types";
import { createHelpEmail, createLowConfidenceEmail } from "../templates";
import { generateDealId } from "../../lib/crypto";
import {
  storeReferralInput,
  getReferralByCode,
  searchReferrals,
} from "../../lib/referral-storage";
import { logger } from "../../lib/global-logger";
import { extractReferralFromEmail } from "../extraction";
import { sendEmailReply } from "./utils";
import { createConfirmationEmail } from "../templates";

export async function handleForwardedEmail(
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  logger.info("Processing forwarded email", {
    component: "email",
    subject: email.subject,
  });

  const extraction = extractReferralFromEmail(email);

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

  if (extraction.code) {
    const existing = await getReferralByCode(env, extraction.code);
    if (existing) {
      logger.info(`Duplicate code detected: ${extraction.code}`, {
        component: "email",
        existing_id: existing.id,
      });

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

  const id = await generateDealId(
    "email",
    extraction.code || "auto",
    "referral",
  );
  const now = new Date().toISOString();

  let domain = extraction.service.toLowerCase().replace(/\s+/g, "");
  if (extraction.referralUrl) {
    try {
      const urlObj = new URL(extraction.referralUrl);
      domain = urlObj.hostname.replace(/^www\./, "");
    } catch {
      // Use service name if URL parsing fails
    }
  }

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

export async function handleHelpCommand(
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
