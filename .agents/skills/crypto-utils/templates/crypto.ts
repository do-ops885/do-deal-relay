/**
 * Crypto Utils Template
 *
 * Cryptographic utilities for hashing, encryption, and secure operations.
 */

export interface HashConfig {
  algorithm: "sha256" | "sha512" | "argon2id";
  encoding: "hex" | "base64";
}

export interface EncryptionConfig {
  algorithm: "aes-256-gcm";
  keySize: number;
  ivSize: number;
  tagSize: number;
}

// Hash functions
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha512(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-512", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// HMAC operations
export async function hmacSign(
  data: string,
  secret: string,
  algorithm: "SHA-256" | "SHA-512" = "SHA-256",
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacVerify(
  data: string,
  signature: string,
  secret: string,
  algorithm: "SHA-256" | "SHA-512" = "SHA-256",
): Promise<boolean> {
  const expected = await hmacSign(data, secret, algorithm);
  return constantTimeEqual(signature, expected);
}

export async function hmacSignWithTimestamp(
  data: string,
  secret: string,
  options: { timestamp?: number; tolerance?: number } = {},
): Promise<string> {
  const timestamp = options.timestamp || Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${data}`;
  const sig = await hmacSign(payload, secret);
  return `t=${timestamp},v1=${sig}`;
}

export async function hmacVerifyWithTimestamp(
  data: string,
  signature: string,
  secret: string,
  tolerance = 300,
): Promise<{ valid: boolean; timestamp: number }> {
  const parts = signature.split(",");
  const t = parts.find((p) => p.startsWith("t="))?.split("=")[1];
  const v1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!t || !v1) return { valid: false, timestamp: 0 };

  const timestamp = parseInt(t, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
    return { valid: false, timestamp };
  }

  const payload = `${t}.${data}`;
  const valid = await hmacVerify(payload, v1, secret);
  return { valid, timestamp };
}

// Token generation
export function generateToken(
  options: {
    length?: number;
    encoding?: "hex" | "base64" | "base64url";
    numeric?: boolean;
  } = {},
): string {
  const length = options.length || 32;
  const encoding = options.encoding || "hex";

  if (options.numeric) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  switch (encoding) {
    case "base64":
      return btoa(String.fromCharCode(...bytes));
    case "base64url":
      return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    case "hex":
    default:
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  }
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

// Encryption
export interface EncryptedData {
  ciphertext: Uint8Array;
  iv: ArrayBuffer;
  tag: Uint8Array;
}

export async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importKey(keyData: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptAesGcm(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  const ciphertext = new Uint8Array(encrypted.slice(0, -16));
  const tag = new Uint8Array(encrypted.slice(-16));

  return { ciphertext, iv, tag };
}

export async function decryptAesGcm(
  data: EncryptedData,
  key: CryptoKey,
): Promise<string> {
  const combined = new Uint8Array(data.ciphertext.length + data.tag.length);
  combined.set(data.ciphertext);
  combined.set(data.tag, data.ciphertext.length);

  // Convert to ArrayBuffer
  const buffer = combined.buffer.slice(
    combined.byteOffset,
    combined.byteOffset + combined.byteLength,
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: data.iv },
    key,
    buffer,
  );

  return new TextDecoder().decode(decrypted);
}

// Password hashing (simplified - use proper library in production)
export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const s = salt || generateToken({ length: 16, encoding: "hex" });
  const combined = password + s;
  const hash = await sha256(combined);
  return { hash, salt: s };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt);
  return constantTimeEqual(computed, hash);
}

// Constant-time comparison
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Encoding utilities
export const encode = {
  base64: (data: string): string => btoa(data),
  base64url: (data: string): string =>
    btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
  hex: (data: string): string =>
    Array.from(new TextEncoder().encode(data))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
};

export const decode = {
  base64: (data: string): string => atob(data),
  hex: (data: string): Uint8Array =>
    new Uint8Array(data.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))),
};

// Secure random
export function secureRandom(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = secureRandom(4);
  const value = new DataView(bytes.buffer).getUint32(0, true);
  return min + (value % range);
}
