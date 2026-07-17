import { describe, it, expect } from "vitest";
import { isIpInCidr } from "../../worker/lib/security";

describe("SSRF Protection - isIpInCidr Security Fix", () => {
  it("should return false for non-IP hostnames matching 0.0.0.0/8", () => {
    // Before the fix, "example.com" would match "0.0.0.0/8" because ipToLong returns 0
    expect(isIpInCidr("example.com", "0.0.0.0/8")).toBe(false);
    expect(isIpInCidr("google.com", "0.0.0.0/8")).toBe(false);
  });

  it("should return true for valid IPs in the 0.0.0.0/8 range", () => {
    expect(isIpInCidr("0.0.0.0", "0.0.0.0/8")).toBe(true);
    expect(isIpInCidr("0.255.255.255", "0.0.0.0/8")).toBe(true);
  });

  it("should return true for localhost in 127.0.0.0/8", () => {
    expect(isIpInCidr("127.0.0.1", "127.0.0.0/8")).toBe(true);
  });

  it("should return false for valid IPs outside the range", () => {
    expect(isIpInCidr("1.1.1.1", "0.0.0.0/8")).toBe(false);
    expect(isIpInCidr("192.168.1.1", "10.0.0.0/8")).toBe(false);
  });

  it("should handle invalid CIDR ranges gracefully", () => {
    expect(isIpInCidr("127.0.0.1", "invalid")).toBe(false);
    expect(isIpInCidr("127.0.0.1", "")).toBe(false);
  });

  it("should handle IPv6 matching correctly", () => {
    expect(isIpInCidr("::1", "::1/128")).toBe(true);
    expect(isIpInCidr("fd00::1", "fc00::/7")).toBe(true);
    expect(isIpInCidr("2001:db8::1", "fc00::/7")).toBe(false);
  });

  it("should return false for non-IP strings even if they look like part of IPv6", () => {
    expect(isIpInCidr("not:an:ip", "fc00::/7")).toBe(false);
  });
});
