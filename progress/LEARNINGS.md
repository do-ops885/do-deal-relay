
## Learning: Updating Cloudflare Skill (2026-06-21)
- **Problem**: The `cloudflare` skill was missing evals and was exceeding line limits in `SKILL.md`.
- **Solution**:
  - Restructured `SKILL.md` to move the extensive product index to a reference file (`references/product-index.md`), keeping the main skill file under 250 lines as required by `skill-creator` standards.
  - Added 12 comprehensive test cases in `evals/evals.json` covering Workers, KV, D1, R2, DO, AI, and more.
  - Added versioning and author metadata to the frontmatter.
- **Verification**: Used `quick_validate.py` for content standards and `check_structure.py` for structural integrity. Both passed.
- **Usage**: The skill is now more scannable and includes explicit retrieval-first directives to ensure agents use the latest Cloudflare documentation.
