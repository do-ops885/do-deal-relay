import * as cheerio from "cheerio";

import { validatedFetch } from "./security";
import { createTimeoutSignal } from "./utils";

const MAX_SOURCE_BYTES = 256_000;
const SOURCE_REQUEST_TIMEOUT_MS = 10_000;
const EXPIRED_SOURCE_PATTERNS = [
  /\b(?:this\s+)?offer\s+(?:has\s+)?expired\b/,
  /\b(?:this\s+)?deal\s+(?:has\s+)?ended\b/,
  /\bpromotion\s+(?:has\s+)?ended\b/,
  /\bno\s+longer\s+available\b/,
  /\bcode\s+(?:is\s+)?(?:expired|invalid)\b/,
] as const;
const STATUS_SELECTOR = [
  "title",
  "h1",
  "[role='alert']",
  "[data-status]",
  ".status",
  ".deal-status",
  ".offer-status",
].join(",");

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    return "";
  }
  if (!response.body) return (await response.text()).slice(0, MAX_SOURCE_BYTES);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  while (bytesRead < MAX_SOURCE_BYTES) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const remaining = MAX_SOURCE_BYTES - bytesRead;
    const value = chunk.value.slice(0, remaining);
    bytesRead += value.byteLength;
    text += decoder.decode(value, { stream: bytesRead < MAX_SOURCE_BYTES });
  }
  if (bytesRead >= MAX_SOURCE_BYTES) await reader.cancel();
  return text + decoder.decode();
}

/**
 * Evaluates whether a source URL page content indicates that a deal or offer has expired.
 *
 * @param sourceUrl - The source URL to fetch and analyze, or null.
 * @returns A promise resolving to true if the source content explicitly states expiration, false otherwise.
 */
export async function sourceSaysExpired(
  sourceUrl: string | null,
): Promise<boolean> {
  if (!sourceUrl) return false;
  const { signal, cleanup } = createTimeoutSignal(SOURCE_REQUEST_TIMEOUT_MS);
  try {
    const response = await validatedFetch(sourceUrl, {
      headers: { Accept: "text/html,text/plain" },
      // Do not follow an unvalidated redirect to a private network target.
      redirect: "manual",
      signal,
    });
    if (!response.ok) return false;
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "text/html" && contentType !== "text/plain") {
      return false;
    }
    const rawText = await readBoundedText(response);
    let statusTexts: string[];
    if (contentType === "text/html") {
      const page = cheerio.load(rawText);
      page("script,style,template,noscript").remove();
      statusTexts = page(STATUS_SELECTOR)
        .toArray()
        .map((element) => page(element).text().toLowerCase());
    } else {
      statusTexts = [rawText.toLowerCase()];
    }
    return statusTexts.some((text) =>
      EXPIRED_SOURCE_PATTERNS.some((pattern) => pattern.test(text)),
    );
  } catch {
    return false;
  } finally {
    cleanup();
  }
}
