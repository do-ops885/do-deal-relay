import { Deal } from "../worker/types";

function generateMockDeals(count: number): Deal[] {
  const deals: Deal[] = [];
  const statuses = ["active", "quarantined", "rejected"] as const;

  for (let i = 0; i < count; i++) {
    const status = statuses[i % 3];
    // Explicit guard for TypeScript due to noUncheckedIndexedAccess
    if (!status) {
      throw new Error("Invalid status index");
    }

    deals.push({
      id: Math.random().toString(36).substring(2, 15),
      source: {
        url: "https://example.com",
        domain: "example.com",
        discovered_at: new Date().toISOString(),
        trust_score: Math.random(),
      },
      title: `Deal ${i}`,
      description: `Description for deal ${i}`,
      code: `CODE${i}`,
      url: `https://example.com/deal/${i}`,
      reward: {
        type: "cash",
        value: Math.floor(Math.random() * 100),
      },
      expiry: {
        confidence: 0.9,
        type: "hard",
      },
      metadata: {
        category: ["finance"],
        tags: ["tag1"],
        normalized_at: new Date().toISOString(),
        confidence_score: Math.random(),
        status: status,
      },
    });
  }
  return deals;
}

const DEALS_COUNT = 5000;
const deals = generateMockDeals(DEALS_COUNT);

function benchStats() {
  const start = performance.now();
  const stats = {
    total: deals.length,
    active: deals.filter((d) => d.metadata.status === "active").length,
    quarantined: deals.filter((d) => d.metadata.status === "quarantined")
      .length,
    rejected: deals.filter((d) => d.metadata.status === "rejected").length,
    duplicates: 0,
  };
  const end = performance.now();
  return { duration: end - start, stats };
}

function benchSortLocaleCompare() {
  const dealsCopy = [...deals];
  const start = performance.now();
  dealsCopy.sort((a, b) => {
    const idA = a.id;
    const idB = b.id;
    return (idA || "").localeCompare(idB || "");
  });
  const end = performance.now();
  return end - start;
}

function benchSortDirect() {
  const dealsCopy = [...deals];
  const start = performance.now();
  dealsCopy.sort((a, b) => {
    const idA = a.id || "";
    const idB = b.id || "";
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  const end = performance.now();
  return end - start;
}

console.log(`Running benchmark with ${DEALS_COUNT} deals...`);

const statsResult = benchStats();
console.log(
  `Stats calculation (filter x3): ${statsResult.duration.toFixed(4)}ms`,
);

const localeSort = benchSortLocaleCompare();
console.log(`Sort (localeCompare): ${localeSort.toFixed(4)}ms`);

const directSort = benchSortDirect();
console.log(`Sort (direct): ${directSort.toFixed(4)}ms`);

const improvement = ((localeSort - directSort) / localeSort) * 100;
console.log(`Sort improvement: ${improvement.toFixed(2)}%`);

function benchStatsSinglePass() {
  const start = performance.now();
  let active = 0;
  let quarantined = 0;
  let rejected = 0;
  for (const d of deals) {
    const status = d.metadata.status;
    if (status === "active") {
      active++;
    } else if (status === "quarantined") {
      quarantined++;
    } else if (status === "rejected") {
      rejected++;
    }
  }
  const stats = {
    total: deals.length,
    active,
    quarantined,
    rejected,
    duplicates: 0,
  };
  const end = performance.now();
  return { duration: end - start, stats };
}

const singlePassResult = benchStatsSinglePass();
console.log(
  `Stats calculation (single pass): ${singlePassResult.duration.toFixed(4)}ms`,
);

const statsImprovement =
  ((statsResult.duration - singlePassResult.duration) / statsResult.duration) *
  100;
console.log(`Stats improvement: ${statsImprovement.toFixed(2)}%`);
