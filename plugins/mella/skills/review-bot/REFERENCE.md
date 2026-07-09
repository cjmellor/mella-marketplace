# PR Comment Structure

Post with `gh pr comment <PR_NUMBER> --body "$(cat <<'BODY' ... BODY)"`.

**Do not `@mention` the bot by username** — GitHub resolves it as a user mention and re-triggers the bot. Refer to it generically ("the review bot").

Write the comment as a human reviewer would: a one-line scoreboard, then one line per finding grouped by outcome. No tables — they wrap badly on GitHub and force the reasoning into cramped cells.

```markdown
Triaged **7** review bot comments — 4 fixed, 2 dismissed, 1 outdated.

**Fixed**

- [`src/Foo.php:42`](comment-url) — added the missing null check on `$user`
- [`src/Qux.php:30`](comment-url) — real type mismatch, but used a stricter type than the bot suggested

**Dismissed**

- [`src/Baz.php:88`](comment-url) — flagged a possible N+1, but the relation is already eager-loaded at line 72

**Outdated**

- `src/Old.php:10` — file no longer exists
```

Rules:

- The comment link goes **on the file path** — never a bare "Link" word or naked URL.
- Each line is a short prose clause: what the bot flagged and what was done about it (or why it was dismissed). Write the dismissal reason concretely enough that a reader doesn't need to open the bot's comment.
- Omit any group with zero items. If everything landed in one group, drop the group heading and keep just the scoreboard line plus the list.
- Items the user chose to fix or skip from the flagged set land in **Fixed** or **Dismissed** like any other; anything still unresolved goes under a final **Needs a human** group with the open question.
- No headings above `**bold**` group labels, no horizontal rules, no emoji, no sign-off.
