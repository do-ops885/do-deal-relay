import type { Env } from "../types";
import { generateUUID } from "./crypto";

export interface JwtPayload {
  sub: string;
  role: string;
  email?: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

export function base64urlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function base64urlDecode(str: string): Uint8Array {
  let normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseExpiresIn(expiresIn: string | number): number {
  if (typeof expiresIn === "number") return expiresIn;
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 3600);
}

async function hmacSign(input: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  ) as Promise<ArrayBuffer>;
}

async function hmacVerify(
  input: string,
  secret: string,
  signature: ArrayBuffer,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(input),
  ) as Promise<boolean>;
}

export async function createToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string | number = "1h",
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: JwtPayload = {
    sub: payload.sub as string,
    role: payload.role as string,
    ...payload,
    iat: now,
    exp: now + parseExpiresIn(expiresIn),
  };

  const headerEncoded = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(header)).buffer as ArrayBuffer,
  );
  const payloadEncoded = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(tokenPayload))
      .buffer as ArrayBuffer,
  );
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = await hmacSign(signatureInput, secret);

  return `${headerEncoded}.${payloadEncoded}.${base64urlEncode(signature)}`;
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    if (!headerEncoded || !payloadEncoded || !signatureEncoded) return null;

    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const signatureBytes = base64urlDecode(signatureEncoded)
      .buffer as ArrayBuffer;

    const isValid = await hmacVerify(signatureInput, secret, signatureBytes);
    if (!isValid) return null;

    const payloadText = new TextDecoder().decode(
      base64urlDecode(payloadEncoded),
    );
    const payload = JSON.parse(payloadText) as JwtPayload;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateUUID();
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
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const hash = base64urlEncode(bits);
  return `${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const separatorIndex = storedHash.indexOf(":");
  if (separatorIndex === -1) return false;
  const salt = storedHash.slice(0, separatorIndex);
  const expectedHash = storedHash.slice(separatorIndex + 1);
  if (!salt || !expectedHash) return false;

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
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const computedHash = base64urlEncode(bits);
  return computedHash === expectedHash;
}
