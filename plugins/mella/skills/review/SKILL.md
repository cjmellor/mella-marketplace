---
name: review
description: Orchestrated pre-PR code review. Invokes review skills based on what changed — structural issues, Laravel patterns, visual polish, DX, code quality. Use when reviewing code, checking changes, or before committing/creating a PR.
when_to_use: "review my code, check my changes, pre-PR review, before committing, before creating a PR, check for issues, run a code review, look over my diff"
argument-hint: "[--force]"
context: fork
disable-model-invocation: true
effort: high
allowed-tools: Bash Read Edit Write Grep Glob Skill
---

# /review Skill

Single-pass orchestrated code review. Analyzes branch changes, selects appropriate review skills based on what changed, consolidates findings, and lets you choose which fixes to apply.

## Step 0 — Plan mode guard

**If you are currently in plan mode, stop immediately.** Tell the user:

> "/review requires Edit and Write access to apply fixes. You're in plan mode, which blocks those tools. Please exit plan mode first, then re-run `/review`."

Do not proceed to Step 1.

## Step 1 — Check branch

Run `git branch --show-current` to get the current branch name.

- If on `main` or `master` **and** the user did NOT pass `--force`: warn the user: "You're on main — nothing to review." and stop.
- If on `main` or `master` **with** `--force`: continue, but use `HEAD~1` instead of `main` as the diff base.
- Otherwise, continue.

## Step 2 — Gather diff

Get all changes compared to the base:

```bash
git diff main...HEAD    # or git diff HEAD~1...HEAD if --force on main/master
git diff
git diff --cached
git rev-parse HEAD
```

Combine these into the full set of changed files and their diffs. If there are no changes at all, tell the user and stop.

## Step 3 — Classify changes

Scan the combined diff and changed file paths to detect:

- **Laravel project**: Check for `artisan` file in repo root OR `laravel/framework` in `composer.json`
- **Error handling patterns**: try/catch, catch blocks, `.catch()`, fallback logic, empty catch
- **New type/interface definitions**: class, interface, type, enum declarations (newly added)
- **Test files**: files matching `*Test.php`, `*_test.go`, `*.test.ts`, `*.spec.ts`, `tests/`, `test/`
- **Comments added or modified**: any new or changed comments, docstrings, PHPDoc, JSDoc, inline comments
- **Frontend files**: `.tsx`, `.jsx`, `.ts`, `.js`, `.css`, `.scss` in `src/`, `app/`, `components/`, `resources/`
- **Config/tooling files**: `package.json`, `composer.json`, `Dockerfile`, `tsconfig.json`, `vite.config.ts`, `.env*`, `makefile`, `webpack.config.*`, CI/CD files (`.github/workflows/`, `Jenkinsfile`)

Store all detected categories for use in Step 4.

## Step 4 — Select skills to invoke

Based on classification, build the list of skills to run. Do NOT ask the user — tell them which skills will run and why, then proceed immediately to Step 5.

**Always include:**
| Skill | Reason |
|-------|--------|
| `/review` (gstack) | Structural issues: SQL safety, LLM trust boundaries, conditional side effects |
| `/simplify` | Code reuse, quality, and efficiency — always runs last |

**Conditionally include (Laravel project detected):**
| Skill | Reason |
|-------|--------|
| `laravel-best-practices` | 125+ Laravel rules: N+1, caching, eloquent, security, architecture, migrations. Check if installed by looking for its SKILL.md. If not found, skip silently and proceed. |
| `laravel-simplifier:laravel-simplifier` | Laravel-specific code clarity, PSR-12, Laravel conventions |

**Conditionally include (based on diff content):**
| Skill | Condition |
|-------|-----------|
| `/design-review` (gstack) | Frontend files detected |
| `/devex-review` (gstack) | Config/tooling files detected |
| `pr-review-toolkit:silent-failure-hunter` | Error handling patterns detected |
| `pr-review-toolkit:type-design-analyzer` | New type/interface definitions detected |
| `pr-review-toolkit:pr-test-analyzer` | Test files changed or added |
| `pr-review-toolkit:comment-analyzer` | Comments added or modified |

Present a brief summary before running: e.g. "Running 5 skills: gstack /review, laravel-best-practices, pr-review-toolkit:silent-failure-hunter, laravel-simplifier, /simplify."

## Step 5 — Invoke selected skills

Invoke skills using the Skill tool in this order:

1. `/review` (gstack) — structural baseline first
2. `laravel-best-practices` — if Laravel detected and installed
3. `/design-review` (gstack) — if triggered
4. `/devex-review` (gstack) — if triggered
5. `pr-review-toolkit:silent-failure-hunter` — if triggered
6. `pr-review-toolkit:type-design-analyzer` — if triggered
7. `pr-review-toolkit:pr-test-analyzer` — if triggered
8. `pr-review-toolkit:comment-analyzer` — if triggered
9. `laravel-simplifier:laravel-simplifier` — if Laravel detected
10. `/simplify` — always, last

Steps 3–8 that are all triggered can be invoked in parallel (single message, multiple Skill tool calls) to save time. Steps 1, 2, 9, and 10 run sequentially as they establish context or do final polish.

If any skill invocation fails or is not installed, skip it, note it in the final report, and continue with the remaining skills.

## Step 6 — Consolidate findings

Review all skill outputs together:

1. **Identify duplicates**: Multiple skills may flag the same issue. Keep the most detailed explanation and note which skills agreed (more agreement = higher confidence).
2. **Identify contradictions**: One skill suggests adding code that another suggests removing. Label as "⚠️ Conflicting advice" and let the user decide.
3. **Prioritize by confidence**: Multi-skill agreement elevates a finding's priority.
4. **Normalize format**: Convert each skill's output into a consistent finding:
   - ID (f1, f2, ...)
   - File and line range
   - Issue summary
   - Suggested action (add / remove / change / flag)
   - Which skills reported it

## Step 7 — Present report

Present a single consolidated report in this order:

### Section 1: Conflicts (if any)

```
### ⚠️ Conflicting advice

| File | Skill A says | Skill B says |
|------|--------------|--------------|
| src/Example.php:10 | Add validation | Remove validation (redundant) |
```

### Section 2: Findings

```
### Findings

| ID | File | Issue | Skills | Action |
|----|------|-------|--------|--------|
| f1 | src/Services/AuthService.php:23 | N+1 query: missing eager load | laravel-best-practices | change |
| f2 | src/Services/AuthService.php:45 | Silent failure: catch without logging | pr-review-toolkit:silent-failure-hunter | add |
| f3 | src/Views/login.tsx:67 | Button too small (36px, min 44px) | /design-review | change |
| f4 | src/Services/AuthService.php:12-18 | Repeated validation logic | /simplify, laravel-simplifier | change |
```

### Section 3: Skill summary

List each skill that ran, how many issues it found, and note any that were skipped (not installed or errored).

## Step 8 — Await instructions

After presenting the report, use AskUserQuestion to prompt the user:

- **Question**: "How would you like to proceed?"
- **Header**: "Next step"
- **Options**:
  1. Label: "Fix all" — Description: "Apply all non-conflicting fixes automatically"
  2. Label: "Done / Stop" — Description: "Exit review without applying fixes"
  3. (Only if conflicts exist) Label: "Resolve conflicts first" — Description: "Decide on conflicting advice before fixing"

The tool automatically adds an "Other" option for specific IDs like "fix f1, f4" or "dismiss f2".

Handle the response:

- **"fix all"**: Fix all non-conflicting issues. For conflicts, ask which approach to take.
- **"fix f1, f4"** (specific IDs): Fix only those.
- **"ignore f2"** / **"dismiss f2"**: Skip those findings.
- **"keep previous"** / **"use new"** (for conflicts): Apply accordingly.
- **"done"** / **"stop"**: Exit immediately without applying any fixes.

## Step 9 — Apply fixes

For each approved finding:

- Read the file
- Apply the fix (add, remove, or change code as suggested)
- Write the file back
- If Edit fails, report the error and ask the user to intervene

After all approved fixes are applied, summarize what was changed.

## Step 10 — Done

Exit the review. If any findings remain unapplied, remind the user they can re-run `/review` to address them.
