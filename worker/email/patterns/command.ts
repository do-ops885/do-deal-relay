import type { ParsedCommand } from "../types";

export function parseCommand(email: {
  subject: string;
  text?: string;
  to: string[];
}): ParsedCommand {
  const subject = email.subject.toLowerCase().trim();
  const body = (email.text || "").toLowerCase();
  const recipient = email.to[0]?.toLowerCase() || "";

  // Check for explicit command addresses first
  if (recipient.includes("add@")) {
    return parseAddCommand(subject, body);
  }

  if (recipient.includes("deactivate@")) {
    return parseDeactivateCommand(subject, body);
  }

  if (recipient.includes("search@")) {
    return { type: "SEARCH", query: subject };
  }

  if (recipient.includes("digest@")) {
    const frequencyMatch = subject.match(/daily|weekly|monthly/);
    const frequency = (frequencyMatch ? frequencyMatch[0] : "weekly") as
      | "daily"
      | "weekly"
      | "monthly";
    return { type: "DIGEST", frequency };
  }

  if (recipient.includes("help@")) {
    return { type: "HELP" };
  }

  // Check for command keywords in subject
  if (subject.startsWith("add ") || subject.startsWith("add:")) {
    return parseAddCommand(subject, body);
  }

  if (subject.startsWith("deactivate ") || subject.startsWith("deactivate:")) {
    return parseDeactivateCommand(subject, body);
  }

  if (subject.startsWith("search ") || subject.startsWith("search:")) {
    const query = subject.replace(/^search[:\s]+/i, "").trim();
    return { type: "SEARCH", query };
  }

  if (subject.startsWith("digest") || subject.includes("summary")) {
    const frequencyMatch = subject.match(/daily|weekly|monthly/);
    const frequency = (frequencyMatch ? frequencyMatch[0] : "weekly") as
      | "daily"
      | "weekly"
      | "monthly";
    return { type: "DIGEST", frequency };
  }

  if (subject.includes("help") || subject.includes("?")) {
    return { type: "HELP" };
  }

  // Check for forwarded email indicators
  if (
    subject.startsWith("fw:") ||
    subject.startsWith("fwd:") ||
    subject.startsWith("forward")
  ) {
    return { type: "FORWARDED" };
  }

  // Default: treat as forwarded referral email
  return { type: "FORWARDED" };
}

function parseAddCommand(subject: string, body: string): ParsedCommand {
  const lines = body.split("\n");

  const service =
    extractField(lines, "service") || subject.replace(/^add[:\s]+/i, "").trim();
  const code =
    extractField(lines, "code") || extractField(lines, "referral code");
  const referralUrl =
    extractField(lines, "link") ||
    extractField(lines, "url") ||
    extractField(lines, "referral url");
  const reward = extractField(lines, "reward") || extractField(lines, "bonus");
  const expiry =
    extractField(lines, "expires") ||
    extractField(lines, "expiry") ||
    extractField(lines, "valid until");
  const category = extractField(lines, "category");
  const notes = extractField(lines, "notes") || extractField(lines, "note");

  return {
    type: "ADD",
    service,
    code,
    referralUrl,
    reward,
    expiry,
    category,
    notes,
  };
}

function parseDeactivateCommand(subject: string, body: string): ParsedCommand {
  // Try to extract service and code from subject
  const parts = subject
    .replace(/^deactivate[:\s]+/i, "")
    .trim()
    .split(/\s+/);

  const service = parts[0] || "";
  const code = parts[1] || "";

  const lines = body.split("\n");
  const reason = extractField(lines, "reason") || "user_request";
  const notes = extractField(lines, "notes") || extractField(lines, "note");

  return {
    type: "DEACTIVATE",
    service,
    code,
    reason,
    notes,
  };
}

function extractField(lines: string[], fieldName: string): string | undefined {
  const pattern = new RegExp(`^${fieldName}[:\s]+(.+)$`, "i");

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

export const GENERIC_PATTERNS = {
  subjectKeywords:
    /\b(referral|invite|bonus|credit|discount|promo|code|earn|get|free|einladung|freunde)\b/gi,

  referralUrlPatterns: [
    /https?:\/\/[^\s]*(?:refer|invite|share|r|ref|einladung)\/[^\s]*/i,
    /https?:\/\/[^\s]*\.app\/[^\s]*(?:invite|refer|code)\/[^\s]*/i,
    /https?:\/\/[^\s]*(?:db\.tt|g\.co|bit\.ly|t\.co)\/[^\s]*/i,
    /https?:\/\/[^\s]*[?&](?:ref|referral|invite|code|r)=([^\s&]+)/i,
  ],

  codePatterns: [
    /(?:code|promo|coupon|invite)\s*[:\-]?\s*["']?([A-Z0-9]{4,20})/i,
    /(?:use|enter|apply)\s+code\s+["']?([A-Z0-9]{4,20})/i,
    /(?:your|my)\s+(?:referral|invite)\s+code\s*[:\-]?\s*["']?([A-Z0-9]{4,20})/i,
    /(?:code|einladung)\s*[:\-]?\s*["']?([A-Z0-9]{6,})/i,
  ],

  rewardPatterns: [
    /(\$?\d+(?:\.\d+)?\s*(?:off|credit|discount|bonus|gutschrift|rabatt))/i,
    /(\d+\s*(?:GB|MB|%|percent|days?|months?))/i,
    /(?:earn|get|receive)\s+(.+?)(?:when|if|by)/i,
  ],

  expiryPatterns: [
    /(?:expires?|valid\s*until|gültig\s*bis|ends?)\s*[:\-]?\s*(.+)/i,
    /(?:ends?|valid)\s+(?:on|until)\s*[:\-]?\s*(.+)/i,
  ],
};
