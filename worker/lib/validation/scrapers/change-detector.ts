import type { Deal, Reward, Env } from "../../../types";
import { logger } from "../../global-logger";
import type { RewardChange } from "./types";
import { MAX_REWARD_CHANGE_THRESHOLD } from "./types";
import { scrapeCurrentRewards } from "./reward-scraper-core";

function normalizeValue(value: number | string): number | string {
  if (typeof value === "number") {
    return Math.round(value * 100) / 100;
  }
  return String(value).toLowerCase().trim();
}

export function compareRewards(
  previous: Reward,
  current: Reward,
): {
  changed: boolean;
  typeChanged: boolean;
  valueChanged: boolean;
  valueIncreased: boolean;
  valueDecreased: boolean;
  oldValue?: number | string;
  newValue?: number | string;
} {
  const typeChanged = previous.type !== current.type;

  const oldValue = normalizeValue(previous.value);
  const newValue = normalizeValue(current.value);
  const valueChanged = oldValue !== newValue;
  const valueIncreased =
    typeof oldValue === "number" &&
    typeof newValue === "number" &&
    newValue > oldValue;
  const valueDecreased =
    typeof oldValue === "number" &&
    typeof newValue === "number" &&
    newValue < oldValue;

  return {
    changed: typeChanged || valueChanged,
    typeChanged,
    valueChanged,
    valueIncreased,
    valueDecreased,
    oldValue,
    newValue,
  };
}

export async function detectRewardChanges(
  deal: Deal,
  env?: Env,
): Promise<RewardChange | null> {
  logger.info(`Checking for reward changes: ${deal.id}`, {
    component: "reward-scraper",
    dealId: deal.id,
  });

  const scrapeResult = await scrapeCurrentRewards(deal.url, env);

  if (!scrapeResult.success || !scrapeResult.currentReward) {
    logger.warn(`Could not scrape current rewards for deal`, {
      component: "reward-scraper",
      dealId: deal.id,
      error: scrapeResult.error,
    });
    return null;
  }

  const currentReward = scrapeResult.currentReward;
  const previousReward = deal.reward;

  const change = compareRewards(previousReward, currentReward);

  if (!change.changed) {
    logger.info(`No reward change detected for deal`, {
      component: "reward-scraper",
      dealId: deal.id,
    });
    return null;
  }

  let changeType: RewardChange["changeType"];
  let severity: RewardChange["severity"] = "info";

  if (change.typeChanged) {
    changeType = "type_changed";
    severity = "warning";
  } else if (change.valueDecreased) {
    changeType = "decreased";
    severity = "warning";
  } else if (change.valueIncreased) {
    changeType = "increased";
    severity = "info";
  } else {
    changeType = "new";
    severity = "info";
  }

  if (
    typeof change.oldValue === "number" &&
    typeof change.newValue === "number" &&
    Math.abs(change.newValue - change.oldValue) > MAX_REWARD_CHANGE_THRESHOLD
  ) {
    severity = "critical";
  }

  logger.info(`Reward change detected for deal`, {
    component: "reward-scraper",
    dealId: deal.id,
    changeType,
    severity,
  });

  return {
    deal,
    previousReward,
    currentReward,
    changeType,
    severity,
    detectedAt: new Date().toISOString(),
  };
}
