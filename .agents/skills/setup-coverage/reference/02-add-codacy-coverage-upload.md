# Add Codacy coverage upload

> Extracted from ../SKILL.md; see primary for context.


Add a coverage upload step to the CI/CD pipeline **after** the test/coverage step.

## Authentication

The upload requires one of:

**Option A — Repository token (single repo, simpler):**

- Set `CODACY_PROJECT_TOKEN` as a CI/CD secret
- Obtain from: Codacy > Repository Settings > Coverage > Repository API Token

**Option B — Account token (multiple repos):**

- Set these CI/CD secrets:
  - `CODACY_API_TOKEN` — from Codacy > My Account > Access Management
  - `CODACY_ORGANIZATION_PROVIDER` — `gh`, `gl`, or `bb`
  - `CODACY_USERNAME` — organization or username
  - `CODACY_PROJECT_NAME` — repository name

Always remind the user to add the appropriate token as a CI/CD secret.

### Upload command

The standard upload command:

```bash
bash <(curl -Ls https://coverage.codacy.com/get.sh) report -r <coverage-report-file>
```

For **Go** coverage, add the parser flag:

```bash
bash <(curl -Ls https://coverage.codacy.com/get.sh) report \
  --force-coverage-parser go -r coverage.out
```

For **multiple reports** (e.g., monorepos or multi-module projects):

```bash
bash <(curl -Ls https://coverage.codacy.com/get.sh) report \
  -r report1.xml -r report2.xml
```

Or use partial uploads:

```bash
bash <(curl -Ls https://coverage.codacy.com/get.sh) report --partial -r report1.xml
bash <(curl -Ls https://coverage.codacy.com/get.sh) report --partial -r report2.xml
bash <(curl -Ls https://coverage.codacy.com/get.sh) final
```

### CI/CD-specific integration

**GitHub Actions:**

```yaml
- name: Upload coverage to Codacy
  env:
    CODACY_PROJECT_TOKEN: ${{ secrets.CODACY_PROJECT_TOKEN }}
  run: bash <(curl -Ls https://coverage.codacy.com/get.sh) report -r <report-file>
```

Or use the official action:

```yaml
- name: Upload coverage to Codacy
  uses: codacy/codacy-coverage-reporter-action@v1
  with:
    project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}
    coverage-reports: <report-file>
```

**GitLab CI:**

```yaml
upload-coverage:
  stage: test
  script:
    - bash <(curl -Ls https://coverage.codacy.com/get.sh) report -r <report-file>
  variables:
    CODACY_PROJECT_TOKEN: $CODACY_PROJECT_TOKEN
```

**CircleCI (using orb):**

```yaml
orbs:
  codacy: codacy/coverage-reporter@13

workflows:
  main:
    jobs:
      - test
      - codacy/upload_coverage:
          requires: [test]
```

**Travis CI:**

```yaml
after_success:
  - bash <(curl -Ls https://coverage.codacy.com/get.sh) report -r <report-file>
```

**Bitbucket Pipelines:**

```yaml
- step:
    name: Upload coverage
    script:
      - bash <(curl -Ls https://coverage.codacy.com/get.sh) report -r <report-file>
```

**Alpine Linux (no bash):**

```bash
wget -qO - https://coverage.codacy.com/get.sh | sh -s -- report -r <report-file>
```

See [references/coverage-upload.md](references/coverage-upload.md) for advanced upload scenarios.

