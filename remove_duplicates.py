import os
import re

def clean_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Simple regex to find the mock environment object and remove duplicate keys
    # This is a bit risky but we can check the results.
    # Looking for blocks like:
    # mockEnv = {
    #   ...
    #   DEALS_PROD: ...,
    #   ...
    #   DEALS_PROD: {} as KVNamespace,
    # }

    lines = content.split('\n')
    new_lines = []
    env_block = False
    seen_keys = set()

    for line in lines:
        if 'mockEnv = {' in line or 'mockEnv: Env = {' in line:
            env_block = True
            seen_keys = set()
            new_lines.append(line)
            continue

        if env_block:
            if '}' in line and ';' in line:
                env_block = False
                new_lines.append(line)
                continue

            match = re.search(r'^\s*([A-Z0-9_]+):', line)
            if match:
                key = match.group(1)
                if key in seen_keys:
                    print(f"Removing duplicate key {key} in {filepath}")
                    continue
                seen_keys.add(key)

        new_lines.append(line)

    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines))

files = [
    "tests/unit/bulk/export.test.ts",
    "tests/unit/bulk/import.test.ts",
    "tests/unit/discover.test.ts",
    "tests/unit/experience-api.test.ts",
    "tests/unit/lock.test.ts",
    "tests/unit/nlq/handlers-get-explain.test.ts",
    "tests/unit/nlq/handlers-post.test.ts",
    "tests/unit/nlq/index.test.ts",
    "tests/unit/nlq/service.test.ts",
    "tests/unit/nlq/utils.test.ts",
    "tests/unit/rate-limit.test.ts",
    "tests/unit/research-agent.test.ts",
    "tests/unit/score.test.ts",
    "tests/unit/security-auth.test.ts",
    "tests/unit/security-gatekeeper.test.ts",
    "tests/unit/stage.test.ts"
]

for f in files:
    if os.path.exists(f):
        clean_file(f)
