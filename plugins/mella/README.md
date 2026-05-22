# Mella Plugin

Mella's collection of productivity tools for Claude Code.

## Commands

### `/mella:commit`

Create git commits with optional intelligent grouping, push, and PR creation.

**Usage:**
```bash
/mella:commit                    # Standard commit (like /commit-commands:commit)
/mella:commit group              # Analyze changes and create grouped commits
/mella:commit pr                 # Commit and handle PR (check if exists or ask to create)
/mella:commit push               # Commit and push to current branch
/mella:commit push origin/main   # Commit and push to specific branch
/mella:commit group pr push      # Combine all options
```

**Features:**
- **Standard mode**: Creates a single commit with all staged/unstaged changes
- **Grouped mode (`group`)**: Intelligently analyzes changed files and groups them into logical, separate commits
  - Separates dependency updates from code changes
  - Groups related files together
  - Generates descriptive commit messages following commit conventions
  - Automatically stages unstaged files
- **PR mode (`pr`)**: Checks if PR exists for current branch, or asks user if they want to create one
- **Push mode (`push`)**: Pushes commits to remote (current branch or specified branch)

**Example:**

When you have changes to both `package.json`, `composer.json`, and source files like `Controller.php`:

```bash
/mella:commit group pr push
```

This will:
1. Create separate commits:
   - "Update dependencies" (package.json, composer.json)
   - "Add authentication to user controller" (Controller.php, Middleware.php)
2. Push all commits to the remote
3. Check if a PR exists or ask to create one

### `/mella:review`

Orchestrated code review that fires every available review skill, consolidates findings into a single report, then lets you apply or revert each finding interactively.

**Usage:**
```bash
/mella:review                   # Review current branch changes (parallel mode)
/mella:review --sequential      # Run each analytical skill one at a time
/mella:review --force           # Review on main/master (uses HEAD~1 as diff base)
/mella:review 123               # Review a specific PR by number
```

**How it works:**

1. **Phase 1 — Analytical review** (parallel by default): fires all available analytical skills simultaneously and collects their findings.
2. **Phase 2 — Code simplification** (always sequential): `simplify` then `code-simplifier` run in order, applying edits directly to your working tree.
3. **Report**: findings are deduplicated, severity-rated, and consolidated into a single table. You can apply pending fixes, revert Phase 2 edits, or dismiss findings.

**Skills invoked:**

| Skill | Phase | Gate |
|-------|-------|------|
| `security-review` | 1 | always |
| `pr-review-toolkit:review-pr` | 1 | PR required |
| `code-review` | 1 | PR required |
| `laravel-best-practices` | 1 | Laravel project + installed |
| `simplify` | 2 | always |
| `code-simplifier` | 2 | if installed |

**Flags:**
- `--sequential` — run Phase 1 skills one at a time instead of in parallel
- `--force` — allow running on `main`/`master`

### `/mella:review-bot`

Triage review bot comments on a GitHub PR — re-review, fix, dismiss, and summarise.

**Usage:**
```bash
/mella:review-bot                  # Auto-detect PR from current branch
/mella:review-bot 123              # Target a specific PR by number
/mella:review-bot --bot coderabbit # Target a specific bot by username
/mella:review-bot 123 --bot copilot # Both: specific PR and bot
```

**Features:**
- **Auto-detection**: Finds the PR from the current branch and identifies bot comments by `user.type`
- **`--bot` override**: Target a specific bot username (useful for bots that use personal access tokens)
- **Validity assessment**: Re-reviews each bot comment against the actual code — checks if the issue is real, already handled, or project-specific
- **Smart fixes**: Applies the bot's suggestion when correct, or a better fix when the suggestion is suboptimal (`fix-alt`)
- **Confidence gating**: Only auto-fixes at high/medium confidence; low-confidence items are flagged for manual review
- **Thread grouping**: Collapses bot reply threads into a single finding
- **PR summary comment**: Posts a structured markdown comment on the PR with disposition for every bot comment (applied, dismissed with reason, outdated)
- **No auto-commit**: Applies fixes to the working tree only — commit when you're ready with `/mella:commit`

### `/mella:walkthrough`

Interactive walkthrough command for documentation and QA.

## Installation

This plugin is part of the mella-marketplace. To use it:

1. Clone or install from marketplace
2. Enable in Claude Code settings
3. Commands will be available as `/mella:command-name`

## License

MIT
