import {
  RESEARCH_SELECTOR_CONFIGS,
  type ExtractSelectorSet,
} from "../../config";

import { logger } from "../global-logger";

export interface ExtractionConfig {
  selectors: string[];
  attributes?: string[];
  text?: boolean;
  regex?: RegExp;
}

export interface ExtractedContent {
  text: string[];
  attributes: Record<string, string[]>;
  html: string[];
}

interface ParsedSelector {
  tag: string | null;
  classes: string[];
  id: string | null;
  attributes: Array<{ name: string; value: string }>;
}

const patternCache: Map<string, RegExp> = new Map();
const MAX_MATCH_LENGTH = 100000;

function isSafeTagName(tag: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/.test(tag);
}

function isSafeClassName(cls: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,50}$/.test(cls);
}

function isSafeId(id: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,50}$/.test(id);
}

function isSafeAttributeName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]{0,20}$/.test(name);
}

function isSafeAttributeValue(value: string): boolean {
  return /^[a-zA-Z0-9_\-:;.,#@$%&*+=\s]{0,100}$/.test(value);
}

function parseSelector(selector: string): ParsedSelector {
  const result: ParsedSelector = {
    tag: null,
    classes: [],
    id: null,
    attributes: [],
  };

  let rest = selector.trim();

  const tagMatch = rest.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/);
  if (tagMatch) {
    result.tag = tagMatch[0];
    rest = rest.slice(tagMatch[0].length);
  }

  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(rest)) !== null) {
    const cls = classMatch[1];
    if (cls) result.classes.push(cls);
  }

  const idMatch = rest.match(/#([a-zA-Z_][a-zA-Z0-9_-]*)/);
  if (idMatch) {
    const idVal = idMatch[1];
    if (idVal !== undefined) result.id = idVal;
  }

  const attrRegex = /\[([a-zA-Z_][a-zA-Z0-9_-]*)(?:=(["']))?([^\]]*?)\2?\]/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(rest)) !== null) {
    const name = attrMatch[1];
    const value = attrMatch[3] || "";
    if (name !== undefined) {
      result.attributes.push({ name, value });
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSafeSelectorRegex(parsed: ParsedSelector): RegExp {
  const cacheKey = JSON.stringify(parsed);
  const cached = patternCache.get(cacheKey);
  if (cached) return cached;

  const parts: string[] = [];

  if (parsed.tag) {
    if (!isSafeTagName(parsed.tag)) {
      throw new Error(`Unsafe tag name: ${parsed.tag}`);
    }
    parts.push(parsed.tag);
  } else {
    parts.push("[a-zA-Z][a-zA-Z0-9_-]*");
  }

  if (parsed.classes.length > 0) {
    for (const cls of parsed.classes) {
      if (!isSafeClassName(cls)) {
        throw new Error(`Unsafe class name: ${cls}`);
      }
    }
    const classPatterns = parsed.classes.map(
      (c) => `(?=[^>]*\\b${escapeRegex(c)}\\b)`,
    );
    parts.push(
      `(?=[^>]*class\\s*=\\s*["'][^"']*${classPatterns.join("")}[^"']*["'])`,
    );
  }

  if (parsed.id) {
    if (!isSafeId(parsed.id)) {
      throw new Error(`Unsafe ID: ${parsed.id}`);
    }
    parts.push(`(?=[^>]*id\\s*=\\s*["']${escapeRegex(parsed.id)}["'])`);
  }

  for (const attr of parsed.attributes) {
    if (!isSafeAttributeName(attr.name)) {
      throw new Error(`Unsafe attribute name: ${attr.name}`);
    }
    if (attr.value && !isSafeAttributeValue(attr.value)) {
      throw new Error(`Unsafe attribute value: ${attr.value}`);
    }
    if (attr.value) {
      parts.push(
        `(?=[^>]*${escapeRegex(attr.name)}\\s*=\\s*["']${escapeRegex(attr.value)}["'])`,
      );
    } else {
      parts.push(`(?=[^>]*\\s${escapeRegex(attr.name)}\\s*(?:=|\\s|>))`);
    }
  }

  const openTag = parts.join("");
  const tagName = parsed.tag || "[a-zA-Z][a-zA-Z0-9_-]*";
  const fullPattern = `<${openTag}[^>]*>([\\s\\S]{0,${MAX_MATCH_LENGTH}}?)<\\/${tagName}[^>]*>`;

  const regex = new RegExp(fullPattern, "gi");
  patternCache.set(cacheKey, regex);
  return regex;
}

function buildSelectorRegex(parsed: ParsedSelector): RegExp {
  try {
    return buildSafeSelectorRegex(parsed);
  } catch (error) {
    const tagName = parsed.tag || "[a-zA-Z][a-zA-Z0-9_-]*";
    return new RegExp(
      `<${tagName}[^>]*>([\\s\\S]{0,${MAX_MATCH_LENGTH}}?)<\\/${tagName}[^>]*>`,
      "gi",
    );
  }
}

function buildAttributeRegex(parsed: ParsedSelector, attrName: string): RegExp {
  const tagPattern = parsed.tag || "[a-zA-Z][a-zA-Z0-9_-]*";
  return new RegExp(
    `<${tagPattern}[^>]*\\s${escapeRegex(attrName)}\\s*=\\s*["']([^"']*)["'][^>]*>`,
    "gi",
  );
}

function extractBySelector(html: string, selector: string): ExtractedContent {
  const parsed = parseSelector(selector);
  const regex = buildSelectorRegex(parsed);
  const textMatches: string[] = [];
  const htmlMatches: string[] = [];
  const attributes: Record<string, string[]> = {};

  const textRegex = new RegExp(
    regex.source.replace(/(\[\\s\\S\\]{[^}]*\\})/g, "([^<]*)"),
    regex.flags,
  );
  let textMatch: RegExpExecArray | null;
  while ((textMatch = textRegex.exec(html)) !== null) {
    if (textMatch[1]) {
      textMatches.push(textMatch[1].trim());
    }
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      htmlMatches.push(match[1]);
    }
  }

  if (parsed.attributes.length > 0) {
    for (const attr of parsed.attributes) {
      const attrRegex = buildAttributeRegex(parsed, attr.name);
      const attrMatches: string[] = [];
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(html)) !== null) {
        if (attrMatch[1]) {
          attrMatches.push(attrMatch[1]);
        }
      }
      if (attrMatches.length > 0) {
        attributes[attr.name] = attrMatches;
      }
    }
  }

  return { text: textMatches, attributes, html: htmlMatches };
}

export function extractContent(
  html: string,
  config: ExtractionConfig,
): ExtractedContent {
  const result: ExtractedContent = { text: [], attributes: {}, html: [] };

  for (const selector of config.selectors) {
    const extracted = extractBySelector(html, selector);
    result.text.push(...extracted.text);
    result.html.push(...extracted.html);
    Object.assign(result.attributes, extracted.attributes);
  }

  return result;
}

export function extractByConfig(
  html: string,
  config: ExtractSelectorSet,
): ExtractedContent {
  const result: ExtractedContent = { text: [], attributes: {}, html: [] };

  for (const selectors of Object.values(config)) {
    for (const selector of selectors) {
      const extracted = extractBySelector(html, selector);
      result.text.push(...extracted.text);
      result.html.push(...extracted.html);
      Object.assign(result.attributes, extracted.attributes);
    }
  }

  return result;
}
