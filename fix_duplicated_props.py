import os
import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    new_lines = []
    seen_keys = set()

    # We want to remove any line that is a duplicate of a key in the same object literal
    # For simplicity, let's just track globally for now as most tests have one mockEnv
    # But wait, some have multiple objects.

    # Let's reset seen_keys when we see an opening brace that looks like start of object

    for line in lines:
        if '{' in line:
            # If it's a new object being defined, we might want to reset,
            # but that's complex. Let's just look for the specific duplicated key.
            pass

        match = re.search(r'^\s*([A-Z_]+)\s*:', line)
        if match:
            key = match.group(1)
            if key == 'EMAIL_WEBHOOK_SECRET':
                if key in seen_keys:
                    continue # Skip duplicate
                seen_keys.add(key)

        new_lines.append(line)
        # Reset seen_keys on closing brace of the main object if possible
        if '}' in line and ('as unknown as Env' in line or 'as any' in line):
             seen_keys = set()

    with open(filepath, 'w') as f:
        f.writelines(new_lines)

files = [
    'tests/integration/api.test.ts',
    'tests/integration/mcp-tools.test.ts',
    'tests/integration/referrals.test.ts',
    'tests/integration/research-api.test.ts',
    'tests/integration/scheduled.test.ts',
    'tests/integration/validation-fast-path.test.ts',
    'tests/unit/budget-allocation.test.ts',
    'tests/unit/cache.test.ts',
    'tests/unit/circuit-breaker.test.ts',
    'tests/unit/config-threshold.test.ts',
    'tests/unit/config-validation-enhanced.test.ts',
    'tests/unit/discover.test.ts',
    'tests/unit/experience-api.test.ts',
    'tests/unit/expiration.test.ts',
    'tests/unit/funnel-metrics.test.ts',
    'tests/unit/lock.test.ts',
    'tests/unit/logger.test.ts',
    'tests/unit/mcp-resources.test.ts',
    'tests/unit/mcp-tools.test.ts',
    'tests/unit/notify.test.ts',
    'tests/unit/publish.test.ts',
    'tests/unit/rate-limit.test.ts',
    'tests/unit/research-agent.test.ts',
    'tests/unit/score.test.ts',
    'tests/unit/security-auth.test.ts',
    'tests/unit/security-gatekeeper.test.ts',
    'tests/unit/stage.test.ts',
    'tests/unit/state-machine.test.ts',
    'tests/unit/storage.test.ts',
    'tests/unit/validate.test.ts',
    'tests/unit/webhook-delivery-parallel.test.ts',
    'tests/unit/worker-init.test.ts'
]

for f in files:
    if os.path.exists(f):
        fix_file(f)
