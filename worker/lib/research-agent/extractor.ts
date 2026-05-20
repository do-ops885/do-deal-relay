import {
  RESEARCH_SELECTOR_CONFIGS,
  type ExtractSelectorSet,
} from "../../config";

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

function buildSelectorRegex(parsed: ParsedSelector): RegExp {
  const parts: string[] = [];

  if (parsed.tag) {
    parts.push(parsed.tag);
  } else {
    parts.push("[a-zA-Z][a-zA-Z0-9_-]*");
  }

  if (parsed.classes.length > 0) {
    const classPatterns = parsed.classes.map(
      (c) => `(?=.*\\b${escapeRegex(c)}\\b)`,
    );
    parts.push(
      `(?=[^>]*class\\s*=\\s*["'][^"']*${classPatterns.join("")}[^"']*["'])`,
    );
  }

  if (parsed.id) {
    parts.push(`(?=[^>]*id\\s*=\\s*["']${escapeRegex(parsed.id)}["'])`);
  }

  for (const attr of parsed.attributes) {
    if (attr.value) {
      parts.push(
        `(?=[^>]*${escapeRegex(attr.name)}\\s*=\\s*["']${escapeRegex(attr.value)}["'])`,
      );
    } else {
      parts.push(`(?=[^>]*\\s${escapeRegex(attr.name)}\\s*(?:=|\\s|>))`);
    }
  }

  const openTag = parts.join("");
  return new RegExp(
    `<${openTag}[^>]*>([\\s\\S]*?)<\\/${openTag.split("(?=")[0]}[a-zA-Z][a-zA-Z0-9_-]*\\s[^>]*>`,
    "gi",
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const result: ExtractedContent = {
    text: [],
    attributes: {},
    html: [],
  };

  const elementRegex = buildSelectorRegex(parsed);
  let match;
  while ((match = elementRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1] || "";
    result.html.push(fullMatch);

    const textContent = innerContent
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (textContent) {
      result.text.push(textContent);
    }

    const attrTagMatch = fullMatch.match(/<[^>]+>/);
    if (attrTagMatch) {
      const attrRegex = /\s([a-zA-Z_-]+)\s*=\s*["']([^"']*)["']/g;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = attrRegex.exec(attrTagMatch[0])) !== null) {
        const name = aMatch[1];
        const value = aMatch[2];
        if (name !== undefined && value !== undefined) {
          if (!result.attributes[name]) {
            result.attributes[name] = [];
          }
          result.attributes[name].push(value);
        }
      }
    }
  }

  return result;
}

function extractByRegex(html: string, regex: RegExp): ExtractedContent {
  const result: ExtractedContent = {
    text: [],
    attributes: {},
    html: [],
  };

  let match;
  while ((match = regex.exec(html)) !== null) {
    const fullMatch = match[0];
    const captured = match[1] || match[0];
    result.html.push(fullMatch);
    result.text.push(
      captured
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  return result;
}

function extractByAttribute(
  html: string,
  selector: string,
  attrName: string,
): string[] {
  const parsed = parseSelector(selector);
  const values: string[] = [];
  const attrRegex = buildAttributeRegex(parsed, attrName);
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    if (match[1]) {
      values.push(match[1]);
    }
  }
  return values;
}

export function extractContent(
  html: string,
  config: ExtractionConfig,
): ExtractedContent {
  const result: ExtractedContent = {
    text: [],
    attributes: {},
    html: [],
  };

  if (config.regex) {
    const regexResult = extractByRegex(html, config.regex);
    result.text.push(...regexResult.text);
    result.html.push(...regexResult.html);
    Object.assign(result.attributes, regexResult.attributes);
  }

  for (const selector of config.selectors) {
    const selectorResult = extractBySelector(html, selector);
    result.text.push(...selectorResult.text);
    Object.assign(result.attributes, selectorResult.attributes);
    result.html.push(...selectorResult.html);

    if (config.attributes) {
      for (const attr of config.attributes) {
        const attrValues = extractByAttribute(html, selector, attr);
        if (!result.attributes[attr]) {
          result.attributes[attr] = [];
        }
        result.attributes[attr].push(...attrValues);
      }
    }
  }

  if (config.text === false) {
    result.text = [];
  }

  result.text = [...new Set(result.text.map((t) => t).filter(Boolean))];
  result.html = [...new Set(result.html.filter(Boolean))];
  for (const key of Object.keys(result.attributes)) {
    result.attributes[key] = [...new Set(result.attributes[key])];
  }

  return result;
}

export function extractWithSelectorSet(
  html: string,
  domain: string,
): Record<string, ExtractedContent> | null {
  const selectorConfig: ExtractSelectorSet | undefined =
    RESEARCH_SELECTOR_CONFIGS[domain];
  if (!selectorConfig) return null;

  const result: Record<string, ExtractedContent> = {};

  for (const [field, selectors] of Object.entries(selectorConfig)) {
    const config: ExtractionConfig = {
      selectors,
      text: true,
    };
    result[field] = extractContent(html, config);
  }

  return result;
}
