# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

> **Note:** Requires Claude Code v2.1.3 or later.

## What's Included

### mella

Productivity tools to streamline your development workflow.

**Skills:**

| Skill | Description | Triggers when... |
|-------|-------------|------------------|
| `audit` | Orchestrated code review — runs security, code quality, and PR review skills in parallel, deduplicates findings, and produces a consistent structured report. | You invoke `/mella:audit`, or say "check my changes", "look over my diff", "review before I merge" |
| `commit` | Create git commits with optional intelligent grouping (`group`), push (`push`), and PR creation (`pr`). Automatically runs Laravel Pint linter if available. | You invoke `/mella:commit` |
| `competitor-analysis` | Deep competitive intelligence — auto-detects your product, searches the web, visits competitor sites live, and produces a Markdown report or interactive HTML dashboard. | You invoke `/mella:competitor-analysis`, or say "who are our competitors", "run competitor research" |
| `walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes. Runs in an isolated context. | You ask Claude to "write a walkthrough", "create testing steps", or generate QA documentation |
| `pitch` | Deep-dive codebase analysis that generates innovative, high-leverage feature ideas one at a time with scorecard ratings. | You invoke `/mella:pitch`, or ask "what should I build next?", "pitch me ideas", "suggest features" |
| `review-bot` | Triage GitHub bot review comments on PRs: re-reviews each comment against the actual code, applies valid fixes, dismisses false positives, and posts a summary comment on the PR. | You invoke `/mella:review-bot`, or say "handle the bot review", "triage bot comments on PR #N" |

## Installation

**1. Add the marketplace:**

```bash
# From GitHub
/plugin marketplace add cjmellor/mella-marketplace

# Or from a local path
/plugin marketplace add /path/to/mella-marketplace
```

**2. Install the plugin:**

```bash
/plugin install mella@mella-marketplace
```

**3. Start using:**

```bash
# Audit code on current branch
/mella:audit

# Create commits with intelligent grouping
/mella:commit group

# Create commits, push, and handle PR
/mella:commit group pr push

# Generate testing walkthroughs
/mella:walkthrough

# Triage bot review comments on a PR
/mella:review-bot

# Run competitor analysis (produces Markdown report or HTML dashboard)
/mella:competitor-analysis

# Generate innovative feature ideas, one at a time
/mella:pitch
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
