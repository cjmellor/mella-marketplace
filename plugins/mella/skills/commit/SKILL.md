---
name: commit
description: Create git commits with automatic logical grouping, optional push, and PR creation. Trigger whenever the user asks to commit, push, or create/update a pull request — e.g. "commit", "commit this", "commit and push", "commit and open a PR", "create a PR", "open a pull request", "make a PR for this" — even when everything is already committed and there is nothing new to commit.
argument-hint: "[pr] [draft] [push [branch]]"
allowed-tools: [Bash, Read, Grep, Glob]
model: claude-sonnet-5
effort: low
context: fork
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "[ -f vendor/bin/pint ] && vendor/bin/pint --dirty || true"
          once: true
---

# Commit Command

Create git commits, automatically grouped into logical units, with optional push and PR creation.

## Usage

- `/mella:commit` — Commit all changes (auto-grouped if genuinely unrelated)
- `/mella:commit push` — Commit and push to current branch
- `/mella:commit push origin/feature-branch` — Commit and push to specific branch
- `/mella:commit pr` — Commit, push, and create or update a PR
- `/mella:commit pr draft` — Same, but a new PR is created as a draft

## Argument Parsing

Check `$ARGUMENTS` for flags: `pr`, `draft`, `push`. For `push`, extract the next token as the target branch if present. `pr` implies `push`; `draft` only has effect alongside `pr`.

## Committing

1. **Analyze**: `git status`, `git diff HEAD`, and `git log -5 --oneline` to understand the changes and the repo's commit style.
   - **Clean working tree is not an error.** If there is nothing to commit, skip the remaining commit steps. With `push` or `pr`, continue with the branch's existing commits — push mode still pushes, PR mode still creates or updates the PR. Only stop if the tree is clean **and** no flags were given (report that there is nothing to commit).
2. **Decide the split**: default to a **single commit**. Split into multiple commits only when the changes contain clearly unrelated sets — e.g. a dependency bump alongside an unrelated bug fix. When in doubt, one commit. Never separate tests, docs, or config from the feature they belong to.
3. **Commit**: for each unit, `git add <files>` → conventional commit message (`type(scope): subject`, imperative mood) → commit.
4. **Verify**: `git log --oneline -n <N>` and `git status` to confirm everything is committed.

## Push Mode (push flag)

After all commits are created:

- Branch specified after `push`: `git push origin HEAD:<branch>`
- No branch: `git push` (use `git push -u origin <branch>` if the branch has no upstream)

If push fails, stop and explain the error.

## Pull Request Mode (pr flag)

`pr` implies `push`. If the current branch is the repository's default branch (`main`/`master`), stop and report — do not invent a branch. A clean working tree does not block this mode: if the branch already has unpushed or pushed commits, proceed straight to the PR steps below.

Run `gh pr view --json number,title,url,body` to check for an existing PR:

- **No PR**: after committing and pushing, compose the title and description yourself per the standards below and run `gh pr create --title ... --body ...` (add `--draft` if the `draft` flag was given). Never use `--fill`. Display the new PR URL.
- **PR exists**: push the new commits and display the PR URL. Update the PR's title/description **only if** the new commits materially change what the PR proposes (new behavior, changed scope). A trivial addition — review fixes, a typo, a small follow-through — leaves the existing title and description untouched.

### PR title

The title is the merge commit's subject line. Same rules as commit subjects: `type(scope): subject`, imperative mood, ≤ 70 characters, describing the change itself — not the activity ("feat(auth): add rate limiting to login endpoint", never "Updates and fixes for auth"). If the branch can't be titled in one crisp line, say so — it is doing too many things.

### PR description

The reviewer can already see the diff. The description's only job is what the diff cannot say. Write 2–6 sentences of plain prose — no section headings like "Why", "What", "Summary", or "Tests" (bullets only if there are multiple distinct behavioral changes) — covering:

1. **Why** — the problem or goal that motivated the change; the context a reviewer needs before reading code.
2. **What, at the behavior level** — the user-visible or API-visible effect. Not file-by-file mechanics.
3. **Only when genuinely present**: breaking changes, deliberate trade-offs, or a non-obvious decision a reviewer would otherwise question.
4. **Issue link** — `Closes #N` when the change resolves a tracked issue.

Scale to the change: a one-line fix gets a one-line description.

**Never include:**

- How the change was implemented — the diff shows that.
- Tests, in any form: no "Tests"/"Test plan" section, no listing of new or existing test cases, no narration ("ran the tests, all passing") — passing tests are implied by the PR existing.
- Follow-ups, future work, or "next steps".
- Process artifacts: plans, phases, "as discussed", tool or agent mentions.
- File-by-file change lists.

## Rules

- Respect staged changes — keep them staged and include them in the appropriate commit.
- Always use conventional commit style (imperative mood).
- Never use `--amend`, `--force`, or other destructive operations.
- Stop and explain on commit failure — do not continue with remaining commits.
