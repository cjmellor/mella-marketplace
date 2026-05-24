---
name: commit
description: Create git commits with optional intelligent grouping, push, and PR creation. Use when committing changes — standard single commit, logically grouped commits, pushing, or creating a PR.
argument-hint: "[group] [pr] [push [branch]]"
allowed-tools: [Bash, Read, Grep, Glob, AskUserQuestion]
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "[ -f vendor/bin/pint ] && vendor/bin/pint --dirty || true"
          once: true
---

# Commit Command

Create git commits with optional intelligent grouping of changes.

## Usage

- `/mella:commit` — Standard commit
- `/mella:commit group` — Analyze and group changes into logical commits
- `/mella:commit pr` — Commit and use existing PR (or ask to create one)
- `/mella:commit push` — Commit and push to current branch
- `/mella:commit push origin/feature-branch` — Commit and push to specific branch
- `/mella:commit group pr push` — Combine all options

## Argument Parsing

Check `$ARGUMENTS` for flags: `group`, `pr`, `push`. For `push`, extract the next token as the target branch if present.

## Standard Mode (no arguments)

Run `git status`, `git diff`, and `git log -5 --oneline` to understand changes and commit style. Draft a conventional commit message, stage relevant files with `git add`, commit, then verify with `git status`.

## Grouped Mode (group flag)

1. **Analyze**: `git status` + `git diff HEAD` + Read each changed file.
2. **Group by semantic purpose**: dependency files, config/build, source (by feature/module), tests, migrations. Aim for 2–5 groups. Group by meaning, not just file type.
3. **Commit each group**: `git add <files>` → conventional commit message → commit → verify.
4. **Finish**: Show `git log --oneline -n <N>` and `git status` to confirm all changes committed.

### Example

| Group | Files | Message |
|---|---|---|
| Dependencies | `package.json`, `composer.json` | "Update dependencies" |
| Feature | `src/Controllers/UserController.php`, `src/Middleware/AuthMiddleware.php` | "Add authentication middleware" |
| Tests | `tests/AuthTest.php` | "Add authentication tests" |

## Pull Request Mode (pr flag)

Run `gh pr view --json number,title,url`:
- **PR exists**: display URL and title.
- **No PR**: ask the user whether to create one. If yes, after all commits and push run `gh pr create --fill` and display the new PR URL.

## Push Mode (push flag)

After all commits are created, push:
- Branch specified after `push`: `git push origin HEAD:<branch>`
- No branch: `git push`

If push fails, explain the error and suggest `git push -u origin <branch>` for new branches.

## Rules

- Respect staged changes — keep them staged and include in appropriate groups.
- Always use conventional commit style (imperative mood).
- Never use `--amend`, `--force`, or other destructive operations.
- Stop and explain on commit failure — do not continue with remaining groups.
