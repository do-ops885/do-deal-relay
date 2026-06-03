# ACTIONS - do-deal-relay

> When delegating: create the GitHub Issue, then record the issue number here as `jules_issue: <number>`.

actions:
  - id: init-state-files
    title: "Introduce stateful planning, learnings log, and session checklist"
    status: "in-progress"
    cost: "small"
    dependencies: []
    notes: "Initial setup of GOAP_STATE, ACTIONS, and LEARNINGS files."
    jules_issue: null   # populate with GH issue number once delegated

queue:
  - id: example-queued-task
    title: "Example task for the queue"
    status: "queued"
    cost: "medium"
    dependencies: ["init-state-files"]
    notes: "This is an example entry."
    jules_issue: null
