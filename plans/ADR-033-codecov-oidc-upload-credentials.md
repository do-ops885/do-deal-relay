# ADR-033: Codecov Upload Credentials (OIDC) and Workflow-Permission Blocker

**Status**: Accepted
**Created**: 2026-10-13
**Decision Maker**: do-deal-relay Platform Team
**Type**: CI Credential Policy

---

## Context

Issue #968: `Unit Tests` on `main` fails only at "Upload coverage to Codecov"
with `Token required - not valid tokenless upload`. All unit and integration
tests pass; Deploy-Production is unaffected. The last green `main` CI was run
2609 (2026-10-12T10:36Z).

`codecov/codecov-action` is pinned at
`303a32d7a59b442fa8d48b6a1cc6825c09c847a5` (v7.1.1). That release removed the
legacy tokenless upload path, so an upload without `CODECOV_TOKEN` or OIDC is
rejected. The action exposes `use_oidc` ("Use OIDC instead of token"), which
requires the workflow job to hold `id-token: write`.

The fix touches `.github/workflows/ci.yml`. The GitHub App credential used by
this agent has no `workflows` permission:

```
! [remote rejected] cline/3xz9zsaa -> cline/3xz9zsaa
  (refusing to allow a GitHub App to create or update workflow
   `.github/workflows/ci.yml` without `workflows` permission)
```

Workflow-file edits therefore cannot land from this environment (same class as
ADR-019/BLOCKED-2).

---

## Decision

1. **OIDC is the credential-free path.** The owner applies the patch below so
   the job carries `id-token: write` and the action uses OIDC when no
   `CODECOV_TOKEN` secret exists.
2. **`CODECOV_TOKEN` takes precedence** when provisioned; it keeps
   `fail_ci_if_error: true`.
3. **OIDC uploads are advisory** (`fail_ci_if_error: false`) so a missing
   Codecov GitHub App installation cannot redden `main` CI again. Coverage is
   already published as a workflow artifact, so a rejected upload degrades
   reporting, not correctness.
4. **No code change can supply the secret**; this ADR records the policy so the
   blocker is owner-scoped rather than silently re-triaged.

---

## Patch (owner applies, workflow permission required)

```yaml
# .github/workflows/ci.yml, job `test`
  test:
    name: Unit Tests
    needs: [lint]
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      id-token: write
    steps:
      # ... unchanged steps ...
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        with:
          files: ./coverage-unit/lcov.info
          token: ${{ secrets.CODECOV_TOKEN }}
          use_oidc: ${{ secrets.CODECOV_TOKEN == '' }}
          fail_ci_if_error: ${{ secrets.CODECOV_TOKEN != '' }}
          verbose: true
```

The patch is applied by the owner (workflow permission required); no script is shipped because it would need the same permission to be useful.

---

## Consequences

- `main` CI stops failing on the upload step once the patch lands, with or
  without a Codecov token.
- Coverage uploads remain visible in the job log; a rejected advisory upload
  produces a warning, not a red run.
- Issue #968 stays open until the owner applies the patch (or provisions the
  token). The GOAP register tracks it as owner-blocked with this ADR as
  evidence.

---

## References

- Issue #968, [ADR-019](ADR-019-deploy-timeout-too-low.md) (workflow-scope token),
  [ADR-023](ADR-023-ci-external-credentials-and-research-flake.md) (owner secret)
- `.github/workflows/ci.yml`, `codecov/codecov-action@v7.1.1` `action.yml` (`use_oidc`)
