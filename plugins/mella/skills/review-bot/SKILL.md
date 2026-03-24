---
name: review-bot
description: >
  Triage a review bot's comments on a GitHub PR. Re-reviews each comment against
  the actual code, applies valid fixes, dismisses false positives, and posts a
  summary comment on the PR. Use when asked to "handle the bot review", "triage
  bot comments", "check the bot's feedback", or "review the bot review on PR #N".
argument-hint: "[PR number] [--bot <name>]"
allowed-tools: [Bash, Read, Edit, Write, Grep, Glob, AskUserQuestion]
context: fork
effort: high
---

# /review-bot Skill

Triage review bot comments on a GitHub PR. For each comment: re-review the flagged code, apply valid fixes (or a better fix), and dismiss false positives. Post a structured summary comment on the PR when done.

## Step 0 — Plan mode guard

**If you are currently in plan mode, stop immediately.** Tell the user:

> "/review-bot requires Edit and Write access to apply fixes. You're in plan mode. Please exit plan mode first, then re-run `/review-bot`."

Do not proceed.

## Step 1 — Resolve the PR

Parse `$ARGUMENTS` for:
- A PR number (bare integer, e.g. `123`)
- `--bot <name>` (optional, a GitHub username to treat as the target bot)

**If no PR number was provided**, auto-detect from the current branch:

```
gh pr view --json number,url,title,headRefName
```

If this fails (no PR for the current branch), tell the user and stop.

Store the PR number, URL, title, and the repo owner/name (extract from `gh repo view --json nameWithOwner -q '.nameWithOwner'`).

## Step 2 — Fetch bot review comments

Fetch line-level review comments from the PR:

```
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --paginate
```

Each comment object includes:
- `id` — unique comment ID
- `body` — the comment text
- `path` — file path the comment is on
- `line` (or `original_line`) — line number in the diff
- `diff_hunk` — surrounding diff context
- `user.login` — author username
- `user.type` — `"Bot"` or `"User"`
- `in_reply_to_id` — parent comment ID if this is a thread reply
- `html_url` — link to the comment on GitHub

### Filter to bot comments

1. **If `--bot <name>` was provided**: keep only comments where `user.login` matches (case-insensitive).
2. **Otherwise**: keep comments where `user.type == "Bot"`.
3. **Always exclude** comments by `github-actions[bot]` (CI status, not code review).

If no bot comments are found, tell the user "No bot review comments found on PR #N" and stop.

### Group threaded conversations

Group comments by thread using `in_reply_to_id`:

- Comments with no `in_reply_to_id` are root comments (one finding each).
- Comments whose `in_reply_to_id` points to another bot comment in the set belong to that root's thread.
- For each thread, the **root comment** is the primary finding. Append follow-up messages as additional context.

Present a brief summary:

> Found N bot comments (M threads) from @botname on PR #X.

Proceed immediately — do not wait for confirmation.

## Step 3 — Evaluate each comment

Process each thread/comment sequentially.

### 3a. Read the code

Read the file at `path`. Use `line` and `diff_hunk` to locate the exact code. Read at least 30 lines above and below for context.

If the file does not exist (deleted or renamed since the review), mark the comment as `outdated` and skip to the next.

### 3b. Understand the bot's feedback

Parse the comment body to extract:
- **What it flags**: the specific issue or concern
- **Why**: the reasoning (if provided)
- **Suggested fix**: any code suggestion (markdown code blocks or GitHub `suggestion` blocks)

### 3c. Assess validity

Determine whether the feedback is valid:

1. **Is the flagged issue real?** Does the code actually have the problem described?
2. **Is it already handled?** Check if the concern is addressed elsewhere (middleware, parent scope, etc.).
3. **Is it relevant to the project?** Check CLAUDE.md / project conventions — the bot may flag something the project intentionally does differently.
4. **Is the suggested fix correct?** Even if the issue is real, the bot's suggestion may be wrong or suboptimal.

Classify each comment:

| Verdict | Meaning |
|---------|---------|
| `fix` | Valid issue. Apply the bot's suggestion. |
| `fix-alt` | Valid issue, but apply a better fix than the bot suggested. |
| `dismiss` | False positive or not applicable. |
| `outdated` | File/code no longer exists. |
| `flag` | Uncertain — needs user decision. |

Assign confidence: `high` (>= 90%), `medium` (70–89%), `low` (< 70%).

**If confidence is `low`**, do not auto-fix — classify as `flag` instead.

### 3d. Apply fix (if applicable)

For comments with verdict `fix` or `fix-alt` and confidence `high` or `medium`:

- Use the Edit tool to apply the change.
- If the bot provided a GitHub `suggestion` block, use it as a starting point but verify correctness before applying.
- For `fix-alt`, implement the better approach rather than the bot's literal suggestion.
- After editing, briefly note what was changed and why.

**Do not apply fixes that conflict with each other.** If two bot comments suggest contradictory changes to the same code region, classify both as `flag` and let the user decide.

## Step 4 — Present results

After processing all comments, present a summary:

```
### Review Bot Triage — PR #N

**Bot**: @botname | **Comments**: X | **Fixed**: Y | **Dismissed**: Z | **Flagged**: W

| # | File | Bot says | Verdict | Confidence | Action taken |
|---|------|----------|---------|------------|--------------|
| 1 | src/Foo.php:42 | Missing null check | fix | high | Added null check on `$user` |
| 2 | src/Bar.php:15 | Unused import | fix | high | Removed unused import |
| 3 | src/Baz.php:88 | Possible N+1 query | dismiss | high | Already eager-loaded on line 72 |
| 4 | src/Qux.php:30 | Type mismatch | fix-alt | medium | Used stricter type instead of bot's suggestion |
| 5 | src/Old.php:10 | Missing return type | outdated | — | File was deleted |
| 6 | src/Edge.php:55 | Complex refactor | flag | low | Needs manual review |
```

### Flagged items

If any items are marked `flag`, present the details and use AskUserQuestion:

- **Question**: "How would you like to handle the flagged items?"
- **Options**:
  1. "Fix all" — Apply fixes to all flagged items
  2. "Skip all" — Dismiss all flagged items
  3. "Done" — Leave as-is, proceed to PR comment

The tool adds an "Other" option automatically — use that for specific inputs like "fix 6, skip 7".

Handle the response:
- **"fix all"**: Apply fixes to all flagged items.
- **"fix 6"** (specific number): Fix only that item.
- **"skip all"** / **"skip 6"**: Dismiss the specified items.
- **"done"**: Proceed without changes to flagged items.

## Step 5 — Post PR summary comment

Compose a single comment on the PR:

```
gh pr comment <PR_NUMBER> --body "<comment body>"
```

Use a HEREDOC for the body to preserve formatting. The comment structure:

```markdown
## Review Bot Triage

Reviewed **N** comments from @botname.

### Applied fixes (Y)

| Comment | File | Issue | Fix applied |
|---------|------|-------|-------------|
| [Link](url) | `src/Foo.php:42` | Missing null check | Added null check |

### Dismissed (Z)

| Comment | File | Issue | Reason |
|---------|------|-------|--------|
| [Link](url) | `src/Baz.php:88` | Possible N+1 | Already eager-loaded at line 72 |

### Skipped — outdated

- [Link](url) — `src/Old.php:10` — File no longer exists

---
*Triaged by `/mella:review-bot`*
```

**Omit any section that has zero items.** If nothing was dismissed, omit the "Dismissed" section entirely. Same for "Applied fixes", "Skipped", etc.

## Step 6 — Final status

After posting the comment, tell the user:

> Posted triage summary on PR #N. Applied X fixes, dismissed Y comments, flagged Z for review.

If fixes were applied, remind the user:

> Changes have been applied but not committed. Run `/mella:commit` or stage and commit when ready.
