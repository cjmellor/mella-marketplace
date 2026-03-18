---
name: review
description: Use when reviewing code, checking code quality, or before committing/creating a PR. Runs when the user says things like "review my code", "check my changes", "review what I've done", "can you look over this", "run a code review", or "check for issues". Analyzes all branch changes against main, selects the appropriate review agents, and presents a consolidated report with optional fixes. Supports loop mode for iterative auto-fixing.
---

# /review Skill

This skill has two modes:

- **`/review`** — Interactive mode. Run agents, present findings, apply fixes, and automatically re-review until clean (up to 3 passes).
- **`/review loop`** — Loop mode. Auto-fix issues iteratively until clean or stuck. Used by the `review-loop` script for overnight/batch runs.

When the user runs `/review`, follow these steps exactly. For loop mode differences, see the "Loop Mode" section at the end.

## Step 0 — Plan mode guard

**If you are currently in plan mode, stop immediately.** Tell the user:

> "/review requires Edit and Write access to apply fixes and re-review. You're in plan mode, which blocks those tools. Please exit plan mode first, then re-run `/review`."

Do not proceed to Step 1. The fix→re-review loop (Steps 3–9) cannot work without write access.

## Step 1 — Check branch

Run `git branch --show-current` to get the current branch name.

- If on `main` or `master` **and** the user did NOT pass `--force` (or `-f`): warn the user: "You're on main — nothing to review." and stop.
- If on `main` or `master` **with** `--force`/`-f`: continue, but use `HEAD~1` instead of `main` as the diff base in Step 3 (since you can't diff main against itself).
- Otherwise, continue and store the branch name for later use.

## Step 2 — Load review history

Check if `.claude/review-history.json` exists in the repo root. If it does, read it and check if the `branch` field matches the current branch.

- If the branch matches: load the previous findings into memory for comparison in Step 7. If a `pass` field is present and the `head_commit` matches the current HEAD, this is a mid-cycle recovery (context compaction occurred) — resume the cycle at pass `pass + 1` using `fixed_files` to scope the next diff.
- If the branch differs or file doesn't exist: no previous history for this branch. Start at pass 1.

The history file structure is:

```json
{
  "branch": "feature/example",
  "reviewed_at": "2026-02-05T10:30:00Z",
  "head_commit": "a1b2c3d",
  "pass": 1,
  "fixed_files": ["src/Example.php", "src/Controller.php"],
  "findings": [
    {
      "id": "f1",
      "file": "src/Example.php",
      "lines": "45-52",
      "agents": ["laravel-simplifier"],
      "action": "remove",
      "summary": "Remove unused variable",
      "status": "pending"
    }
  ]
}
```

Status values: `pending` (not yet addressed), `applied` (fix was applied), `dismissed` (user chose to ignore).

## Review cycle (Steps 3–9)

Steps 3 through 9 form a review cycle that runs up to **3 passes**. Track the current pass number starting at 1. After fixes are applied in Step 9, loop back to Step 3 for another pass. The cycle exits early when no new findings are found or the user says "done" / "stop".

**Every pass must execute Steps 3 through 8 fully — no shortcuts.** Do not skip agent execution because the diff "looks clean" to you. The agents exist precisely because a single review (including yours) misses things. If Step 3 produces a non-empty diff, you must classify (Step 4), select agents (Step 5), run them (Step 6), consolidate (Step 7), and present findings (Step 8). The only valid short-circuit is if the scoped diff in Step 3 is completely empty.

### Context management

To keep context usage under control across passes:

- **Pass 1**: Full branch diff — review everything.
- **Pass 2+**: Scoped re-review — only diff and re-review files that were modified by fixes in the previous pass. Do not re-ingest the entire branch diff.
- **State persistence**: Save review history to disk after each pass (not just at the end). If context compaction occurs mid-cycle, re-read `.claude/review-history.json` at the start of the next pass to recover the pass number and which findings have already been addressed.

## Step 3 — Gather the diff

### Pass 1 (full branch diff)

Run the following to get all changes (committed and uncommitted) compared to the base:

```
git diff main...HEAD    # or git diff HEAD~1...HEAD if --force on main/master
git diff
git diff --cached
git rev-parse HEAD
```

Use `main` as the diff base normally. If `--force` was used on `main`/`master`, use `HEAD~1` instead (review the latest commit).

Combine these into the full set of changed files and their diffs. Store the HEAD commit hash. If there are no changes at all, tell the user and stop.

### Pass 2+ (scoped re-review)

Only review files that were modified by fixes in the previous pass — do NOT re-diff the entire branch. This keeps context lean and focused on what actually changed.

For each file in the `fixed_files` list, check if it is tracked or untracked:

- **Tracked files**: Use `git diff` and `git diff --cached` filtered to those specific files.
- **Untracked files**: `git diff` cannot see these. Instead, read the file contents directly (they are new files — the entire content is the "diff").

If all fixed files are tracked and the filtered diff is empty, the cycle is done — proceed to Step 10.

## Step 4 — Classify the changes

Scan the combined diff to detect the presence of:

- **PHP files**: files with `.php` extension
- **Non-PHP files**: any changed files that are not `.php` (e.g. `.ts`, `.js`, `.go`, `.py`, etc.)
- **Error handling patterns**: try/catch, catch blocks, `.catch()`, fallback logic, empty catch, error suppression
- **New type/interface definitions**: class, interface, type, enum declarations that are newly added
- **Test files**: files matching common test patterns (e.g. `*Test.php`, `*_test.go`, `*.test.ts`, `*.spec.ts`, `tests/`, `test/`)
- **Comments added or modified**: any new or changed comments, docstrings, PHPDoc, JSDoc, or inline comments
- **Swift files**: files with `.swift` extension

## Step 5 — Select agents automatically

Based on the classification, build a list of agents to run. Do NOT ask the user to confirm — simply tell them which agents will run and why, then proceed immediately to Step 6.

**Always include:**
| Agent | Reason |
|---|---|
| `pr-review-toolkit:code-reviewer` | General code quality, style, best practices |
| `feature-dev:code-reviewer` | Bugs, logic errors, security vulnerabilities |
| `general-purpose` agent with quality/design prompt | Dead code, code reuse, framework antipatterns, structural design issues |
| `general-purpose` agent with efficiency/resilience prompt | N+1 queries, security risks, migration safety, resource leaks, performance |
| `general-purpose` agent with standards compliance prompt | CLAUDE.md/MEMORY.md compliance, convention drift, tooling conflicts |

**Conditionally include (only if detected):**
| Agent | Condition |
|---|---|
| `laravel-simplifier:laravel-simplifier` | PHP files changed |
| `pr-review-toolkit:code-simplifier` | Non-PHP files changed |
| `pr-review-toolkit:silent-failure-hunter` | Error handling patterns detected |
| `pr-review-toolkit:type-design-analyzer` | New type/interface definitions detected |
| `pr-review-toolkit:pr-test-analyzer` | Test files changed or added |
| `pr-review-toolkit:comment-analyzer` | Any comments or docstrings added/modified |
| `general-purpose` agent with iOS reviewer prompt | Swift files changed |

### Locating reference files

Before running agents, locate this skill's reference files. Use Glob with pattern `**/skills/review/references/*.md` to find the `references/` directory. Read the following files from it:

- **Every review**: `reuse-quality-reviewer.md`, `efficiency-reviewer.md`, `standards-reviewer.md` — use their full contents as prompts for three separate `general-purpose` Task agents. Pass each agent the list of all changed files and their diffs.
- **When Swift files detected**: `ios-reviewer.md` — use its full contents as the prompt for a `general-purpose` Task agent. Pass the agent the list of changed Swift files and their diffs.

Present a brief summary of which agents will run and why (e.g. "Running 5 agents: code-reviewer, silent-failure-hunter (detected try/catch in `src/Api/Client.php`), ..."). Then immediately continue to Step 6.

## Step 6 — Run selected agents in parallel

Launch all confirmed agents using the Task tool in a single message so they run concurrently. Pass each agent the list of changed files and the relevant diff context so they know what to review.

## Step 7 — Consolidate and deduplicate

Before presenting findings, review all agent outputs together to ensure coherence:

### 7a. Within-session consolidation

1. **Identify duplicates**: Multiple agents may flag the same issue. Keep the most detailed explanation and note which agents agreed.
2. **Identify contradictions**: One agent may suggest adding code that another suggests removing.
   - For contradictions: present both perspectives clearly, label as "⚠️ Conflicting advice", and let the user decide.
3. **Check CLAUDE.md alignment**: Remove or deprioritize findings that conflict with explicit CLAUDE.md guidance.
4. **Prioritize by confidence**: If multiple agents flag the same issue, it's higher confidence.
5. **Cross-agent overlap resolution** (when multiple agents flag the same lines, keep the most specific finding):
   - **Simplifier vs. quality-reviewer**: Keep the quality-reviewer's finding (more specific root cause). If simplifier says "simplify" and quality-reviewer says "reuse existing utility" — merge into one finding with the reuse suggestion.
   - **Code-reviewer vs. efficiency-reviewer**: If both flag a performance issue, keep the efficiency-reviewer's finding (deeper analysis, framework-specific fix).
   - **Code-reviewer vs. quality-reviewer on dead code**: Keep the quality-reviewer's finding (it verifies via codebase search).
   - **Code-reviewer vs. efficiency-reviewer on security**: Keep the efficiency-reviewer's finding (more specific exploit scenario and remediation).
   - **Quality-reviewer `framework-antipattern` vs. simplifier**: Keep the quality-reviewer's finding (cites the specific framework best practice).
   - **Standards-reviewer vs. any other agent**: If the standards-reviewer cites a specific CLAUDE.md rule and another agent flags the same lines for a different reason — keep both (the standards violation is an independent finding backed by documented authority). If they say the same thing, merge and cite the rule.
   - **Standards-reviewer `tooling-conflict` vs. simplifier**: Keep the standards-reviewer's finding (it cites the specific tool configuration).

### 7b. Cross-session comparison (if history exists)

Compare current findings against previous review history:

1. **Contradictions with applied fixes**: If a previous finding with status `applied` is now contradicted (e.g., "add X" was applied, now an agent says "remove X"):
   - Flag as "⚠️ Contradicts previous review"
   - Show what was done before and what's suggested now
   - Require explicit user decision

2. **Previously dismissed**: If a finding matches one with status `dismissed`, skip it — the user already said no.

3. **Still pending**: If a finding from the previous review is still relevant (same file/lines, issue still exists), mark as "Still outstanding from previous review".

4. **Resolved**: If a previous `pending` finding no longer applies (code was changed/removed), it will naturally not appear.

Assign each new finding a unique ID (e.g., `f1`, `f2`, ...) and classify its action type:
- `add` — suggesting new code be added
- `remove` — suggesting code be deleted
- `change` — suggesting code be modified
- `flag` — pointing out an issue without specific fix

## Step 8 — Present report

Once consolidation is complete, present a single report. On pass 2+, prefix the report with "**Pass N**" so the user knows which iteration they're on. Present in this order:

### Section 1: Contradictions with previous review (if any)

```
### ⚠️ Contradicts previous review

| ID | File | Previously | Now | Decision needed |
|----|------|-----------|-----|-----------------|
| f3 | src/Api/Client.php:60-65 | Added null check (applied) | Remove null check | Which to keep? |
```

### Section 2: Outstanding from previous review (if any)

```
### Outstanding from previous review

| ID | File | Issue | Status |
|----|------|-------|--------|
| f1 | src/Api/Client.php:45-52 | Remove unused $config | pending |
```

### Section 3: New findings

```
### New findings

| ID | File | Issue | Agents | Action |
|----|------|-------|--------|--------|
| f4 | src/Http/Controller.php:23 | Missing return type | code-reviewer | add |
| f5 | src/Models/User.php:45-50 | Simplify conditional | laravel-simplifier, code-simplifier | change |
```

### Section 4: Conflicts within this review (if any)

```
### ⚠️ Conflicting advice (this review)

| File | Agent A says | Agent B says |
|------|--------------|--------------|
| src/Example.php:10 | Add validation | Remove validation (redundant) |
```

### Section 5: Agent summary

List each agent that ran and how many issues it found (including "0 issues" for agents that found nothing).

## Step 9 — Await instructions

After presenting the report, use the AskUserQuestion tool to prompt the user:

- **Question**: "How would you like to proceed?"
- **Header**: "Next step"
- **Options** (2–3):
  1. Label: "Fix all" — Description: "Apply all non-conflicting fixes automatically"
  2. Label: "Done / Stop" — Description: "Exit the review cycle without applying any fixes"
  3. (Only include if contradictions are present) Label: "Resolve conflicts first" — Description: "Decide on conflicting advice before fixing"

The tool automatically adds an "Other" option — use that for specific ID inputs like "fix f1, f4" or "dismiss f2".

Then handle the response per the decision table below. Track their decisions:

- **"fix all"** or **"fix everything"**: Fix all non-conflicting issues. For conflicts, ask which approach to take. Mark fixed items as `applied`.
- **"fix f1, f4"** (specific IDs): Fix only those. Mark as `applied`.
- **"ignore f2"** or **"dismiss f2"**: Mark as `dismissed`.
- **"keep previous"** (for contradictions): Keep the previously applied approach, dismiss the new suggestion.
- **"use new"** (for contradictions): Apply the new suggestion, mark old as superseded.
- **"done"** or **"stop"**: Exit the review cycle immediately and proceed to Step 10.

Do NOT apply fixes that contradict each other — resolve conflicts first.

### After applying fixes

After applying fixes, immediately save review history to disk (same format as Step 10). Include a `pass` field and a `fixed_files` array listing the files modified in this pass. This ensures progress survives context compaction.

If any fixes were applied and the current pass is less than 3, loop back to Step 3 for a scoped re-review of only the files just modified.

If no fixes were applied (all findings dismissed or only flags), or the user said "done"/"stop", or this is pass 3, exit the cycle and proceed to Step 10. On the final pass, if findings remain, note them in the report so the user is aware.

## Step 10 — Save review history

After the review cycle completes (clean, user stopped, or 3 passes done), save the consolidated history from all passes to `.claude/review-history.json`:

```json
{
  "branch": "<current branch>",
  "reviewed_at": "<ISO timestamp>",
  "head_commit": "<HEAD commit hash>",
  "findings": [
    {
      "id": "f1",
      "file": "src/Example.php",
      "lines": "45-52",
      "agents": ["agent-name"],
      "action": "remove|add|change|flag",
      "summary": "Brief description of the issue",
      "status": "pending|applied|dismissed"
    }
  ]
}
```

Only save findings from the current review session. Previous history is replaced, not appended — we only track the most recent review per branch.

Create the `.claude/` directory if it doesn't exist. Ensure `.claude/review-history.json` is in `.gitignore` if the user doesn't want it committed (ask on first save if `.gitignore` exists but doesn't include it).

---

# Loop Mode

When invoked with `/review loop` (or when called from the `review-loop` script), behavior changes as follows:

## Differences from interactive mode

| Step | Interactive | Loop |
|------|-------------|------|
| Step 8 (Report) | Full formatted report | Brief summary only |
| Step 9 (Await) | Wait for user input | Auto-decide and fix immediately |
| Exit | Continue conversation | Create state file and exit |

## Loop mode behavior (replaces Steps 8-10)

After consolidation (Step 7), proceed automatically:

### L1. Evaluate findings

- **No issues found**: Create `.review-clean` with message "No issues found" and exit immediately.
- **Only unresolvable conflicts**: Create `.review-stuck` with conflict details and exit.
- **Fixable issues exist**: Continue to L2.

### L2. Auto-fix all issues

Apply fixes automatically using these rules:

1. Fix all non-conflicting issues without asking.
2. For within-session conflicts: prefer the simpler/shorter approach.
3. For contradictions with previous review: prefer the current suggestion (let the review evolve).
4. Skip any issues marked `dismissed` in previous history.

If a fix fails 3 times on the same issue, create `.review-stuck` with the issue details and error, then exit.

### L3. Save history

Save review history as normal (Step 10), marking fixed items as `applied`.

### L4. Signal continuation

Create `.review-continue` containing a brief summary of what was fixed:

```
Fixed 3 issues:
- f1: Removed unused variable (src/Example.php:45)
- f2: Added return type (src/Controller.php:23)
- f3: Simplified conditional (src/User.php:50)
```

Then exit. The calling script will run another iteration.

## State files

The loop mode communicates with the calling script via state files in the repo root:

| File | Meaning | Script action |
|------|---------|---------------|
| `.review-clean` | No issues found | Exit successfully |
| `.review-stuck` | Can't proceed (conflicts or repeated failures) | Exit with error |
| `.review-continue` | Fixes applied, may need another pass | Run next iteration |

These files are temporary and deleted by the script after reading.

## The review-loop script

Located at `~/.local/bin/review-loop`. Usage:

```bash
review-loop [-f|--force] [iterations]
```

- `-f`, `--force`: Allow running on main/master (passed through to `/review loop --force`)
- `iterations`: Maximum review cycles (default: 5)
- Runs `/review loop` repeatedly until clean, stuck, or max iterations
- Safe to run overnight on a feature branch
