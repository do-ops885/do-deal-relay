# Integration

### With structured-logging

```typescript
import { Logger } from "../structured-logging";
import { AIActLogger } from "./eu-ai-act-compliance";

// Combine both loggers
const baseLogger = new Logger({ service: "deal-processor" });
const complianceLogger = new AIActLogger({
  systemId: "do-deal-relay",
  riskClassification: "limited_risk",
  baseLogger, // Integrate with existing logger
});
```

### With Cloudflare Workers

```typescript
export default {
  async fetch(req, env) {
    const logger = new AIActLogger({
      systemId: "do-deal-relay",
      providerName: env.PROVIDER_NAME,
      retentionStorage: env.AI_ACT_LOGS, // KV or D1 binding
    });

    // Log AI operation
    await logger.logOperation({
      operation: "deal_discovery",
      inputData: { source: "api_request", hash: "..." },
      outputData: { result: "success" },
    });

    return new Response("OK");
  },
};
```


> Extracted from: ../SKILL.md
