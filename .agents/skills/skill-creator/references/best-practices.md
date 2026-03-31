# Best Practices for Skill Development

## Content Guidelines

### Keep Skills Focused

A skill should solve one problem well. If you find yourself covering multiple domains, consider splitting into separate skills.

**Good**: "Working with PostgreSQL databases"
**Bad**: "Working with all types of databases, file systems, and cloud storage"

### Write for Your Audience

- **Beginner skills**: Include more context, explanations, and step-by-step instructions
- **Advanced skills**: Assume knowledge, focus on patterns and edge cases
- **Reference skills**: Comprehensive, searchable, well-organized

### Provide Concrete Examples

Always include working examples that users can run or adapt:

````markdown
## Example: Query a Database

```python
import psycopg2

conn = psycopg2.connect("dbname=test user=postgres")
cur = conn.cursor()
cur.execute("SELECT * FROM users WHERE active = %s", (True,))
results = cur.fetchall()
```
````

````

### Handle Errors Gracefully

Include error handling patterns:

```markdown
## Error Handling

If connection fails:
1. Check credentials
2. Verify network access
3. Check database logs
4. Retry with exponential backoff
````

## Technical Requirements

### The 250-Line Rule

Skills must be under 250 lines. This forces:

- Concise writing
- Clear focus
- Easier maintenance
- Better organization

If you exceed 250 lines:

1. Move detailed content to references/
2. Create multiple focused skills
3. Remove redundant information
4. Use bullet points over paragraphs

### Frontmatter Standards

Required fields:

```yaml
---
name: skill-name # Short, descriptive
description: What it does # One sentence
version: 1.0.0 # Semantic versioning
author: name # Who maintains it
tags: [tag1, tag2] # Discovery keywords
---
```

### File Organization

```
skill-name/
├── SKILL.md                  # Main skill (max 250 lines)
├── references/               # Detailed docs
│   ├── advanced.md
│   └── examples.md
├── examples/                 # Sample code
│   └── demo.py
└── scripts/                  # Helper scripts
    └── validate.py
```

## Writing Style

### Be Direct

**Avoid**: "It is generally considered a good practice to..."
**Use**: "Always validate user input"

### Use Active Voice

**Avoid**: "The database connection should be closed by the user"
**Use**: "Close the database connection when done"

### Number Steps

When providing instructions, use numbered lists:

1. Install the package
2. Configure the connection
3. Run the migration
4. Verify the results

### Use Present Tense

**Avoid**: "You will need to..."
**Use**: "Install the package..."

## Code in Skills

### Code Block Standards

Always specify the language:

```python
# Good - language specified
def hello():
    return "Hello"
```

```
# Bad - no language
python code here
```

### Keep Code Short

Long code examples should go in references/ or examples/:

````markdown
## Basic Usage

Simple example in SKILL.md:

```python
# Quick example
import requests
r = requests.get("https://api.example.com/data")
```
````

See [examples/full_demo.py](examples/full_demo.py) for complete example.

````

### Explain Complex Code

Add brief explanations after code blocks:

```python
result = await process_async(items)
````

The `await` keyword pauses execution until all items are processed.

## Maintenance

### Versioning

Use semantic versioning:

- **Major (X.0.0)**: Breaking changes to how skill works
- **Minor (0.X.0)**: New features, backward compatible
- **Patch (0.0.X)**: Bug fixes, documentation updates

### Changelogs

Track changes in references/changelog.md:

```markdown
# Changelog

## 1.2.0 (2025-01-20)

- Added support for WebSocket connections
- Improved error handling examples

## 1.1.0 (2025-01-15)

- Fixed broken link to API docs
- Added Redis caching example

## 1.0.0 (2025-01-10)

- Initial release
```

### Regular Reviews

Review skills periodically:

- Are instructions still accurate?
- Have dependencies changed?
- Are examples still working?
- Can content be more concise?

## Testing Skills

### Before Publishing

1. Validate structure with quick_validate.py
2. Test all code examples
3. Check all links work
4. Verify 250-line limit
5. Review for clarity

### After Changes

1. Increment version
2. Update changelog
3. Test modified examples
4. Validate again
5. Re-run benchmarks if applicable

## Common Mistakes to Avoid

1. **Too broad scope** - Keep skills focused
2. **Missing examples** - Always include working code
3. **No error handling** - Show what can go wrong
4. **Outdated information** - Keep dependencies current
5. **Exceeding 250 lines** - Move details to references/
6. **Poor organization** - Use clear headings
7. **Vague instructions** - Be specific and actionable
8. **No version tracking** - Always version your skills

## Quick Checklist

Before marking a skill as complete:

- [ ] Under 250 lines
- [ ] Proper frontmatter
- [ ] Clear overview section
- [ ] Working examples
- [ ] Error handling guidance
- [ ] References linked
- [ ] Version incremented
- [ ] Validated with quick_validate.py
- [ ] All links working
- [ ] Content reviewed for clarity
