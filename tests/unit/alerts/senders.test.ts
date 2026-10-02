import { describe, it, expect } from "vitest";
import {
  getSender,
  formatAlertMessage,
} from "../../../worker/lib/alerts/senders";

describe("alert senders", () => {
  it("resolves all channels", () => {
    expect(getSender("telegram")?.channel).toBe("telegram");
    expect(getSender("discord")?.channel).toBe("discord");
    expect(getSender("webhook")?.channel).toBe("webhook");
    expect(getSender("email")?.channel).toBe("email");
    expect(getSender("unknown")).toBeNull();
  });

  it("formats message with cap", () => {
    const sub = { query: "cloud", id: "s1" } as never;
    const deals = [
      {
        id: "d1",
        code: "C1",
        title: "T1",
        url: "https://example.com",
        reward: { type: "cash", value: 10 },
      },
    ] as never;
    const text = formatAlertMessage(sub, deals as never);
    expect(text).toContain("cloud");
    expect(text).toContain("C1");
  });
});
