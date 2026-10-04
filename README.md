# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

> **Note:** Requires Claude Code v2.1.3 or later.

## What's Included

### mella

Productivity tools to streamline your development workflow.

**Skills:**

| Skill | Description | Triggers when... |
|-------|-------------|------------------|
| `commit` | Create git commits with automatic logical grouping, push (`push`), and PR creation (`pr`, `draft`). Runs on a cheaper model, and runs Laravel Pint automatically if available. | You invoke `/mella:commit` |
| `walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes. Runs in an isolated context. | You ask Claude to "write a walkthrough", "create testing steps", or generate QA documentation |
| `pitch` | Deep-dive codebase analysis that generates innovative ideas one at a time. Pass a count and brief inline: `/pitch [N] [brief]`. Cheap sub-agents handle codebase and competitor research (with a cited feature matrix); accepted ideas land in a `PITCHES.md` handover dossier with a cross-run ledger. | You invoke `/mella:pitch`, or ask "what should I build next?", "pitch me ideas", "suggest features" |
| `review-bot` | Triage GitHub bot review comments on PRs: re-reviews each comment against the actual code, applies valid fixes, dismisses false positives, and posts a summary comment on the PR. | You invoke `/mella:review-bot`, or say "handle the bot review", "triage bot comments on PR #N" |
| `worktree-setup` | Provisions a project so every new git worktree starts ready to work: copies gitignored config, clones dependencies from the main checkout, carries plugins and the branch base over, and holds project MCP servers until dependencies exist. Stack recipes for Laravel, Node and Swift. | You invoke `/mella:worktree-setup`, or say "set up worktrees for this project", or a worktree is missing files, dependencies, plugins or MCP servers |

### grain

Automatic, always-on cross-session memory. grain quietly records what you did and decided in each project, then recalls it at the start of every session — so nothing important is lost to a fresh session or to context compaction. No commands to run, no setup per project.

It runs entirely through three lifecycle hooks (SessionStart recalls, PreCompact checkpoints, SessionEnd finalises). Capture is pattern-based and local — **no model calls, no API keys, no cost, no network.** Memory lives as plain Markdown under `~/.claude/grain/`, keyed per project. See [`plugins/grain/README.md`](plugins/grain/README.md) for controls and details.

### Mods

Mods are plugins that put live UI inside Claude Code: a band above the prompt, a pane you can open, and slash commands to drive them. They need a Claude Code build that loads plugin modules, and they run code on your machine — each one is a single `hooks/register.tsx` file, so read it before you install.

| Mod | What it does | Open it with |
|-----|--------------|--------------|
| `git-diff` | Keeps uncommitted changes in view: a band above the prompt shows files changed, lines added and removed and the current branch, and a pane lists every changed file as a flat list or a folder tree. | `/git-diff`, or the `+` button on the band |
| `usage` | Shows the model, reasoning effort, context fill and rate-limit usage above the prompt, so you can drop a `statusline` script for them. The pane breaks the context window down. | `/session-stats`, or the `+` button on the band |
| `artisan-dev` | Runs a Laravel app's `php artisan dev` from inside the session: per-process logs, restart and stop controls, a port override, site and tunnel links, and server state you can attach to your next prompt. | `/dev` |

See each mod's README for details: [`git-diff`](plugins/git-diff/README.md), [`usage`](plugins/usage/README.md), [`artisan-dev`](plugins/artisan-dev/README.md).

## Installation

**1. Add the marketplace:**

```bash
# From GitHub
/plugin marketplace add cjmellor/mella-marketplace

# Or from a local path
/plugin marketplace add /path/to/mella-marketplace
```

**2. Install a plugin:**

```bash
/plugin install mella@mella-marketplace

# Or the always-on cross-session memory plugin
/plugin install grain@mella-marketplace

# Or any of the mods
/plugin install git-diff@mella-marketplace
/plugin install usage@mella-marketplace
/plugin install artisan-dev@mella-marketplace
```

**3. Start using:**

```bash
# Create commits (auto-grouped when changes are unrelated)
/mella:commit

# Create commits, push, and create/update a PR
/mella:commit pr

# Generate testing walkthroughs
/mella:walkthrough

# Triage bot review comments on a PR
/mella:review-bot

# Make new worktrees start with config, dependencies, plugins and MCP servers
/mella:worktree-setup

# Generate 5 innovative feature ideas (default)
/mella:pitch

# Generate 10 ideas with a brief — no setup questions
/mella:pitch 10 Laravel gamification package, add a leaderboard

# Start a Laravel app's dev processes and open their pane
/dev
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
