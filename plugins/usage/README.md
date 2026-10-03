# usage

A Claude Code **mod** that keeps the model, context fill and rate-limit usage in
view, so you can drop a `statusline` script for them.

> Mods run code inside Claude Code on your machine. Read the source before you
> install one — this one is a single file, `hooks/register.tsx`, and only reads
> the session's own figures. It runs no shell commands and makes no network calls.

## The band

Shown above the prompt:

```
Sonnet 5.5  ◼◼◼◼◼ 12%  5h 8% (34m)  W 13% (4d 2h)  +
```

- The model, as `/model` shows it.
- A five-square bar and percentage for the context window.
- Each rate-limit window (`5h`, `W`) with its percentage and the time until it
  resets. Windows appear once the first response has reported them, and only on
  a subscription.
- Bars and percentages are green, turn yellow at 60% and red at 85%.
- The button on the right shows `+` while the pane is closed and `−` while it is
  open. Press it to open or close the pane.

The band is hidden while a survey is up.

## The pane

Open it with the `+` button or `/usage`.

- The model and the session cost.
- Context and each rate-limit window as a 20-square bar, with reset countdowns.
- The context window by category (system prompt, tools, messages, free space),
  largest first, estimated locally.

`r` refreshes. `Esc` hands the keyboard back and closes the pane.

## Freshness

The figures are pushed by the engine after each turn and whenever a rate-limit
window moves a whole point. Reset countdowns tick once a minute.

## Install

```bash
/plugin marketplace add cjmellor/mella-marketplace
/plugin install usage@mella-marketplace
/reload-plugins
```

To try it from a checkout without installing:

```bash
claude --plugin-dir plugins/usage
```

## Develop

```bash
claude plugin validate plugins/usage
claude plugin test plugins/usage
```

`validate` does not check what the band draws: an invalid render tree is dropped
by the engine and the band simply does not appear. If it goes missing after an
edit, run Claude Code with `--debug` and look for a `ui.render (AbovePrompt): a
hook returned a tree that does not validate` line.

## Limits

- It cannot draw in the status line or hide it. Keep your `statusline` for the
  directory, branch and PR, or move those into another mod.
- Only one hook can draw the band. This mod asks the hooks beneath it for their
  tree and stacks its own row on top, so it composes with `git-diff` only when it
  loads first. A mod that draws without asking replaces this one.
- The pane is a snapshot taken when it opens (press `r` to refresh).
- A hot reload of the mod closes an open pane.
- The terminal draws a button under the pointer as an inverted block. That comes
  from the engine and cannot be styled.
