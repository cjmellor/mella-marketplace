# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
