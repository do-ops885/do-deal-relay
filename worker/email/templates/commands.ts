import type { EmailTemplate, ConfirmationEmailData } from "./types";

export function createSuccessConfirmation(
  data: ConfirmationEmailData,
): EmailTemplate {
  const service = data.service;
  const code = data.code;
  const url = data.referralUrl;
  const reward = data.reward;
  const expiry = data.expiry;
  const confidence = Math.round(data.confidence * 100);

  const subject = `✓ Added: ${service} Referral`;

  const textLines = [
    `Your ${service} referral has been successfully added!`,
    "",
    "Details:",
    `  Service: ${service}`,
    code ? `  Code: ${code}` : "",
    url ? `  Link: ${url}` : "",
    reward ? `  Reward: ${reward}` : "",
    expiry ? `  Expires: ${expiry}` : "",
    "",
    `Extraction confidence: ${confidence}%`,
    "",
    "Reply with DEACTIVATE to mark this code as inactive.",
    "",
    "— Do-Deal Referral System",
  ];

  const text = textLines.filter(Boolean).join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .detail { margin: 12px 0; padding: 8px; background: white; border-left: 4px solid #4CAF50; }
    .label { font-weight: bold; color: #333; display: inline-block; width: 80px; }
    .value { font-family: monospace; }
    .url { word-break: break-all; color: #1976D2; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
    .confidence { color: #666; font-size: 0.9em; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Referral Added</h1>
    </div>

    <div class="content">
      <p>Your <strong>${service}</strong> referral has been successfully added!</p>

      ${
        code
          ? `
      <div class="detail">
        <span class="label">Code:</span>
        <span class="value">${code}</span>
      </div>
      `
          : ""
      }

      ${
        url
          ? `
      <div class="detail">
        <span class="label">Link:</span>
        <span class="value url">${url}</span>
      </div>
      `
          : ""
      }

      ${
        reward
          ? `
      <div class="detail">
        <span class="label">Reward:</span>
        <span class="value">${reward}</span>
      </div>
      `
          : ""
      }

      ${
        expiry
          ? `
      <div class="detail">
        <span class="label">Expires:</span>
        <span class="value">${expiry}</span>
      </div>
      `
          : ""
      }

      <p class="confidence">Extraction confidence: ${confidence}%</p>
    </div>

    <div class="footer">
      <p>Reply with <strong>DEACTIVATE ${service}</strong> to mark this code as inactive.</p>
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function createDeactivationConfirmation(
  service: string,
  code: string,
  reason: string,
): EmailTemplate {
  const subject = `✓ Deactivated: ${service}`;

  const text = `Your ${service} referral has been deactivated.

Details:
  Service: ${service}
  Code: ${code}
  Reason: ${reason}

This code will no longer appear in search results.

Reply with REACTIVATE ${service} to reactivate this code.

— Do-Deal Referral System`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .detail { margin: 12px 0; padding: 8px; background: white; border-left: 4px solid #f44336; }
    .label { font-weight: bold; color: #333; display: inline-block; width: 80px; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Referral Deactivated</h1>
    </div>

    <div class="content">
      <p>Your <strong>${service}</strong> referral has been deactivated.</p>

      <div class="detail">
        <span class="label">Service:</span>
        <span>${service}</span>
      </div>

      <div class="detail">
        <span class="label">Code:</span>
        <span style="font-family: monospace;">${code}</span>
      </div>

      <div class="detail">
        <span class="label">Reason:</span>
        <span>${reason}</span>
      </div>

      <p style="margin-top: 15px; color: #666;">This code will no longer appear in search results.</p>
    </div>

    <div class="footer">
      <p>Reply with <strong>REACTIVATE ${service}</strong> to reactivate this code.</p>
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
