import type { Env } from "../../types";
import type { ParsedEmail, EmailProcessingResult } from "../types";
import { validateSecurity } from "../security";
import { logger } from "../../lib/global-logger";
import { parseCommand } from "../patterns";
import {
  handleAddCommand,
  handleDeactivateCommand,
  handleSearchCommand,
  handleDigestCommand,
} from "./commands";
import { handleForwardedEmail, handleHelpCommand } from "./forwarded";

export async function processEmail(
  email: ParsedEmail,
  env: Env,
): Promise<EmailProcessingResult> {
  try {
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

    const command = parseCommand(email);
    logger.info(`Email type detected: ${command.type}`, {
      component: "email",
      command: command.type,
    });

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

  const email: ParsedEmail = {
    from: message.from,
    to: message.to.split(",").map((t) => t.trim()),
    subject: message.subject,
    text: message.text,
    html: message.html,
    dkimValid: message.headers.get("x-dkim-valid") === "true",
    spfValid: message.headers.get("x-spf-valid") === "true",
  };

  const result = await processEmail(email, env);

  logger.info(`Email processing complete: ${result.success}`, {
    component: "email-worker",
    success: result.success,
    message: result.message,
  });
}
