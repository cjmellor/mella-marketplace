# git-diff

A Claude Code **mod** that keeps your uncommitted git changes in view.

A band above the prompt shows how much has changed, and a pane lists every
changed file, as a flat list or a folder tree.

> Mods run code inside Claude Code on your machine. Read the source before you
> install one — this one is a single file, `hooks/register.tsx`, and only runs
> `git` commands in your project.

## The band

Shown above the prompt whenever the working tree has changes:

```
± 3 files  +120 −45  ◼◼◼◼◼  +
```

- Files changed, lines added (green) and removed (red).
- Five squares split by the share of added lines, like GitHub's diff stat.
- The button on the right shows `+` while the pane is closed and `−` while it is
  open. Press it to open or close the pane.

The band is hidden when there are no changes, outside a git repository, and
while a survey is up.

## The pane

Open it with the `+` button on the band or with `/git-diff`.

- **List** — every changed file with its full path, biggest change first.
- **Tree** — folders first, then files. Each folder shows its rolled-up totals,
  folders with a single child folder merge into one row (`src/a/b/`), and a dim
  `│` guide marks each nesting level.
- Each row has its own `+N −N` and five-square bar.

Press `t` to switch views (the button reads `View: List (t)` or `View: Tree (t)`).
`Esc` hands the keyboard back and closes the pane. The pane opens sized to fit
its content, up to 30 rows. Your choice of view is kept for the session.

`t` works while the pane holds the keyboard, which it does when you open it. If
you have clicked away, click the pane or press `ctrl+x` then `tab` to give it
back.

## What counts as a change

`git diff HEAD --numstat` for tracked files, plus untracked files that are not
gitignored, counted line by line without touching your index. Binary files are
listed with `+0 −0`.

It refreshes at session start, after each `Edit` or `Write`, and at the end of
every turn. Changes made some other way (your editor, a shell command) show up
at the end of the next turn, or when you reopen the pane.

## Install

```bash
/plugin marketplace add cjmellor/mella-marketplace
/plugin install git-diff@mella-marketplace
/reload-plugins
```

To try it from a checkout without installing:

```bash
claude --plugin-dir plugins/git-diff
```

## Develop

```bash
claude plugin validate plugins/git-diff
claude plugin test plugins/git-diff
```

`validate` checks the manifest and the hooks module, but it does not check what
the band draws: an invalid render tree is dropped by the engine and the band
simply does not appear. If it goes missing after an edit, run Claude Code with
`--debug` and look for a `ui.render (AbovePrompt): a hook returned a tree that
does not validate` line.

## Limits

- Only one hook can draw the band. This mod asks the hooks beneath it for their
  tree and stacks its own row on top, so it sits alongside other band mods that
  do the same. A mod that draws without asking replaces it.
- Only the first 100 untracked files are counted.
- The pane is a snapshot taken when it opens; it does not update while open.
- A hot reload of the mod closes an open pane.
- The terminal draws a button under the pointer as an inverted block. That comes
  from the engine and cannot be styled.
