import { logger } from "../../lib/global-logger";
import type { Env } from "../../types";

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export async function sendEmailReply(
  to: string,
  template: EmailTemplate,
  env: Env,
): Promise<void> {
  logger.info(`Sending email reply to ${to}: ${template.subject}`, {
    component: "email",
    to,
    subject: template.subject,
  });

  const confirmationKey = `email_confirmation:${Date.now()}:${to}`;
  await env.DEALS_SOURCES.put(
    confirmationKey,
    JSON.stringify({
      to,
      subject: template.subject,
      sent_at: new Date().toISOString(),
    }),
    { expirationTtl: 7 * 24 * 60 * 60 },
  );
}
