#!/usr/bin/env python3
"""
Initialize a new skill with proper directory structure and starter files.
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path


SKILL_TEMPLATE = '''---
name: {skill_name}
description: Brief description of what this skill does
version: 1.0.0
author: {author}
tags: [tag1, tag2]
---

# {skill_name}

## Overview

Brief description of the skill's purpose and what problems it solves.

## Quick Start

Essential commands or patterns to get started:

```bash
# Example command
echo "Hello World"
```

## Main Content

### Section 1: Topic

Detailed instructions about the first major topic.

1. Step one
2. Step two
3. Step three

```python
# Example code
print("Example")
```

### Section 2: Another Topic

More detailed instructions.

- Point A
- Point B
- Point C

## Error Handling

Common issues and how to resolve them:

1. **Problem**: Description
   - Solution: How to fix it

## References

- [Reference 1](references/topic1.md)
- [Reference 2](references/topic2.md)

## Examples

See [examples/](examples/) for complete working examples.

## Version History

- 1.0.0 ({date}) - Initial release
'''


def create_directory_structure(base_path: Path) -> None:
    """Create the skill directory structure."""
    directories = [
        "references",
        "examples",
        "scripts"
    ]
    
    for directory in directories:
        dir_path = base_path / directory
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"Created: {dir_path}")


def create_skill_md(base_path: Path, skill_name: str, author: str) -> None:
    """Create the main SKILL.md file."""
    skill_file = base_path / "SKILL.md"
    date_str = datetime.now().strftime("%Y-%m-%d")
    
    content = SKILL_TEMPLATE.format(
        skill_name=skill_name,
        author=author,
        date=date_str
    )
    
    skill_file.write_text(content)
    print(f"Created: {skill_file}")


def create_reference_files(base_path: Path) -> None:
    """Create starter reference files."""
    refs_dir = base_path / "references"
    
    # README for references
    readme_content = """# References

This directory contains detailed documentation and reference materials.

## Contents

Add detailed documentation files here that support the main SKILL.md.

Examples:
- advanced.md - Advanced usage patterns
- troubleshooting.md - Common issues and solutions
- api-reference.md - Complete API documentation
- examples.md - Extended examples
"""
    
    (refs_dir / "README.md").write_text(readme_content)
    print(f"Created: {refs_dir / 'README.md'}")


def create_examples_dir(base_path: Path) -> None:
    """Create starter example files."""
    examples_dir = base_path / "examples"
    
    readme_content = """# Examples

This directory contains working examples demonstrating the skill.

## Contents

Add complete, working examples here.

Examples should be:
- Self-contained
- Well-commented
- Tested and working
- Demonstrating real use cases
"""
    
    (examples_dir / "README.md").write_text(readme_content)
    print(f"Created: {examples_dir / 'README.md'}")


def create_scripts_dir(base_path: Path) -> None:
    """Create starter script files."""
    scripts_dir = base_path / "scripts"
    
    # Test script template
    test_script = '''#!/usr/bin/env python3
"""
Test script for {skill_name} skill.
"""

import sys
from pathlib import Path

def test_skill():
    """Run skill tests."""
    print("Testing {skill_name} skill...")
    
    # Add your tests here
    # Return 0 for success, 1 for failure
    
    return 0

if __name__ == "__main__":
    sys.exit(test_skill())
'''
    
    (scripts_dir / "test.py").write_text(test_script)
    print(f"Created: {scripts_dir / 'test.py'}")


def main():
    parser = argparse.ArgumentParser(
        description="Initialize a new skill with proper structure"
    )
    parser.add_argument(
        "skill_name",
        help="Name of the skill to create"
    )
    parser.add_argument(
        "--base-path",
        default=".agents/skills",
        help="Base path for skills directory (default: .agents/skills)"
    )
    parser.add_argument(
        "--author",
        default="anonymous",
        help="Author name for the skill"
    )
    
    args = parser.parse_args()
    
    # Determine full path
    base_path = Path(args.base_path) / args.skill_name
    
    # Check if skill already exists
    if base_path.exists():
        print(f"Error: Skill '{args.skill_name}' already exists at {base_path}")
        sys.exit(1)
    
    print(f"Creating skill: {args.skill_name}")
    print(f"Location: {base_path.absolute()}")
    print()
    
    # Create structure
    create_directory_structure(base_path)
    create_skill_md(base_path, args.skill_name, args.author)
    create_reference_files(base_path)
    create_examples_dir(base_path)
    create_scripts_dir(base_path)
    
    print()
    print(f"Skill '{args.skill_name}' initialized successfully!")
    print()
    print("Next steps:")
    print(f"1. Edit {base_path}/SKILL.md with your content")
    print(f"2. Add examples to {base_path}/examples/")
    print(f"3. Validate with: python quick_validate.py {base_path}")


if __name__ == "__main__":
    main()
