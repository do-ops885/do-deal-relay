import { describe, it, expect } from "vitest";
import {
  createHelpEmail,
  createLowConfidenceEmail,
  createConfirmationEmail,
} from "../../../worker/email/templates";
import type { ConfirmationEmailData } from "../../../worker/email/types";

describe("createHelpEmail", () => {
  it("should generate help email with correct subject", () => {
    const result = createHelpEmail();
    expect(result.subject).toBe("Do-Deal Email Commands Help");
  });

  it("should include ADD command documentation", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("ADD");
    expect(result.text).toContain("add@do-deal.app");
  });

  it("should include DEACTIVATE command documentation", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("DEACTIVATE");
    expect(result.text).toContain("deactivate@do-deal.app");
  });

  it("should include SEARCH command documentation", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("SEARCH");
    expect(result.text).toContain("search@do-deal.app");
  });

  it("should include DIGEST command documentation", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("DIGEST");
    expect(result.text).toContain("digest@do-deal.app");
  });

  it("should include HELP command documentation", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("HELP");
    expect(result.text).toContain("help@do-deal.app");
  });

  it("should include forwarding instructions", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("FORWARD REFERRAL EMAILS");
    expect(result.text).toContain("referrals@do-deal.app");
  });

  it("should emphasize complete URLs", () => {
    const result = createHelpEmail();
    expect(result.text).toContain("complete URLs");
    expect(result.text).toContain("https://picnic.app");
  });

  it("should generate HTML with blue styling", () => {
    const result = createHelpEmail();
    expect(result.html).toContain("#2196F3");
    expect(result.html).toContain("Email Commands Help");
  });
});

describe("createLowConfidenceEmail", () => {
  it("should generate low confidence email with original subject", () => {
    const result = createLowConfidenceEmail("Uber referral invite");
    expect(result.subject).toBe("⚠️ Referral Code Needs Manual Review");
    expect(result.text).toContain("Uber referral invite");
  });

  it("should request manual information", () => {
    const result = createLowConfidenceEmail("Some email");
    expect(result.text).toContain("Service:");
    expect(result.text).toContain("Code:");
    expect(result.text).toContain("Link:");
    expect(result.text).toContain("Reward:");
    expect(result.text).toContain("Expires:");
  });

  it("should include system signature", () => {
    const result = createLowConfidenceEmail("Test");
    expect(result.text).toContain("Do-Deal Referral System");
  });

  it("should generate HTML with orange styling", () => {
    const result = createLowConfidenceEmail("Test");
    expect(result.html).toContain("#ff9800");
    expect(result.html).toContain("Manual Review Needed");
  });
});

describe("createConfirmationEmail - dispatcher", () => {
  it("should dispatch to success confirmation for 'added' action", () => {
    const data: ConfirmationEmailData = {
      service: "Uber",
      code: "ABC123",
      confidence: 0.9,
      source: "email",
      action: "added",
    };
    const result = createConfirmationEmail(data);
    expect(result.subject).toBe("✓ Added: Uber Referral");
  });

  it("should dispatch to deactivation for 'deactivated' action", () => {
    const data: ConfirmationEmailData = {
      service: "Uber",
      code: "ABC123",
      confidence: 0.9,
      source: "email",
      action: "deactivated",
    };
    const result = createConfirmationEmail(data);
    expect(result.subject).toBe("✓ Deactivated: Uber");
    expect(result.text).toContain("ABC123");
  });

  it("should dispatch to search results for 'found' action", () => {
    const data: ConfirmationEmailData = {
      service: "uber",
      confidence: 0.9,
      source: "email",
      action: "found",
      searchResults: [
        {
          code: "UBER1",
          url: "https://uber.com/invite/1",
          domain: "uber.com",
          status: "active",
        },
      ],
    };
    const result = createConfirmationEmail(data);
    expect(result.subject).toBe("Search Results: 1 referral found");
    expect(result.text).toContain("UBER1");
  });

  it("should dispatch to error email for 'error' action", () => {
    const data: ConfirmationEmailData = {
      service: "Unknown",
      confidence: 0.1,
      source: "email",
      action: "error",
      errorMessage: "Could not parse email",
      notes: "Try again with clearer format",
    };
    const result = createConfirmationEmail(data);
    expect(result.subject).toBe("⚠️ Could Not Process Your Email");
    expect(result.text).toContain("Could not parse email");
  });

  it("should default to success confirmation for unknown action", () => {
    const data: ConfirmationEmailData = {
      service: "Test",
      confidence: 0.8,
      source: "email",
      action: "added" as ConfirmationEmailData["action"],
    };
    const result = createConfirmationEmail({
      ...data,
      action: "unknown" as ConfirmationEmailData["action"],
    });
    expect(result.subject).toBe("✓ Added: Test Referral");
  });

  it("should handle deactivated with missing code", () => {
    const data: ConfirmationEmailData = {
      service: "Lyft",
      confidence: 0.9,
      source: "email",
      action: "deactivated",
    };
    const result = createConfirmationEmail(data);
    expect(result.text).toContain("N/A");
  });

  it("should handle found action with empty search results", () => {
    const data: ConfirmationEmailData = {
      service: "unknown",
      confidence: 0.9,
      source: "email",
      action: "found",
      searchResults: [],
    };
    const result = createConfirmationEmail(data);
    expect(result.subject).toBe("Search Results: 0 referrals found");
  });

  it("should handle error action without notes", () => {
    const data: ConfirmationEmailData = {
      service: "Unknown",
      confidence: 0.1,
      source: "email",
      action: "error",
      errorMessage: "Parse error",
    };
    const result = createConfirmationEmail(data);
    expect(result.text).toContain("Parse error");
    expect(result.text).not.toContain("Suggestions:");
  });
});
