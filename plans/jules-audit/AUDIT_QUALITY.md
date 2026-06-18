# Track B - Code Quality

- **Magic Numbers**: Identified magic numbers in `worker/state-machine.ts`
  - Line 109: `300` -> Replace with `CONFIG.LOCK_TTL_SECONDS`
  - Line 191: `1000` -> Replace with `CONFIG.RETRY_DELAY_MS`
- **Console Logs**: Identified console.log in `worker/lib/global-logger.ts` and `worker/lib/logger/structured.ts`. These are intentional as they are part of the logging system implementation.

