# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

> **Note:** Requires Claude Code v2.1.3 or later.

## What's Included

### mella

Productivity tools to streamline your development workflow.

**Skills:**

| Skill | Description | Triggers when... |
|-------|-------------|------------------|
| `commit` | Create git commits with optional intelligent grouping (`group`), push (`push`), and PR creation (`pr`). Automatically runs Laravel Pint linter if available. | You invoke `/mella:commit` |
| `walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes. Runs in an isolated context. | You ask Claude to "write a walkthrough", "create testing steps", or generate QA documentation |
| `pitch` | Deep-dive codebase analysis that generates innovative ideas one at a time. Pass a count and brief inline: `/pitch [N] [brief]`. Cheap sub-agents handle codebase and competitor research (with a cited feature matrix); accepted ideas land in a `PITCHES.md` handover dossier with a cross-run ledger. | You invoke `/mella:pitch`, or ask "what should I build next?", "pitch me ideas", "suggest features" |
| `review-bot` | Triage GitHub bot review comments on PRs: re-reviews each comment against the actual code, applies valid fixes, dismisses false positives, and posts a summary comment on the PR. | You invoke `/mella:review-bot`, or say "handle the bot review", "triage bot comments on PR #N" |

### grain

Automatic, always-on cross-session memory. grain quietly records what you did and decided in each project, then recalls it at the start of every session — so nothing important is lost to a fresh session or to context compaction. No commands to run, no setup per project.

It runs entirely through three lifecycle hooks (SessionStart recalls, PreCompact checkpoints, SessionEnd finalises). Capture is pattern-based and local — **no model calls, no API keys, no cost, no network.** Memory lives as plain Markdown under `~/.claude/grain/`, keyed per project. See [`plugins/grain/README.md`](plugins/grain/README.md) for controls and details.

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
```

**3. Start using:**

```bash
# Create commits with intelligent grouping
/mella:commit group

# Create commits, push, and handle PR
/mella:commit group pr push

# Generate testing walkthroughs
/mella:walkthrough

# Triage bot review comments on a PR
/mella:review-bot

# Generate 5 innovative feature ideas (default)
/mella:pitch

# Generate 10 ideas with a brief — no setup questions
/mella:pitch 10 Laravel gamification package, add a leaderboard
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
