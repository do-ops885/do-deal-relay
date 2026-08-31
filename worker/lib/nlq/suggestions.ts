import { classifyIntent } from "./intent";
import { DEFAULT_NLQ_CONFIG } from "./types";
import type { NLQIntent } from "./types";

// Curated completions per intent — used for prefix matching and empty-state suggestions
const INTENT_TEMPLATES: Record<NLQIntent, string[]> = {
  search: [
    "find trading platforms with $100 bonus",
    "find banking deals with cash rewards",
    "search crypto referral bonuses over $50",
    "show investment deals for beginners",
  ],
  compare: [
    "compare trading212 vs revolut rewards",
    "compare top banking bonuses",
    "compare crypto exchanges by bonus value",
  ],
  filter: [
    "filter deals with reward over $100",
    "only show active trading deals",
    "with expiry in next 30 days",
  ],
  rank: [
    "top 10 highest reward deals",
    "best ranked trading deals",
    "rank by confidence score",
  ],
  suggest: [
    "suggest similar to trading212 invite",
    "recommend alternatives to revolut referral",
    "suggest best value bonuses",
  ],
  count: [
    "how many active trading deals",
    "count of deals by domain",
    "total deals expiring this week",
  ],
  unknown: [],
};

const ALL_TEMPLATES = Object.values(INTENT_TEMPLATES).flat();

const POPULAR_CATEGORIES = Object.keys(DEFAULT_NLQ_CONFIG.categoryMappings);
const POPULAR_REWARD_TYPES = Object.keys(DEFAULT_NLQ_CONFIG.rewardTypeMappings);

export interface Suggestion {
  text: string;
  intent: NLQIntent;
  confidence: number;
}

export function getSuggestions(prefix: string, limit = 8): Suggestion[] {
  const q = prefix.trim().toLowerCase().slice(0, 100);
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  if (!q) {
    return ALL_TEMPLATES.slice(0, safeLimit).map((t) => ({
      text: t,
      intent: classifyIntent(t).intent,
      confidence: 0.6,
    }));
  }

  const intent = classifyIntent(q);
  const candidates: Suggestion[] = [];

  // 1) Intent-aware templates matching prefix tokens
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tmpl of ALL_TEMPLATES) {
    const lower = tmpl.toLowerCase();
    const matchScore = tokens.reduce(
      (score, tok) => score + (lower.includes(tok) ? 1 : 0),
      0,
    );
    if (matchScore > 0 || lower.startsWith(q)) {
      const tmplIntent = classifyIntent(tmpl);
      candidates.push({
        text: tmpl,
        intent: tmplIntent.intent,
        confidence: 0.5 + matchScore * 0.1,
      });
    }
  }

  // 2) Category completions
  for (const cat of POPULAR_CATEGORIES) {
    if (cat.startsWith(q) || q.includes(cat.slice(0, 3))) {
      candidates.push({
        text: `find ${cat} deals with cash bonus`,
        intent: "search",
        confidence: 0.55,
      });
    }
  }

  // 3) Prefix completion from raw query (echo + intent hint)
  if (candidates.length < safeLimit) {
    // generate a direct completion suggestion
    const intentHint =
      intent.intent !== "unknown" && intent.intent !== "search"
        ? ` (${intent.intent})`
        : "";
    candidates.push({
      text: prefix + (prefix.endsWith(" ") ? "deals" : " deals"),
      intent: intent.intent === "unknown" ? "search" : intent.intent,
      confidence: intent.confidence || 0.4,
    });
    void intentHint; // keep hint for future use without unused warning
  }

  // Deduplicate by text
  const seen = new Set<string>();
  const deduped: Suggestion[] = [];
  for (const c of candidates) {
    if (!seen.has(c.text.toLowerCase())) {
      seen.add(c.text.toLowerCase());
      deduped.push(c);
    }
  }

  // Boost primary intent matches
  deduped.sort((a, b) => {
    const aBoost = a.intent === intent.intent ? 0.2 : 0;
    const bBoost = b.intent === intent.intent ? 0.2 : 0;
    return b.confidence + bBoost - (a.confidence + aBoost);
  });

  return deduped.slice(0, safeLimit);
}
