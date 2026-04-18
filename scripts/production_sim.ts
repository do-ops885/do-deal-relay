async function simulateProductionUsage() {
  console.log("Simulating Production Usage...");
  const baseUrl = process.env.WORKER_URL || "http://localhost:8787";

  const endpoints = [
    "/health",
    "/metrics",
    "/deals",
    "/deals.json"
  ];

  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const res = await fetch(`${baseUrl}${endpoint}`);
      console.log(`GET ${endpoint} - ${res.status} (${Date.now() - start}ms)`);
    } catch (e) {
      console.error(`Failed to fetch ${endpoint}:`, e);
    }
  }
}

simulateProductionUsage().catch(console.error);
