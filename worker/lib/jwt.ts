import { base64urlEncode } from "./crypto";

/**
 * Creates a JWT token with the given payload and secret.
 * Uses Web Crypto API for secure signing.
 */
export async function createToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string | number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(
    JSON.stringify({ ...payload, exp: calculateExpiry(expiresIn) }),
  );
  const signatureInput = encodedHeader + "." + encodedPayload;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signatureInput),
  );
  const encodedSignature = base64urlEncode(new Uint8Array(signatureBuf));

  return signatureInput + "." + encodedSignature;
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Uses Web Crypto API for secure verification.
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

    const signatureInput = encodedHeader + "." + encodedPayload;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = base64urlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(signatureInput),
    );
    if (!isValid) return null;
    const payloadBytes = base64urlDecode(encodedPayload);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as Record<string, unknown>;

    // 2026-06-18: JWT Standard Expiration Validation
    if (payload.exp && typeof payload.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds >= payload.exp) {
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binaryString = Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++)
    bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function calculateExpiry(expiresIn: string | number): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof expiresIn === "number") return nowSeconds + expiresIn;
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error("Invalid expiresIn format: " + expiresIn);
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return nowSeconds + value * multipliers[unit]!;
}

/**
 * Hashes a password using PBKDF2 with a random salt.
 * Returns the salt and hash as a base64-encoded string.
 *
 * @param password The plain-text password to hash
 * @returns A string in the format "salt.hash" (base64-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const computedHash = base64urlEncode(new Uint8Array(bits));
  const saltStr = base64urlEncode(salt);
  return saltStr + "." + computedHash;
}

/**
 * Verifies a password against a stored hash.
 *
 * @param password The plain-text password to verify
 * @param storedHash The stored hash (format "salt.hash")
 * @returns True if the password matches the hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const separatorIndex = storedHash.indexOf(".");
    if (separatorIndex === -1) return false;
    const saltStr = storedHash.slice(0, separatorIndex);
    const expectedHash = storedHash.slice(separatorIndex + 1);
    if (!saltStr || !expectedHash) return false;
    const salt = base64urlDecode(saltStr);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );
    const computedHash = base64urlEncode(new Uint8Array(bits));
    return constantTimeCompare(computedHash, expectedHash);
  } catch {
    return false;
  }
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++)
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/**
 * Hash a refresh token for secure storage.
 * Uses SHA-256 hashing with a random salt.
 */
export async function hashRefreshToken(token: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const computedHash = base64urlEncode(new Uint8Array(bits));
  const saltStr = base64urlEncode(salt);
  return saltStr + "." + computedHash;
}

/**
 * Generate a unique token family identifier.
 * Used for tracking token rotation and detecting reuse.
 */
export function generateTokenFamily(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
