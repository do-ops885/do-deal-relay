# Auto-detection of repository parameters

The CLI auto-detects the `provider`, `organization`, and `repository` from the git remote origin URL when run inside a repository. This means most commands work without specifying these parameters explicitly:

```bash
# Auto-detected (run inside the repo)
codacy issues
codacy repository
codacy pull-request 42

# Equivalent explicit form
codacy issues gh my-org my-repo
codacy repository gh my-org my-repo
codacy pull-request gh my-org my-repo 42
```

Auto-detection supports GitHub, GitLab, and Bitbucket remote URLs. If the remote cannot be parsed (e.g., non-standard hosting), pass the parameters explicitly. All examples in this document use the explicit form for clarity, but the short form is preferred when running inside a repo.


> Extracted from: ../SKILL.md
