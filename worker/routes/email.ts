import type { Env } from "../types";
import { processEmail, emailWorkerHandler } from "../email/handler";
import { createHelpEmail } from "../email/templates";
import { logger } from "../lib/global-logger";

// ============================================================================
// Email API Routes
// POST /api/email/incoming - Receive email via webhook
// POST /api/email/parse - Parse email content (testing)
// GET /api/email/help - Get help email content
// ============================================================================

export async function handleEmailIncoming(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Verify webhook signature if configured
    const signature = request.headers.get("x-webhook-signature");
    if (env.EMAIL_WEBHOOK_SECRET && signature) {
      // In production, verify HMAC signature
      // const isValid = await verifyWebhookSignature(request, env.EMAIL_WEBHOOK_SECRET);
      // if (!isValid) {
      //   return jsonResponse({ error: "Invalid signature" }, 401);
      // }
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
      return jsonResponse(
        { error: "Missing required fields: from, to, subject" },
        400,
      );
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
    return jsonResponse(
      { error: "Failed to process email", message: (error as Error).message },
      500,
    );
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
      return jsonResponse(
        { error: "Missing required fields: from, subject" },
        400,
      );
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
    return jsonResponse(
      { error: "Failed to parse email", message: (error as Error).message },
      500,
    );
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

// ============================================================================
// Utility
// ============================================================================

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
