# PR Comment Structure

Post with `gh pr comment <PR_NUMBER> --body "$(cat <<'BODY' ... BODY)"`.

**Do not `@mention` the bot by username** — GitHub resolves it as a user mention and re-triggers the bot. Refer to it generically ("the review bot").

```markdown
## Review Bot Triage

Reviewed **N** review bot comments.

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
```

Omit any section that has zero items.
