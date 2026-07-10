# Invocation modes

The skill supports three modes that control whether configuration is imported to Codacy Cloud after tuning:

- **Interactive (default):** After tuning and presenting results, prompt the user via `AskUserQuestion` whether to import the configuration to Codacy Cloud. This is the default when no arguments are provided.
- **Auto-import:** If the user's invocation arguments contain the word "import" (e.g., `/configure-codacy import configuration`, `/configure-codacy --import`), skip the import prompt and import automatically after presenting results. Useful for CI runs and automation.
- **Local-only:** If the repo is not on Codacy Cloud (determined in Step 0), never ask about importing. Present results and note that the config is ready for local analysis only.

Additionally, the **force** flag controls Coding Standard handling during import:

- **Force disabled (default):** If the import encounters Coding Standard conflicts (409 errors), **do NOT automatically retry with `--force`**. Instead, present the conflicts to the user via `AskUserQuestion` and let them decide whether to unlink the Coding Standards.
- **Force enabled:** If the user's invocation arguments contain the word "force" (e.g., `/configure-codacy import force`), automatically retry with `--force` when Coding Standard conflicts occur.

Parse the invocation arguments at the very start. Set internal flags that Step 6 will reference:

- If args contain "import" → auto-import mode
- If args contain "force" → force mode (allows automatic Coding Standard unlinking)
- Else → interactive mode (may become local-only if Step 0 finds the repo is not on Cloud)


> Extracted from: ../SKILL.md
