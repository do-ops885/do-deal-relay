// Generates a valid HS256 JWT for local E2E tests using the known test secret.
// Mirrors worker/lib/jwt.ts createToken() so the running worker accepts it.
// Run via: node tests/e2e/generate-jwt.mjs
import { webcrypto } from "node:crypto";

const JWT_SECRET = "e2e-test-jwt-secret-do-not-use-in-prod";
const TOKEN_PATH = new URL("./.jwt-token", import.meta.url).pathname;

function base64urlEncode(input) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 8192)),
    );
  }
  return Buffer.from(binary, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sign(input, secret) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return base64urlEncode(new Uint8Array(sig));
}

const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  sub: "e2e-user-id",
  role: "user",
  email: "e2e-test@example.com",
  name: "E2E Test User",
  exp: now + 86400,
  iat: now,
};

const encodedHeader = base64urlEncode(JSON.stringify(header));
const encodedPayload = base64urlEncode(JSON.stringify(payload));
const signatureInput = `${encodedHeader}.${encodedPayload}`;
const signature = await sign(signatureInput, JWT_SECRET);
const token = `${signatureInput}.${signature}`;

const fs = await import("node:fs");
fs.writeFileSync(TOKEN_PATH, token);
console.log(`✓ Wrote E2E JWT token to ${TOKEN_PATH}`);
