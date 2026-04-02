import type { ConfirmationEmailData } from "./types";

// ============================================================================
// Email Templates
// Confirmation emails for email integration
// ============================================================================

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// ============================================================================
// Success Confirmation (Referral Added)
// ============================================================================

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

// ============================================================================
// Deactivation Confirmation
// ============================================================================

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

// ============================================================================
// Search Results Email
// ============================================================================

export function createSearchResultsEmail(
  query: string,
  results: Array<{ code: string; url: string; domain: string; status: string }>,
): EmailTemplate {
  const total = results.length;
  const subject = `Search Results: ${total} referral${total !== 1 ? "s" : ""} found`;

  let textLines = [
    `Search Results for "${query}"`,
    "",
    `Found ${total} referral${total !== 1 ? "s" : ""}:\n`,
  ];

  results.forEach((r, i) => {
    textLines.push(`${i + 1}. ${r.domain}`);
    textLines.push(`   Code: ${r.code}`);
    textLines.push(`   Link: ${r.url}`);
    textLines.push(`   Status: ${r.status}`);
    textLines.push("");
  });

  textLines.push("— Do-Deal Referral System");

  const text = textLines.join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .result { margin: 15px 0; padding: 15px; background: white; border-radius: 4px; border: 1px solid #ddd; }
    .result-number { color: #2196F3; font-weight: bold; margin-right: 10px; }
    .domain { font-weight: bold; font-size: 1.1em; }
    .code { font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    .url { word-break: break-all; color: #1976D2; font-size: 0.9em; }
    .status { color: #4CAF50; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Search Results</h1>
      <p>Query: "${query}"</p>
    </div>

    <div class="content">
      <p>Found <strong>${total}</strong> referral${total !== 1 ? "s" : ""}:</p>

      ${results
        .map(
          (r, i) => `
      <div class="result">
        <span class="result-number">${i + 1}.</span>
        <span class="domain">${r.domain}</span>
        <div style="margin-top: 8px;">
          <span class="label">Code:</span>
          <span class="code">${r.code}</span>
        </div>
        <div style="margin-top: 4px;">
          <span class="label">Link:</span>
          <span class="url">${r.url}</span>
        </div>
        <div style="margin-top: 4px;">
          <span class="label">Status:</span>
          <span class="status">${r.status}</span>
        </div>
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

  return { subject, text, html };
}

// ============================================================================
// Error Email
// ============================================================================

export function createErrorEmail(
  errorMessage: string,
  suggestions?: string[],
): EmailTemplate {
  const subject = "⚠️ Could Not Process Your Email";

  const textLines = [
    "We couldn't automatically process your email.",
    "",
    `Error: ${errorMessage}`,
    "",
  ];

  if (suggestions && suggestions.length > 0) {
    textLines.push("Suggestions:");
    suggestions.forEach((s) => textLines.push(`  • ${s}`));
    textLines.push("");
  }

  textLines.push("Please try again with a clearer format, or contact support.");
  textLines.push("");
  textLines.push("— Do-Deal Referral System");

  const text = textLines.join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .error { background: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 15px 0; }
    .suggestions { margin-top: 15px; }
    .suggestions li { margin: 8px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Processing Error</h1>
    </div>

    <div class="content">
      <p>We couldn't automatically process your email.</p>

      <div class="error">
        <strong>Error:</strong> ${errorMessage}
      </div>

      ${
        suggestions && suggestions.length > 0
          ? `
      <div class="suggestions">
        <strong>Suggestions:</strong>
        <ul>
          ${suggestions.map((s) => `<li>${s}</li>`).join("")}
        </ul>
      </div>
      `
          : ""
      }

      <p>Please try again with a clearer format, or contact support.</p>
    </div>

    <div class="footer">
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// ============================================================================
// Help Email
// ============================================================================

export function createHelpEmail(): EmailTemplate {
  const subject = "Do-Deal Email Commands Help";

  const text = `Do-Deal Referral System - Email Commands

FORWARD REFERRAL EMAILS:
Simply forward any referral email to: referrals@do-deal.app
We'll automatically extract the code and add it to your collection.

COMMANDS:

ADD - Add a referral manually
To: add@do-deal.app
Subject: Service Name
Body:
  Service: [Service Name]
  Code: [Referral Code]
  Link: [Full Referral URL]
  Reward: [Optional - e.g., "\$20 credit"]
  Expires: [Optional - e.g., "2026-12-31"]

DEACTIVATE - Mark code as inactive
To: deactivate@do-deal.app
Subject: [Service Name] [Code]
Body:
  Reason: [Why you're deactivating]

SEARCH - Find referrals
To: search@do-deal.app
Subject: [Search query]
Example: "uber rides"

DIGEST - Get summary
To: digest@do-deal.app
Subject: [daily|weekly|monthly]

HELP - Show this message
To: help@do-deal.app

IMPORTANT: Always include complete URLs (e.g., https://picnic.app/de/freunde-rabatt/DOMI6869)

— Do-Deal Referral System`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .section { margin: 20px 0; }
    .section-title { color: #2196F3; font-weight: bold; font-size: 1.1em; margin-bottom: 10px; }
    .command { background: white; padding: 12px; margin: 10px 0; border-left: 4px solid #2196F3; }
    .to { color: #666; font-size: 0.9em; }
    .important { background: #fff3e0; padding: 15px; border-radius: 4px; margin-top: 20px; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Email Commands Help</h1>
    </div>

    <div class="content">
      <div class="section">
        <div class="section-title">FORWARD REFERRAL EMAILS</div>
        <p>Simply forward any referral email to: <code>referrals@do-deal.app</code></p>
        <p>We'll automatically extract the code and add it to your collection.</p>
      </div>

      <div class="section">
        <div class="section-title">COMMANDS</div>

        <div class="command">
          <strong>ADD</strong> - Add a referral manually<br>
          <span class="to">To: add@do-deal.app</span><br>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
Service: [Service Name]
Code: [Referral Code]
Link: [Full Referral URL]
Reward: [Optional]
Expires: [Optional]</pre>
        </div>

        <div class="command">
          <strong>DEACTIVATE</strong> - Mark code as inactive<br>
          <span class="to">To: deactivate@do-deal.app</span><br>
          Subject: [Service Name] [Code]
        </div>

        <div class="command">
          <strong>SEARCH</strong> - Find referrals<br>
          <span class="to">To: search@do-deal.app</span><br>
          Subject: [Search query]
        </div>

        <div class="command">
          <strong>DIGEST</strong> - Get summary<br>
          <span class="to">To: digest@do-deal.app</span><br>
          Subject: [daily|weekly|monthly]
        </div>
      </div>

      <div class="important">
        <strong>Important:</strong> Always include <strong>complete URLs</strong><br>
        Example: <code>https://picnic.app/de/freunde-rabatt/DOMI6869</code>
      </div>
    </div>

    <div class="footer">
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// ============================================================================
// Low Confidence / Manual Review Needed
// ============================================================================

export function createLowConfidenceEmail(
  originalSubject: string,
): EmailTemplate {
  const subject = "⚠️ Referral Code Needs Manual Review";

  const text = `We received your forwarded email but couldn't automatically extract a referral code.

Original email: "${originalSubject}"

Please reply with the following information:

Service: [Service Name, e.g., Picnic, Uber, Dropbox]
Code: [Referral Code]
Link: [Complete Referral URL]
Reward: [What do you get? e.g., "\$20 credit"]
Expires: [Expiry date if known]

We'll add it to your collection once received.

— Do-Deal Referral System`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; }
    .original { background: #e3f2fd; padding: 10px; border-radius: 4px; margin: 10px 0; font-style: italic; }
    .form { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border: 2px dashed #2196F3; }
    .form-line { margin: 8px 0; font-family: monospace; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Manual Review Needed</h1>
    </div>

    <div class="content">
      <p>We received your forwarded email but couldn't automatically extract a referral code.</p>

      <div class="original">
        Original email: "${originalSubject}"
      </div>

      <p>Please reply with the following information:</p>

      <div class="form">
        <div class="form-line">Service: [Service Name, e.g., Picnic, Uber]</div>
        <div class="form-line">Code: [Referral Code]</div>
        <div class="form-line">Link: [Complete Referral URL]</div>
        <div class="form-line">Reward: [What do you get?]</div>
        <div class="form-line">Expires: [Expiry date if known]</div>
      </div>

      <p>We'll add it to your collection once received.</p>
    </div>

    <div class="footer">
      <p>— Do-Deal Referral System</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// ============================================================================
// Template Router
// ============================================================================

export function createConfirmationEmail(
  data: ConfirmationEmailData,
): EmailTemplate {
  switch (data.action) {
    case "added":
      return createSuccessConfirmation(data);
    case "deactivated":
      return createDeactivationConfirmation(
        data.service,
        data.code || "N/A",
        "User request",
      );
    case "found":
      return createSearchResultsEmail(
        data.service, // In this case, service is the query
        data.searchResults || [],
      );
    case "error":
      return createErrorEmail(
        data.errorMessage || "Unknown error",
        data.notes ? [data.notes] : undefined,
      );
    default:
      return createSuccessConfirmation(data);
  }
}
