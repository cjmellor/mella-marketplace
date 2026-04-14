# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2026-04-14

### Changed

- **mella plugin** (v1.6.1) — `implement` skill hardening and stack-agnostic restructure
  - **Standalone mode**: Step 1 now auto-detects GStack planning artifacts. If present, reads them as before; if absent, elicits Critical Paths / Key Interactions / Edge Cases directly from the user. The skill is no longer gated on GStack usage.
  - **Iron Law** block added to Step 4: "No production code without a failing test first." Code written before a test must be deleted, not "adapted."
  - **Verify RED made mandatory** with three explicit gates (fails, not errors; expected failure message; missing behavior, not broken test) plus the epistemic justification for why watching the failure is non-negotiable.
  - **Verify GREEN made mandatory** with three gates (target test passes, full suite passes, output is pristine). Prevents local-file-only verification from hiding regressions.
  - **Rationalizations table** — 8 common excuses for skipping TDD with their rebuttals (including "hard to test = hard to use" as a design signal).
  - **When Stuck table** — four common TDD failure modes with escape hatches (wish-for-API drafting, dependency injection at seams, helper extraction).
  - **Step 6 (Bug Fixes)** — explicit TDD discipline for off-plan bug fixes: failing test first, even for one-line fixes.
  - **Step 7 (Verification Checklist)** — 9-box gate before declaring an implementation complete.
  - **Scope & Design Guardrails** section now binds to whichever source Step 1 produced (design doc Premises in GStack mode, user-stated constraints in standalone mode).

### Fixed

- **mella plugin** — `VERSION` and `.claude-plugin/marketplace.json` were stale across previous releases (both still read `1.4.0` / `1.6.0.0` after v1.5.0 and v1.6.0). Normalised `VERSION` to 3-part semver (`1.6.1`) and synced `marketplace.json` so the manifest and tag agree.

### Documentation

- **README** — Skills table now lists all five skills (`review`, `commit`, `walkthrough`, `review-bot`, `implement`) with up-to-date descriptions and triggers. "Start using" section extended with `/mella:review-bot` and `/mella:implement` examples.

## [1.6.0] - 2026-04-11

### Added

- **mella plugin** (v1.6.0)
  - `implement` skill — TDD-driven implementation that reads GStack plan artifacts and drives Red→Green test loops via `/mella:implement`
    - Orients from GStack planning artifacts: design docs, eng review test plans, CEO plans, design mockups
    - Detects stack (Swift, PHP/Laravel, Node, Rust, Go, Python) and infers test runner
    - Builds ordered test queue from Critical Paths → Key Interactions → Edge Cases
    - Enforces strict Red→Green loop: one test at a time, minimal code to pass, no anticipation
    - Guards against scope creep by checking design constraints and premises
    - Stack-agnostic test generation (vitest, pest, xcodebuild, cargo test patterns)

## [1.5.0] - 2026-03-30

### Changed

- **mella plugin** (v1.5.0)
  - Database Write Guard hook now uses `if` field for conditional hook filtering
    - Three `if` patterns (`Bash(*sql*)`, `Bash(*tinker*)`, `Bash(*artisan db*)`) gate process spawning to only database CLI commands
    - Eliminates ~98% of unnecessary process spawns (previously fired on every Bash call)
    - Original script logic retained as defense-in-depth for false positive filtering

## [1.4.0] - 2026-03-24

### Added

- **mella plugin** (v1.4.0)
  - `review-bot` skill — Triage review bot comments on GitHub PRs via `/mella:review-bot`
    - Auto-detects PR from current branch or accepts a PR number as argument
    - Identifies bot comments by `user.type == "Bot"`, with `--bot <name>` override for PAT-based bots
    - Re-reviews each comment against actual code: validity assessment with confidence scoring
    - Classifies as `fix`, `fix-alt` (better fix than bot's suggestion), `dismiss`, `outdated`, or `flag` (needs manual review)
    - Groups threaded bot conversations into single findings
    - Posts structured summary comment on the PR with dispositions and reasoning

## [1.3.0] - 2026-03-22

### Added

- **mella plugin** (v1.3.0)
  - Database Write Guard hook — PreToolUse hook that inspects database CLI commands (`mysql`, `sqlite3`, `tinker`, `artisan db`) and blocks destructive write operations while allowing reads through
  - Detects destructive SQL: `DROP`, `DELETE FROM`, `TRUNCATE`, `UPDATE...SET`, `INSERT INTO`, `REPLACE INTO`, `ALTER TABLE`, `GRANT`, `REVOKE`, piped `.sql` files
  - Detects destructive Eloquent: `->save()`, `->create()`, `->update()`, `->delete()`, `->truncate()`, `DB::statement`, `Schema::drop`, `Artisan::call`, and more
  - Read operations pass through unblocked: `SELECT`, `->get()`, `->first()`, `->count()`, `DB::select`, etc.

## [1.2.0] - 2026-03-21

### Added

- **mella plugin** (v1.2.0)
  - `review` skill — Stack-agnostic architecture with per-stack reference files
    - `--stack <stack,...>` argument to explicitly specify project stacks (e.g. `--stack laravel`, `--stack laravel,ios`)
    - Auto-detection of project stacks from project files (`artisan`/`composer.json` for Laravel, `.swift` files for iOS)
    - New `references/laravel.md` — consolidated Laravel/PHP reviewer covering efficiency, quality, security, and migration safety
    - Renamed `references/ios-reviewer.md` → `references/ios.md` for consistency
    - `/simplify` integration — runs as a final polish step (Step 11) after the review cycle for code reuse, quality, and efficiency checks

### Removed

- **mella plugin** (v1.2.0)
  - `references/reuse-quality-reviewer.md` — replaced by `/simplify` (built-in Claude Code skill)
  - `references/efficiency-reviewer.md` — replaced by `/simplify` (built-in Claude Code skill)
  - React/TypeScript-specific review content (can be re-added as a stack reference file later)

### Changed

- **mella plugin** (v1.2.0)
  - `references/standards-reviewer.md` — genericised examples and expanded config file detection to be language-agnostic
  - Review cycle now runs 3 always-on agents (down from 5) plus stack-specific and conditional agents
  - Dedup rules in Step 7 updated to reflect new agent composition

## [1.1.1] - 2026-03-18

### Changed

- **mella plugin** (v1.1.1)
  - Added `context: fork` to `review` skill — runs in an isolated subagent context to avoid flooding main conversation
  - Added `context: fork` to `walkthrough` skill — runs in an isolated subagent context for cleaner sessions

## [1.1.0] - 2026-03-18

### Added

- **mella plugin** (v1.1.0)
  - `review` skill - Multi-agent code review with automatic fix-and-re-review cycles via `/mella:review`
    - Runs 5+ specialized review agents in parallel (code quality, bugs, efficiency, standards compliance, design)
    - Conditional agents auto-selected based on detected changes (PHP, Swift, error handling, types, tests, comments)
    - 3-pass fix-and-re-review cycle with scoped re-reviews
    - Cross-session review history tracked per branch in `.claude/review-history.json`
    - Loop mode (`/mella:review loop`) for fully autonomous batch/overnight runs
    - Reference prompts for iOS, efficiency, standards, and quality reviewers

## [1.0.0] - 2026-02-25

### Changed

- **mella plugin** (v1.0.0)
  - Enhanced `walkthrough` skill to always explore the codebase before generating instructions — never assumes how the application works, what routes exist, or how the UI is structured
