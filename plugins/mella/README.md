# Mella Plugin

Mella's collection of productivity tools for Claude Code.

## Commands

### `/mella:commit`

Create git commits with optional intelligent grouping.

**Usage:**
```bash
/mella:commit              # Standard commit (like /commit-commands:commit)
/mella:commit --group      # Analyze changes and create grouped commits
```

**Features:**
- **Standard mode**: Creates a single commit with all staged/unstaged changes
- **Grouped mode (`--group`)**: Intelligently analyzes changed files and groups them into logical, separate commits
  - Separates dependency updates from code changes
  - Groups related files together
  - Generates descriptive commit messages following commit conventions
  - Automatically stages unstaged files

**Example:**

When you have changes to both `package.json`, `composer.json`, and source files like `Controller.php`:

```bash
/mella:commit --group
```

This will create separate commits:
1. "Update dependencies" (package.json, composer.json)
2. "Add authentication to user controller" (Controller.php, Middleware.php)

### `/mella:walkthrough`

Interactive walkthrough command for documentation and QA.

## Installation

This plugin is part of the mella-marketplace. To use it:

1. Clone or install from marketplace
2. Enable in Claude Code settings
3. Commands will be available as `/mella:command-name`

## License

MIT
