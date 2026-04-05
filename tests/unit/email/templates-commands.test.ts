import { describe, it, expect } from "vitest";
import {
  createSuccessConfirmation,
  createDeactivationConfirmation,
  createSearchResultsEmail,
  createErrorEmail,
} from "../../../worker/email/templates";
import type { ConfirmationEmailData } from "../../../worker/email/types";

describe("createSuccessConfirmation", () => {
  it("should generate email with all fields", () => {
    const data: ConfirmationEmailData = {
      service: "Uber",
      code: "ABC123",
      referralUrl: "https://uber.com/invite/abc123",
      reward: "$20 credit",
      expiry: "2026-12-31",
      confidence: 0.95,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);

    expect(result.subject).toBe("✓ Added: Uber Referral");
    expect(result.text).toContain("Uber");
    expect(result.text).toContain("ABC123");
    expect(result.text).toContain("https://uber.com/invite/abc123");
    expect(result.text).toContain("$20 credit");
    expect(result.text).toContain("2026-12-31");
    expect(result.text).toContain("95%");
    expect(result.html).toContain("Uber");
    expect(result.html).toContain("ABC123");
  });

  it("should generate email with only required fields", () => {
    const data: ConfirmationEmailData = {
      service: "Airbnb",
      confidence: 0.8,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);

    expect(result.subject).toBe("✓ Added: Airbnb Referral");
    expect(result.text).toContain("Airbnb");
    expect(result.text).not.toContain("Code:");
    expect(result.text).not.toContain("Link:");
  });

  it("should show confidence as percentage", () => {
    const data: ConfirmationEmailData = {
      service: "Lyft",
      confidence: 0.7,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);
    expect(result.text).toContain("70%");
  });

  it("should include deactivation instructions", () => {
    const data: ConfirmationEmailData = {
      service: "Dropbox",
      code: "DBX123",
      confidence: 0.9,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);
    expect(result.text).toContain("DEACTIVATE");
  });

  it("should include system signature", () => {
    const data: ConfirmationEmailData = {
      service: "Spotify",
      confidence: 0.85,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);
    expect(result.text).toContain("Do-Deal Referral System");
  });

  it("should generate valid HTML with styling", () => {
    const data: ConfirmationEmailData = {
      service: "Netflix",
      code: "NET123",
      confidence: 0.9,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);
    expect(result.html).toContain("<html>");
    expect(result.html).toContain("</html>");
    expect(result.html).toContain("font-family");
    expect(result.html).toContain("#4CAF50");
  });

  it("should omit optional fields when null", () => {
    const data: ConfirmationEmailData = {
      service: "Robinhood",
      code: null,
      referralUrl: null,
      reward: null,
      expiry: null,
      confidence: 0.6,
      source: "email",
      action: "added",
    };
    const result = createSuccessConfirmation(data);
    expect(result.text).not.toContain("Code:");
    expect(result.text).not.toContain("Link:");
    expect(result.text).not.toContain("Reward:");
    expect(result.text).not.toContain("Expires:");
  });
});

describe("createDeactivationConfirmation", () => {
  it("should generate deactivation email", () => {
    const result = createDeactivationConfirmation(
      "Uber",
      "ABC123",
      "User request",
    );
    expect(result.subject).toBe("✓ Deactivated: Uber");
    expect(result.text).toContain("Uber");
    expect(result.text).toContain("ABC123");
    expect(result.text).toContain("User request");
    expect(result.text).toContain("no longer appear");
  });

  it("should include reactivation instructions", () => {
    const result = createDeactivationConfirmation(
      "Airbnb",
      "XYZ789",
      "Expired",
    );
    expect(result.text).toContain("REACTIVATE");
  });

  it("should include system signature", () => {
    const result = createDeactivationConfirmation("Lyft", "LYFT1", "Test");
    expect(result.text).toContain("Do-Deal Referral System");
  });

  it("should generate HTML with red styling", () => {
    const result = createDeactivationConfirmation("Spotify", "SPOT1", "Test");
    expect(result.html).toContain("#f44336");
    expect(result.html).toContain("Deactivated");
  });

  it("should handle empty code", () => {
    const result = createDeactivationConfirmation("Netflix", "", "Test");
    expect(result.text).toContain("Netflix");
    expect(result.subject).toBe("✓ Deactivated: Netflix");
  });
});

describe("createSearchResultsEmail", () => {
  it("should generate search results with single result", () => {
    const results = [
      {
        code: "UBER1",
        url: "https://uber.com/invite/1",
        domain: "uber.com",
        status: "active",
      },
    ];
    const result = createSearchResultsEmail("uber", results);

    expect(result.subject).toBe("Search Results: 1 referral found");
    expect(result.text).toContain("uber");
    expect(result.text).toContain("UBER1");
    expect(result.text).toContain("uber.com");
    expect(result.text).toContain("active");
  });

  it("should generate search results with multiple results", () => {
    const results = [
      {
        code: "UBER1",
        url: "https://uber.com/invite/1",
        domain: "uber.com",
        status: "active",
      },
      {
        code: "UBER2",
        url: "https://uber.com/invite/2",
        domain: "uber.com",
        status: "active",
      },
      {
        code: "UBER3",
        url: "https://uber.com/invite/3",
        domain: "uber.com",
        status: "expired",
      },
    ];
    const result = createSearchResultsEmail("uber", results);

    expect(result.subject).toBe("Search Results: 3 referrals found");
    expect(result.text).toContain("UBER1");
    expect(result.text).toContain("UBER2");
    expect(result.text).toContain("UBER3");
    expect(result.text).toContain("expired");
  });

  it("should handle empty results", () => {
    const result = createSearchResultsEmail("unknown", []);
    expect(result.subject).toBe("Search Results: 0 referrals found");
    expect(result.text).toContain("0 referrals");
  });

  it("should generate HTML with result cards", () => {
    const results = [
      {
        code: "AIRBNB1",
        url: "https://airbnb.com/c/test",
        domain: "airbnb.com",
        status: "active",
      },
    ];
    const result = createSearchResultsEmail("airbnb", results);
    expect(result.html).toContain("airbnb.com");
    expect(result.html).toContain("AIRBNB1");
    expect(result.html).toContain("#2196F3");
  });

  it("should number results sequentially", () => {
    const results = [
      { code: "A", url: "https://a.com", domain: "a.com", status: "active" },
      { code: "B", url: "https://b.com", domain: "b.com", status: "active" },
    ];
    const result = createSearchResultsEmail("test", results);
    expect(result.text).toContain("1. a.com");
    expect(result.text).toContain("2. b.com");
  });
});

describe("createErrorEmail", () => {
  it("should generate error email with message", () => {
    const result = createErrorEmail("No referral code found");
    expect(result.subject).toBe("⚠️ Could Not Process Your Email");
    expect(result.text).toContain("No referral code found");
  });

  it("should include suggestions when provided", () => {
    const suggestions = [
      "Include the full referral URL",
      "Make sure the code is visible",
    ];
    const result = createErrorEmail("Parsing failed", suggestions);
    expect(result.text).toContain("Suggestions:");
    expect(result.text).toContain("Include the full referral URL");
    expect(result.text).toContain("Make sure the code is visible");
  });

  it("should omit suggestions section when not provided", () => {
    const result = createErrorEmail("Unknown error");
    expect(result.text).not.toContain("Suggestions:");
  });

  it("should omit suggestions section when empty array", () => {
    const result = createErrorEmail("Unknown error", []);
    expect(result.text).not.toContain("Suggestions:");
  });

  it("should include system signature", () => {
    const result = createErrorEmail("Test error");
    expect(result.text).toContain("Do-Deal Referral System");
  });

  it("should generate HTML with orange styling", () => {
    const result = createErrorEmail("Test error");
    expect(result.html).toContain("#ff9800");
    expect(result.html).toContain("Processing Error");
  });

  it("should include contact support message", () => {
    const result = createErrorEmail("Test error");
    expect(result.text).toContain("contact support");
  });
});
