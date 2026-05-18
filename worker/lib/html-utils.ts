import * as cheerio from "cheerio";

/**
 * Interface for extracted data from HTML
 */
export interface ExtractedData {
  [key: string]: string[];
}

/**
 * Extract data from HTML using CSS selectors
 *
 * @param html - The HTML content to parse
 * @param selectors - A record of selector names to CSS selector strings
 * @returns A record of selector names to arrays of extracted text content
 */
export function extractBySelectors(
  html: string,
  selectors: Record<string, string>,
): ExtractedData {
  const result: ExtractedData = {};
  const $ = cheerio.load(html);

  for (const [key, selector] of Object.entries(selectors)) {
    const elements = $(selector);
    result[key] = elements
      .map((_, el) => {
        // For <a> tags, extract the href attribute instead of text content
        // so that URL selectors return actual links rather than link text.
        if ($(el).is("a")) {
          const href = $(el).attr("href");
          if (href) return href;
        }
        return $(el).text().trim();
      })
      .get()
      .filter((text) => text.length > 0);
  }

  return result;
}

/**
 * Extract data from HTML using both CSS selectors and regex patterns
 *
 * @param html - The HTML content to parse
 * @param config - Configuration containing selectors and/or regex patterns
 * @returns Extracted data
 */
export function extractFromHtml(
  html: string,
  config: {
    selectors?: Record<string, string>;
    regex_patterns?: Record<string, RegExp[]>;
  },
): ExtractedData {
  const result: ExtractedData = {};

  // 1. Try CSS selectors if available
  if (config.selectors) {
    const selectorResult = extractBySelectors(html, config.selectors);
    Object.assign(result, selectorResult);
  }

  // 2. Fall back to regex for missing fields or if no selectors provided
  if (config.regex_patterns) {
    for (const [key, patterns] of Object.entries(config.regex_patterns)) {
      if (!result[key] || result[key].length === 0) {
        const matches: string[] = [];
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          for (const match of html.matchAll(pattern)) {
            const matchedText = match[1] ?? match[0];
            if (matchedText) {
              matches.push(matchedText.trim());
            }
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
