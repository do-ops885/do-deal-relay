# GOAP State: GitHub PR Management

## Goal
Review, fix, and merge all open PRs in correct dependency order

## Constraints
- CI must pass before merge
- Dependencies must be merged in correct order (avoid conflicts)
- Auto-generated PRs (dependabot/jules) should be evaluated for impact

## PR Analysis
| PR | Title | Type | Dependencies | Priority |
|----|-------|------|--------------|----------|
| 548 | ci: bump actions/checkout 6.0.3→7.0.0 | CI | 546,547 | P0 |
| 547 | ci: bump actions/setup-go 5.6.0→6.5.0 | CI | 546 | P0 |
| 546 | ci: bump github-actions group | CI | None | P0 |
| 545 | chore: bump @types/node | Deps | None | P1 |
| 544 | chore: bump protobufjs | Deps | None | P1 |
| 543 | chore: bump @cloudflare/workers-types | Deps | None | P0 |
| 542 | chore: bump testing group | Deps | None | P1 |
| 541 | chore: bump cloudflare group | Deps | None | P0 |
| 540 | [Jules] 7 safe dependencies | Deps | 541-545 | P0 |
| 539 | [Jules] playwright 1.61.0→1.61.1 | Deps | 542 | P1 |

## Dependency Graph
```
546 (github-actions base)
├── 547 (actions/setup-go)
└── 548 (actions/checkout)

541 (cloudflare group)
├── 543 (@cloudflare/workers-types)
├── 540 (Jules - 7 safe deps)
└── 545 (@types/node)

542 (testing group)
└── 539 (Jules - playwright)

544 (protobufjs) - independent
```

## Merge Strategy
1. Merge independent PRs first (544)
2. Merge base groups (546, 541, 542)
3. Merge dependent PRs (547, 548, 543, 545, 540, 539)
4. Resolve any conflicts that arise

## Execution Plan
- Use swarm agents to analyze all PRs in parallel
- Sequential merge in dependency order
- Quality gate: CI must pass
