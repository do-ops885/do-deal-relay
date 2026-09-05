/**
 * Email Route Tests (T-2)
 *
 * Covers worker/routes/email.ts orchestration: HMAC webhook verification,
 * required-field and from-format validation, parse/help shapes, and the
 * Email Worker delegation entrypoint. processEmail/emailWorkerHandler are
 * mocked at the ../email/handler seam; HMAC stays real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../../worker/types";
import { generateWebhookHeaders } from "../../../worker/lib/hmac";
import type { EmailProcessingResult } from "../../../worker/email/types";

type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

vi.mock("../../../worker/email/handler", () => ({
  processEmail: vi.fn(),
  emailWorkerHandler: vi.fn(),
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const SECRET = "test-email-webhook-secret";

function makeEnv(withSecret = true): Env {
  const kv = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
  return {
    DEALS_SOURCES: kv as unknown as MockKVNamespace,
    ENVIRONMENT: "test",
    ...(withSecret ? { EMAIL_WEBHOOK_SECRET: SECRET } : {}),
  } as unknown as Env;
}

async function signedRequest(
  body: Record<string, unknown>,
  secret: string = SECRET,
): Promise<Request> {
  const payload = JSON.stringify(body);
  const headers = await generateWebhookHeaders(
    payload,
    secret,
    "evt-1",
    "email.incoming",
  );
  return new Request("http://localhost/api/email/incoming", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: payload,
  });
}

describe("handleEmailIncoming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when EMAIL_WEBHOOK_SECRET is not configured", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = new Request("http://localhost/api/email/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "a@x.com", to: "b@y.com", subject: "hi" }),
    });

    const res = await handleEmailIncoming(request, makeEnv(false));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to process email");
  });

  it("returns 401 when signature headers are missing", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = new Request("http://localhost/api/email/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "a@x.com", to: "b@y.com", subject: "hi" }),
    });

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the signature header format is invalid", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = new Request("http://localhost/api/email/incoming", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": "not-a-valid-header",
        "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: JSON.stringify({ from: "a@x.com", to: "b@y.com", subject: "hi" }),
    });

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 when the signature does not match", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = await signedRequest(
      { from: "a@x.com", to: "b@y.com", subject: "hi" },
      "wrong-secret",
    );

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = await signedRequest({ from: "a@x.com" });

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Missing required fields: from, to, subject");
  });

  it("returns 400 when the from address is not an email", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const request = await signedRequest({
      from: "not-an-email",
      to: "add@x.com",
      subject: "add",
    });

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid from email format");
  });

  it("returns 200 and splits/trims recipients on success", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const { processEmail } = await import("../../../worker/email/handler");
    const result: EmailProcessingResult = {
      success: true,
      message: "Referral added successfully",
      referralId: "deal-1",
      confirmationSent: true,
    };
    vi.mocked(processEmail).mockResolvedValue(result);

    const request = await signedRequest({
      from: "user@x.com",
      to: "add@x.com,  help@x.com ",
      subject: "add",
      text: "service: Wise",
    });
    const env = makeEnv();

    const res = await handleEmailIncoming(request, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      referralId: string;
      confirmationSent: boolean;
    };
    expect(body.success).toBe(true);
    expect(body.referralId).toBe("deal-1");
    expect(body.confirmationSent).toBe(true);
    expect(vi.mocked(processEmail)).toHaveBeenCalledOnce();
    const [emailArg] = vi.mocked(processEmail).mock.calls[0] ?? [];
    expect(emailArg?.to).toEqual(["add@x.com", "help@x.com"]);
  });

  it("returns 400 when processing reports failure", async () => {
    const { handleEmailIncoming } =
      await import("../../../worker/routes/email");
    const { processEmail } = await import("../../../worker/email/handler");
    vi.mocked(processEmail).mockResolvedValue({
      success: false,
      message: "Security check failed: spam",
      confirmationSent: false,
      error: "spam",
    });

    const request = await signedRequest({
      from: "spammer@x.com",
      to: "add@x.com",
      subject: "add",
    });

    const res = await handleEmailIncoming(request, makeEnv());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
  });
});

describe("handleEmailParse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when from or subject is missing", async () => {
    const { handleEmailParse } = await import("../../../worker/routes/email");
    const request = new Request("http://localhost/api/email/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "a@x.com" }),
    });

    const res = await handleEmailParse(request, makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 200 with extraction and command shapes", async () => {
    const { handleEmailParse } = await import("../../../worker/routes/email");
    const request = new Request("http://localhost/api/email/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "user@x.com",
        to: "add@x.com",
        subject: "add",
        text: "service: Wise\ncode: WISE123",
      }),
    });

    const res = await handleEmailParse(request, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      extraction: { service: string };
      command: { type: string };
      email: { from: string; hasText: boolean; hasHtml: boolean };
    };
    expect(body.command.type).toBe("ADD");
    expect(body.extraction.service).toBeDefined();
    expect(body.email.from).toBe("user@x.com");
    expect(body.email.hasText).toBe(true);
    expect(body.email.hasHtml).toBe(false);
  });
});

describe("handleEmailHelp", () => {
  it("returns 200 with subject, text, and html template", async () => {
    const { handleEmailHelp } = await import("../../../worker/routes/email");

    const res = await handleEmailHelp(undefined, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subject: string;
      text: string;
      html: string;
    };
    expect(typeof body.subject).toBe("string");
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.html.length).toBeGreaterThan(0);
  });
});

describe("handleEmailWorker", () => {
  it("delegates the message and env to emailWorkerHandler", async () => {
    const { handleEmailWorker } = await import("../../../worker/routes/email");
    const { emailWorkerHandler } =
      await import("../../../worker/email/handler");
    const message = {
      from: "user@x.com",
      to: "add@x.com",
      subject: "add",
      headers: new Headers(),
      text: "service: Wise",
    };
    const env = makeEnv();

    await handleEmailWorker(message, env);

    expect(vi.mocked(emailWorkerHandler)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailWorkerHandler)).toHaveBeenCalledWith(message, env);
  });
});
