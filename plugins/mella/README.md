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

Multi-agent code review with automatic fix-and-re-review cycles.

**Usage:**
```bash
/mella:review                       # Interactive review of current branch vs main
/mella:review --stack laravel       # Explicitly specify project stack
/mella:review --stack laravel,ios   # Multiple stacks
/mella:review loop                  # Auto-fix mode for batch/overnight runs
/mella:review --force               # Review latest commit on main/master
```

**Features:**
- **Stack-agnostic**: Works with any codebase. Auto-detects project stacks (Laravel, iOS) from project files, or specify explicitly with `--stack`
- **Multi-agent**: Runs review agents in parallel (code quality, bugs, standards compliance, plus stack-specific reviewers)
- **Stack-specific reviewers**: Deep framework knowledge loaded conditionally — Laravel/PHP patterns (N+1, migration safety, Eloquent antipatterns) and iOS/Swift patterns (concurrency, memory, SwiftUI)
- **`/simplify` integration**: Runs Claude Code's built-in `/simplify` as a final polish pass for code reuse, quality, and efficiency
- **Conditional agents**: Automatically adds error handling, type design, test, and comment reviewers based on detected changes
- **3-pass cycle**: Applies fixes, then re-reviews changed files, up to 3 passes
- **Cross-session history**: Tracks previous findings per branch in `.claude/review-history.json`
- **Loop mode**: Fully autonomous fix cycle for use with the `review-loop` script

**Supported stacks:**
| Stack | Detection | Reference file |
|-------|-----------|---------------|
| `laravel` | `artisan` file or `composer.json` with `laravel/framework` | `references/laravel.md` |
| `ios` | `.swift` files in diff | `references/ios.md` |

To add a new stack, create a `references/<stack>.md` file and add detection logic to Step 4 in `SKILL.md`.

### `/mella:walkthrough`

Interactive walkthrough command for documentation and QA.

## Installation

This plugin is part of the mella-marketplace. To use it:

1. Clone or install from marketplace
2. Enable in Claude Code settings
3. Commands will be available as `/mella:command-name`

## License

MIT
