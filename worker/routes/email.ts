import type { Env } from "../types";
import { processEmail, emailWorkerHandler } from "../email/handler";
import { createHelpEmail } from "../email/templates";
import { logger } from "../lib/global-logger";
import { verifyHmacSignature, parseSignatureHeader } from "../lib/hmac";
import { unauthorizedResponse, errorResponse, jsonResponse } from "./utils";

// ============================================================================
// Email API Routes
// POST /api/email/incoming - Receive email via webhook
// POST /api/email/parse - Parse email content (testing)
// GET /api/email/help - Get help email content
// ============================================================================

/**
 * Verify webhook signature for email endpoints
 */
async function verifyEmailWebhook(
  request: Request,
  secret: string,
): Promise<{ valid: boolean; error?: string }> {
  const signatureHeader = request.headers.get("x-webhook-signature");
  const timestampHeader = request.headers.get("x-webhook-timestamp");

  if (!signatureHeader || !timestampHeader) {
    return { valid: false, error: "Missing signature or timestamp headers" };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return { valid: false, error: "Invalid signature header format" };
  }

  const body = await request.clone().text();
  const timestamp = parseInt(timestampHeader, 10);

  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp" };
  }

  const result = await verifyHmacSignature(
    body,
    parsed.signature,
    secret,
    timestamp,
  );
  return result;
}

export async function handleEmailIncoming(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Verify webhook signature if configured (CRITICAL SECURITY FIX)
    if (env.EMAIL_WEBHOOK_SECRET) {
      const verification = await verifyEmailWebhook(
        request,
        env.EMAIL_WEBHOOK_SECRET,
      );
      if (!verification.valid) {
        logger.warn("Email webhook signature verification failed", {
          component: "email-api",
          error: verification.error,
        });
        return unauthorizedResponse("Invalid webhook signature");
      }
    }

    // Parse email from request body
    const body = (await request.json()) as {
      from: string;
      to: string;
      subject: string;
      text?: string;
      html?: string;
      headers?: Record<string, string>;
    };

    // Validate required fields
    if (!body.from || !body.to || !body.subject) {
      return errorResponse("Missing required fields: from, to, subject", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.from)) {
      return errorResponse("Invalid from email format", 400);
    }

    // Process the email
    const result = await processEmail(
      {
        from: body.from,
        to: body.to.split(",").map((t) => t.trim()),
        subject: body.subject,
        text: body.text,
        html: body.html,
        headers: body.headers,
      },
      env,
    );

    return jsonResponse(
      {
        success: result.success,
        message: result.message,
        referralId: result.referralId,
        extracted: result.extracted,
        confirmationSent: result.confirmationSent,
      },
      result.success ? 200 : 400,
    );
  } catch (error) {
    logger.error(`Email incoming error: ${(error as Error).message}`, {
      component: "email-api",
    });
    return errorResponse("Failed to process email", 500, {
      message: (error as Error).message,
    });
  }
}

/**
 * Parse email endpoint - for testing email parsing
 */
export async function handleEmailParse(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      from: string;
      to: string;
      subject: string;
      text?: string;
      html?: string;
    };

    if (!body.from || !body.subject) {
      return errorResponse("Missing required fields: from, subject", 400);
    }

    // Import extraction and command parsing functions
    const { extractReferralFromEmail } = await import("../email/extraction");
    const { parseCommand } = await import("../email/patterns/index");

    const email = {
      from: body.from,
      to: body.to
        ? body.to.split(",").map((t) => t.trim())
        : ["test@example.com"],
      subject: body.subject,
      text: body.text,
      html: body.html,
    };

    const extraction = extractReferralFromEmail(email);
    const command = parseCommand(email);

    return jsonResponse({
      extraction,
      command,
      email: {
        from: email.from,
        to: email.to,
        subject: email.subject,
        hasText: !!email.text,
        hasHtml: !!email.html,
      },
    });
  } catch (error) {
    logger.error(`Email parse error: ${(error as Error).message}`, {
      component: "email-api",
    });
    return errorResponse("Failed to parse email", 500, {
      message: (error as Error).message,
    });
  }
}

/**
 * Get help email content
 */
export async function handleEmailHelp(): Promise<Response> {
  const template = createHelpEmail();
  return jsonResponse({
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

/**
 * Cloudflare Email Worker handler export
 * This is the entry point for Cloudflare Email Workers
 */
export async function handleEmailWorker(
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
  await emailWorkerHandler(message, env);
}
