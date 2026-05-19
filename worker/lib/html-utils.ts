import * as cheerio from "cheerio";

export interface ExtractedData {
  [key: string]: string[];
}

export function extractBySelectors(
  html: string,
  selectors: Record<string, string>,
): ExtractedData {
  const result: ExtractedData = {};
  const $ = cheerio.load(html);

  for (const [key, selector] of Object.entries(selectors)) {
    const elements = $(selector);
    result[key] = elements
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((text) => text.length > 0);
  }

  return result;
}

export function extractFromHtml(
  html: string,
  config: {
    selectors?: Record<string, string>;
    regex_patterns?: Record<string, RegExp[]>;
  },
): ExtractedData {
  const result: ExtractedData = {};

  if (config.selectors) {
    const selectorResult = extractBySelectors(html, config.selectors);
    Object.assign(result, selectorResult);
  }

  if (config.regex_patterns) {
    for (const [key, patterns] of Object.entries(config.regex_patterns)) {
      if (!result[key] || result[key].length === 0) {
        const matches: string[] = [];
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(html)) !== null) {
            const matchedText = match[1] ?? match[0];
            if (matchedText) matches.push(matchedText.trim());
          }
        }
        if (matches.length > 0) {
          result[key] = [...new Set(matches)];
        }
      }
    }
  }

  return result;
}
