# Mella Plugin

Mella's collection of productivity tools for Claude Code.

## Commands

### `/mella:commit`

Create git commits with automatic logical grouping, optional push, and PR creation. Runs in a forked context (Sonnet on low effort), so diff-reading never pollutes your main conversation.

**Usage:**
```bash
/mella:commit                    # Commit all changes (auto-grouped if genuinely unrelated)
/mella:commit push               # Commit and push to current branch
/mella:commit push origin/main   # Commit and push to specific branch
/mella:commit pr                 # Commit, push, and create or update a PR
/mella:commit pr draft           # Same, but a new PR is created as a draft
```

**Features:**
- **Automatic grouping**: Defaults to a single commit; splits into separate commits only when the changes are clearly unrelated (e.g. a dependency bump alongside an unrelated bug fix). Tests, docs, and config always stay with the feature they belong to.
- **Conventional commits**: `type(scope): subject`, imperative mood, matched to the repo's existing style.
- **PR mode (`pr`)**: Implies `push`. Creates a PR without asking (add `draft` for a draft PR), composing the title and description itself — the title follows commit-subject conventions, and the description covers *why* and the behavior-level *what*, with no implementation narration, test narration, follow-ups, or process fluff. If a PR already exists, its title/description are only updated when the new commits materially change its scope.
- **Push mode (`push`)**: Pushes commits to the remote (current branch or specified branch).

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
