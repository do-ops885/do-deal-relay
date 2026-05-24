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