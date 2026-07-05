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

### `/mella:audit`

Orchestrated code review — runs all available review skills in parallel, deduplicates findings, and consolidates them into a single structured report.

**Usage:**
```bash
/mella:audit                    # Review working-tree changes vs base branch (parallel)
/mella:audit --sequential       # Run each skill one at a time (broad first, synthesis last)
/mella:audit --force            # Review HEAD~1..HEAD when on main/master
/mella:audit #42                # Review a specific PR by number
/mella:audit --effort max       # Pass --effort max through to code-review
```

**How it works:**

Skills run in parallel (or sequentially with `--sequential`) and their findings are deduplicated, conflict-detected, and severity-rated. The final report fills a fixed template: header · conflicts · findings table (ID · severity · file:line · issue · skills · action) · per-skill stats.

**Skills invoked:**

| Skill | Gate |
|-------|------|
| `security-review` | always |
| `code-review` | always |
| `laravel-best-practices` | Laravel project + installed |
| `pr-review-toolkit:review-pr` | PR required |

**Flags:**
- `--sequential` — run skills one at a time; `pr-review-toolkit` always runs last as synthesis layer
- `--force` — allow running on `main`/`master`
- `--effort <low|medium|high|max>` — passed to `code-review` (default: `high`)

### `/mella:competitor-analysis`

Deep competitive intelligence — auto-detects your product, searches the web, visits competitor sites live, and produces a report.

**Usage:**
```bash
/mella:competitor-analysis         # Deep analysis (3–5 competitors, thorough)
/mella:competitor-analysis wide    # Wide analysis (10+ competitors, lighter coverage)
/mella:competitor-analysis html    # Output as interactive HTML dashboard
/mella:competitor-analysis wide html  # Both
```

**How it works:**

1. Reads project files (`README.md`, `package.json`, source code) to understand what your product does.
2. Searches the web for competitors from multiple angles (G2, Capterra, Reddit, HN, direct searches).
3. Visits each competitor's site live — homepage, pricing, features — and mines review sites for honest user signals.
4. Outputs a structured Markdown report or a self-contained interactive HTML dashboard.
5. Saves findings to `.claude/competitor-data.yaml` so future runs can offer a delta update instead of a full re-analysis.

**Tips:**
- Exact hero headline quotes and CTA wording are the whole point of the copy analysis — the skill captures them.
- Reddit/HN complaints are often more valuable than G2 ratings.
- If a competitor's pricing is behind a login, the skill notes "not publicly listed" and uses reported pricing from review sites.

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

### `/mella:pitch`

Deep-dive codebase analysis that generates innovative, high-leverage feature ideas one at a time with Y/N/M responses.

**Usage:**
```bash
/mella:pitch                              # 5 pitches, asks for project context
/mella:pitch 10                           # 10 pitches, asks for project context
/mella:pitch a wedding website            # 5 pitches, brief provided — no questionnaire
/mella:pitch 10 add a leaderboard        # 10 pitches, brief provided
```

**How it works:**

1. **Brief provided** — skips the questionnaire and goes straight to research. **No brief** — asks two short questions via the UI. If a `PITCHES.md` from a previous run exists, its ledger is read so declined ideas aren't re-pitched.
2. Delegates research to two cheap sub-agents running in parallel: `pitch-scout` (Haiku — codebase survey with `file:line` evidence) and `pitch-researcher` (Sonnet — identifies 3–5 competitors, reads their actual READMEs/docs/changelogs, and returns a cited feature matrix). Your invoking model is reserved for the synthesis.
3. Generates all N ideas internally — from evidenced findings only — then presents them one at a time in full Markdown with a Scorecard.
4. After each pitch: reply **Y** to bank it, **N** to skip, or **M** for more detail (then Y/N). No UI dropdowns — keeps Markdown rendered.
5. After all pitches: writes a `PITCHES.md` handover dossier at your repo root — an implementation brief per accepted idea (affected files, acceptance criteria, tradeoffs), a declined-ideas appendix, a suggested implementation order, and an append-only ledger of every pitch ever shown.

**Tips:**
- Pass the brief inline to skip setup entirely: `/mella:pitch 8 Laravel gamification package, needs a leaderboard`.
- The count and brief are both optional and combinable in any order (count must come first if used).
- Ideas are grounded in your actual code — expect references to specific files and functions, not generic advice.
- Hand `PITCHES.md` to any model or fresh session to implement — the expensive thinking is already captured in it.

### `/mella:walkthrough`

Interactive walkthrough command for documentation and QA.

## Installation

This plugin is part of the mella-marketplace. To use it:

1. Clone or install from marketplace
2. Enable in Claude Code settings
3. Commands will be available as `/mella:command-name`

## License

MIT
