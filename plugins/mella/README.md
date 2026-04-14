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

### `/mella:implement`

TDD-driven implementation with a strict Red→Green loop. Works standalone on any project, or picks up where GStack planning left off.

**Usage:**
```bash
/mella:implement                   # Start a TDD-driven implementation
# Or say: "start building", "let's build this", "ready to implement"
```

**Features:**
- **Auto-detects planning artifacts**: Step 1 checks for GStack planning files (eng review test plan, design doc, CEO plan, design mockups). If present, reads them as the source of truth. If absent, switches to **standalone mode** and elicits Critical Paths / Key Interactions / Edge Cases directly.
- **Stack-agnostic**: Detects Swift, PHP/Laravel, Node (Vitest/Jest), Rust, Go, Python — infers the test runner and single-test command from project files.
- **Ordered test queue**: Tracer bullets first (end-to-end), then Key Interactions (incremental behaviors), then Edge Cases — so early tests prove the critical path, not the error paths.
- **Iron Law**: No production code without a failing test first. Code written before a test must be deleted, not "adapted."
- **Mandatory Verify RED**: Each test must fail for the right reason (missing behavior) before implementation — not typos, not setup errors. Forces the epistemic check that watching the failure is how you know the test actually tests something.
- **Mandatory Verify GREEN**: Target test passes, **full suite still passes**, output is pristine (no warnings, no stderr noise). Prevents silent regressions in files you didn't touch.
- **Rationalizations table**: Eight common TDD-skip excuses ("too simple to test," "I'll test after," "already manually tested") with rebuttals, placed inside the loop where the temptation hits.
- **When Stuck table**: Escape hatches for the four failure modes that typically cause mid-loop abandonment — wish-for-API drafting, simplifying over-complex interfaces, dependency injection at coupling seams, helper extraction.
- **Bug-fix discipline**: Off-plan bugs get a failing repro test before the fix — no "tiny one-line" exceptions.
- **Verification Checklist**: 9-box gate before declaring done — every behavior tested, every RED watched, full suite green, no untested production code.
- **Scope guardrails**: Binds to whichever source Step 1 produced (design doc Premises in GStack mode, user-stated constraints in standalone mode). Flags and stops on constraint conflicts rather than silently reshaping scope.

### `/mella:walkthrough`

Interactive walkthrough command for documentation and QA.

## Installation

This plugin is part of the mella-marketplace. To use it:

1. Clone or install from marketplace
2. Enable in Claude Code settings
3. Commands will be available as `/mella:command-name`

## License

MIT
