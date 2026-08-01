import { beforeEach, describe, expect, it, vi } from "vitest";

const { validatedFetchMock } = vi.hoisted(() => ({
  validatedFetchMock: vi.fn(),
}));

vi.mock("../../worker/lib/security", () => ({
  validatedFetch: validatedFetchMock,
}));

import { sourceSaysExpired } from "../../worker/lib/source-expiry";

describe("sourceSaysExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sourceSaysExpired should detect an explicit expiry phrase", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response("<html><h1>This offer has expired.</h1></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/one"),
    ).resolves.toBe(true);
  });

  it("sourceSaysExpired should ignore unrelated expiration wording", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response("Read our expiration policy. This offer is still active.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/two"),
    ).resolves.toBe(false);
  });

  it("sourceSaysExpired should ignore expiry text outside status elements", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response(
        `<html><head><title>Active offer</title><script>const message = "This offer has expired";</script></head><body><main>Available now</main><section class="related">This offer has expired</section></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      ),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/active"),
    ).resolves.toBe(false);
  });

  it("sourceSaysExpired should ignore scripts nested in status elements", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response(
        `<html><body><div role="alert"><script>"This offer has expired"</script>Available now</div></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      ),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/nested-script"),
    ).resolves.toBe(false);
  });

  it("sourceSaysExpired should reject an oversized declared response", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response("This offer has expired.", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": "999999",
        },
      }),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/large"),
    ).resolves.toBe(false);
  });

  it("sourceSaysExpired should reject a missing content type", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response(
        new TextEncoder().encode("<script>This offer has expired.</script>"),
        { status: 200 },
      ),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/missing-type"),
    ).resolves.toBe(false);
  });

  it("sourceSaysExpired should reject script content", async () => {
    validatedFetchMock.mockResolvedValue(
      new Response('const message = "This offer has expired.";', {
        status: 200,
        headers: { "content-type": "text/javascript" },
      }),
    );

    await expect(
      sourceSaysExpired("https://deals.example.com/script.js"),
    ).resolves.toBe(false);
  });
});
