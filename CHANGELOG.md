# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.14.0] - 2026-07-05

### Changed

- **`/mella:pitch` — tiered research, evidenced pitches, and a handover dossier** (mella plugin → v1.13.0). Five behaviour changes ride along with this release:

  **Research runs on cheap sub-agents.** Two new plugin agents do the legwork in parallel: `pitch-scout` (Haiku, read-only) surveys the codebase and `pitch-researcher` (Sonnet) handles ecosystem research. The `model: opus` pin has been removed from the skill's frontmatter, so idea synthesis now inherits whatever model you invoked `/pitch` from — the expensive brain is reserved for deciding what to pitch, not for grepping files.

  **Structured findings contract.** Both agents return capped, ranked findings — every claim carrying `file:line` evidence or a source URL. Synthesis only pitches from evidenced claims; a finding without evidence doesn't exist.

  **Real competitor research.** The researcher identifies 3–5 closest competitors, then fetches their actual READMEs, docs, and changelogs and returns a has/lacks/partial feature matrix with citations. Gap analysis is now built on what competitors actually ship, not search-snippet marketing copy. `unknown` cells are treated as non-evidence, never as `lacks`.

  **`PITCHES.md` handover dossier.** The wrap-up phase now writes a dossier at the target project's repo root: an implementation brief per accepted pitch (affected files, acceptance criteria, tradeoffs — including M deep-dive material), a declined-ideas appendix, and a suggested implementation order. Hand it to any model or fresh session to implement.

  **Cross-run pitch ledger.** `PITCHES.md` also carries an append-only ledger of every pitch ever shown, with verdict and date. Subsequent `/pitch` runs read it: declined ideas are never re-pitched unless the recorded rejection reason no longer holds (and the skill says so explicitly); banked-but-unimplemented ideas re-surface flagged *still on the table*.

### Fixed

- **`/mella:pitch` argument parsing** — the `$ARGUMENTS` placeholder had been stripped from the Argument Parsing section, leaving the skill instructed to parse an empty string. Restored.

## [1.13.1] - 2026-06-14

### Fixed

- **`/mella:audit` skill probe now anchors to the git project root.** v1.12.1 broadened the probe to search `./.claude/skills`, but used paths relative to the current working directory, so it only found project-local skills (e.g. Laravel Boost's `laravel-best-practices`) when the audit was invoked from the project root. The probe now resolves `<root>` via `git rev-parse --show-toplevel`, so project-local skills are detected from any subdirectory. (mella plugin → v1.12.2)

## [1.13.0] - 2026-06-14

### Added

- **New plugin: `grain`** — automatic, always-on cross-session memory for Claude Code. Records what you did and decided in each project via three lifecycle hooks (SessionStart recall, PreCompact checkpoint, SessionEnd finalise), then re-injects a recent digest at the start of every session so nothing is lost to a fresh session or compaction. Capture is pattern-based and local — no model calls, no API keys, no cost, no network. Memory is stored as plain Markdown under `~/.claude/grain/`, keyed per project (git remote → repo path). Honours `<private>`/`<no-memory>` opt-out markers; hooks fail open so a session is never blocked or slowed. Initial release at v0.1.0.

## [1.12.1] - 2026-05-26

### Fixed

- **`/mella:audit` skill probe now searches all skill roots.** The Step 3 probe previously only searched `~/.claude/plugins/cache`, causing project-level skills (`./.claude/skills`) and user-level skills (`~/.claude/skills`) to be silently missed. The probe now searches all four roots in priority order: `./.claude/skills` → `./.agents/skills` → `~/.claude/skills` → `~/.claude/plugins/cache`. The fix applies to both the `laravel-best-practices` and `pr-review-toolkit:review-pr` probes. An explicit warning is now emitted when a Laravel project is detected but `laravel-best-practices` is not found in any location.

## [1.12.0] - 2026-05-26

### Changed

- **`/mella:pitch` redesigned interaction model** — several behaviour changes ride along with this release:

  **Inline brief and configurable count.** The skill now parses args directly: `/pitch [N] [brief]`. The leading integer sets how many ideas to generate (default: 5); remaining text is the project brief. Providing a brief skips the questionnaire entirely. Examples: `/pitch 10` · `/pitch a wedding website` · `/pitch 10 add a leaderboard`.

  **Y/N/M responses instead of UI dropdowns.** After each pitch's Scorecard, the skill appends a plain-text prompt — `Reply Y to bank it · N to skip · M for more detail`. This preserves Markdown rendering in the Claude Code client; the previous `AskUserQuestion` approach caused the pitch text to revert to raw Markdown source. After all N pitches, `AskUserQuestion` is used once to offer more ideas.

  **Competitor research is now automatic.** The skill always runs WebSearch for competitors, similar packages, and ecosystem positioning before showing any pitches — no longer asks whether to do so.

  **Wrap-up phase.** After all pitches, accepted (Y) ideas are listed as a numbered summary and the skill offers to write a structured plan for any or all of them.

## [1.11.0] - 2026-05-25

### Added

- **`/mella:pitch`** — interactive feature ideation skill. Scans the codebase deeply (architecture, API surface, test coverage, dependencies, DX friction), then pitches innovative ideas one at a time — each with a Problem, Solution, Why Now, and Scorecard (Effort · Impact · Innovation · Alignment). Supports optional web search for ecosystem research. Transitions into collaborative planning when you pick an idea to pursue.

## [1.10.0] - 2026-05-24

### Added

- **`/mella:competitor-analysis`** — deep competitive intelligence for any product. Auto-detects what your product does from code and docs, searches the web for competitors, visits each competitor's site live to capture pricing, features, copywriting, and positioning, then produces a structured Markdown report or a self-contained interactive HTML dashboard. Supports `deep` (3–5 thorough) or `wide` (10+ lighter) scope. Persists findings to `.claude/competitor-data.yaml` for reuse by other skills.

- **`audit/REPORT_TEMPLATE.md`** — `/mella:audit` now fills in a fixed template on every run, giving consistent output: a header with branch/date/PR metadata, an optional conflicts section, a findings table (ID · severity emoji · file:line · issue · skills · action), and a per-skill stats breakdown.

### Fixed

- **`/mella:audit` sequential ordering** — `pr-review-toolkit:review-pr` now always runs last when `--sequential` is used, after domain-specific skills (`security-review`, `code-review`, `laravel-best-practices`). It is a synthesis layer that orchestrates its own sub-agents, so it belongs last.

### Changed

- **Skill documentation refactor** — all skills trimmed and reorganised to the write-a-skill guidelines (target: ~100 lines, "Use when" triggers in every description, reference files for dense tables):
  - `commit`: 159 → 70 lines; Tips section removed; description gains trigger phrase
  - `implement`: `Common Rationalizations` and `When Stuck` tables extracted to `TDD-RULES.md`
  - `review-bot`: PR comment template extracted to `REFERENCE.md`
  - `audit`: trimmed to ~100 lines; Step 8 now defers to `REPORT_TEMPLATE.md`

## [1.9.0] - 2026-05-17

### Changed

- **mella plugin** (v1.9.0) — `review` skill renamed to `audit`; Phase 1 roster trimmed; Step 11 report-rendering fix

  The orchestrator slash command is now `/mella:audit` (was `/mella:review`). Trigger phrases and the overall analytical pipeline are unchanged. Two behaviour changes ride along with the rename:

  **`code-review:code-review` removed from the Phase 1 roster.** The official Anthropic plugin's final step posts a `gh pr comment` with no dry-run mode, so every unattended audit run left a PR comment — even on "no findings" results. The skill is still available standalone via `/code-review:code-review` when a PR comment is wanted.

  **Step 11 report rendering.** The consolidated report is now emitted as rendered Markdown (`##` headings, pipe tables, inline `**bold**`) rather than wrapped in a triple-backtick fence. The fenced output had suppressed table, bold, and link rendering in the client, leaving the report visible only as raw Markdown source.

### Removed

- `/mella:review` slash command — replaced by `/mella:audit`. Update any aliases, hooks, or saved commands that reference the old name.

## [1.8.1] - 2026-05-13

### Fixed

- **mella plugin** (v1.8.1) — `review` skill is discoverable again

  Removed `disable-model-invocation: true` from `review/SKILL.md` frontmatter. The flag was added in v1.7.0 with the intent of keeping the heavy multi-skill orchestrator under explicit user control, but it had two unintended side effects:

  - The model couldn't see the skill in its auto-discovery listing, so natural-language triggers documented in the README (e.g. "check my changes", "look over my diff", "review before I merge") never fired.
  - When the bare `/review` slash command was typed, the harness's resolver could route to a different `review` skill from another installed plugin, since the mella version was hidden from the model.

  With the flag removed, `mella:review` is again surfaced to the model and the documented trigger phrases work as advertised. Users who still want strict explicit invocation can keep using the namespaced `/mella:review` form.

## [1.8.0] - 2026-05-10

### Changed

- **mella plugin** (v1.8.0) — `review` skill: new sub-skill roster, `--sequential` flag, and improved description

  The review orchestrator ships with a revised set of sub-skills and a cleaner execution model.

  **New Phase 1 roster (analytical, parallel by default):**
  - `security-review` — always runs (previously gated behind `HAS_PR`)
  - `pr-review-toolkit:review-pr` — fires all toolkit agents internally (PR-gated)
  - `code-review` — posts a GitHub review comment (PR-gated)
  - `laravel-best-practices` — gated on Laravel project + installed

  **New Phase 2 roster (code-editing, always sequential):**
  - `simplify` → `code-simplifier` (if installed)

  **Removed:**
  - `laravel-simplifier:laravel-simplifier` — replaced by `code-simplifier`
  - Direct `pr-review-toolkit` sub-agent dispatch (silent-failure-hunter, type-design-analyzer, pr-test-analyzer, comment-analyzer) — these now run internally when `review-pr` is invoked

  **New `--sequential` flag:** Phase 1 analytical skills can run one-at-a-time instead of all in parallel. Useful when you want to read each review as it completes.

  **Other fixes:**
  - `security-review` no longer requires a PR — runs on local diffs too
  - `git diff` base-branch fallback handles repos without a `main` branch
  - Phase 2 always runs sequentially regardless of `--sequential` flag (prevents git state conflicts)
  - Dead `references/standards-reviewer.md` removed

## [1.7.1] - 2026-05-05

### Fixed

- **mella plugin** (v1.7.1) — `review-bot` skill no longer self-triggers the review bot

  The triage summary comment posted to the PR previously included `from @botname`. When the bot being triaged was `@claude` (or any other registered GitHub user), GitHub resolved the `@mention` and pinged the bot, which kicked off a fresh review on the same PR — a self-perpetuating loop. Fixed by removing the bot mention from the posted comment body and adding a guard note in the skill explaining why no `@mention`s should ever be added back.

## [1.7.0] - 2026-04-15

### Changed

- **mella plugin** (v1.7.0) — `review` skill rebuilt as an orchestrator

  The `review` skill has been completely rewritten. It no longer runs inline agents itself — instead it detects what changed and delegates to specialised review skills, consolidating their findings into a single report.

  **Orchestrated skills (always):**
  - `/review` (gstack) — structural issues: SQL safety, LLM trust boundaries, conditional side effects
  - `/simplify` — code reuse, quality, and efficiency (final pass)

  **Orchestrated skills (Laravel projects):**
  - `laravel-best-practices` — 125+ rules across N+1, caching, eloquent, security, architecture, migrations. Gracefully skipped if not installed.
  - `laravel-simplifier:laravel-simplifier` — Laravel-specific code clarity, PSR-12 and Laravel conventions

  **Orchestrated skills (conditional on diff content):**
  - `/design-review` (gstack) — if frontend files detected
  - `/devex-review` (gstack) — if config/tooling files detected
  - `pr-review-toolkit:silent-failure-hunter` — if error handling patterns detected
  - `pr-review-toolkit:type-design-analyzer` — if new type/interface definitions detected
  - `pr-review-toolkit:pr-test-analyzer` — if test files changed or added
  - `pr-review-toolkit:comment-analyzer` — if comments added or modified

  Independent conditional skills run in parallel. Sequential order is preserved for structural baseline (`/review`), Laravel skills, and final polish (`/simplify`).

  **Frontmatter improvements:**
  - `disable-model-invocation: true` — you control when the review runs; Claude won't auto-invoke it
  - `effort: high` — full attention for multi-skill orchestration
  - `context: fork` — runs isolated from conversation history; reviewers see the diff, not the chat
  - `allowed-tools` — pre-approves Bash, Read, Edit, Write, Grep, Glob, Skill to avoid mid-review prompts
  - `when_to_use` — trigger phrases for autocomplete

### Removed

- **Loop mode** — `/review loop` and the `review-loop` script integration are gone. The skill is now single-pass only.
- **`--stack` argument** — stack is now auto-detected from the project; explicit override is no longer supported.
- **Review history file** — `.claude/review-history.json` is no longer written. History persistence was only needed to support loop mode.

## [1.6.1] - 2026-04-14

### Fixed

- **mella plugin** — `VERSION` and `.claude-plugin/marketplace.json` were stale across previous releases (both still read `1.4.0` / `1.6.0.0` after v1.5.0 and v1.6.0). Normalised `VERSION` to 3-part semver (`1.6.1`) and synced `marketplace.json` so the manifest and tag agree.

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
