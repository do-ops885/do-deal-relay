import os

RATIONALIZATIONS = """
## Rationalizations

| Concern | Counter-Argument |
|---------|------------------|
| "This is just a small change, no need for coordination." | Even small changes can have side effects. Structured coordination ensures nothing is missed. |
| "Writing an ADR/Plan takes too much time." | Investing time in planning saves significantly more time during execution and debugging. |
| "I can do this all in one go." | Breaking tasks down into atomic steps increases reliability and allows for better verification. |
"""

RED_FLAGS = """
## Red Flags

- [ ] Starting execution before a plan is approved.
- [ ] Making multiple unrelated changes in a single commit.
- [ ] Skipping validation gates or quality checks.
- [ ] Lack of coordination between parallel tasks leading to conflicts.
- [ ] Failing to update documentation after architectural changes.
"""

def update_skill(skill_path):
    skill_md_path = os.path.join(skill_path, "SKILL.md")
    if not os.path.exists(skill_md_path):
        return

    with open(skill_md_path, "r") as f:
        content = f.read()

    changed = False
    if "## Rationalizations" not in content:
        content += RATIONALIZATIONS
        changed = True

    if "## Red Flags" not in content:
        content += RED_FLAGS
        changed = True

    if changed:
        with open(skill_md_path, "w") as f:
            f.write(content)
        print(f"Updated {skill_md_path}")

skills_dir = ".agents/skills"
for skill_name in os.listdir(skills_dir):
    skill_path = os.path.join(skills_dir, skill_name)
    if os.path.isdir(skill_path):
        update_skill(skill_path)
