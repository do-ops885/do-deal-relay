# Noise-evaluation guidance

Apply judgment proportional to relevance — be more demanding before disabling important patterns, more relaxed about low-relevance noise.

- **Security patterns get extra caution.** It *is* fine to disable a Security pattern that is irrelevant to this codebase (wrong stack or framework) or that only produces false positives — but be thorough and think twice before disabling any security pattern. When in doubt, inspect real examples first (`codacy issues -p <patternId> -o json`) and prefer parameter tuning or a path-ignore recommendation over disabling.
- **Never lightly disable Critical or High severity patterns.** Disable them only when clearly wrong-stack or confirmed false positives.
- **Be lenient on low-relevance categories** — CodeStyle, Documentation, Comprehensibility, and Minor-severity issues are the first to cut when they are noisy or mismatched to the project's conventions.
- **Prefer parameter tuning over disabling** wherever a threshold exists (Lizard complexity, line length, parameter counts) — it reduces noise while keeping the rule active.
- **Wrong stack → disable.** Patterns for languages or frameworks not present in the repository are pure noise.
- **Deduplicate overlap.** When two tools flag the same concern, keep the more precise tool's pattern and disable the redundant one — the concern stays covered.
- **Inspect before deciding.** For any borderline pattern, list its issues (`codacy issues -p <patternId>`) and look at real examples before disabling.


> Extracted from: ../SKILL.md
