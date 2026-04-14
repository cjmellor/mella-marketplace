# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

> **Note:** Requires Claude Code v2.1.3 or later.

## What's Included

### mella

Productivity tools to streamline your development workflow.

**Skills:**

| Skill | Description | Triggers when... |
|-------|-------------|------------------|
| `review` | Multi-agent code review with 5+ parallel agents, automatic fix-and-re-review cycles, and cross-session history. Runs in an isolated context. Supports loop mode for batch runs. | You invoke `/mella:review` or say "review my code", "check my changes" |
| `commit` | Create git commits with optional intelligent grouping (`group`), push (`push`), and PR creation (`pr`). Automatically runs Laravel Pint linter if available. | You invoke `/mella:commit` |
| `walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes. Runs in an isolated context. | You ask Claude to "write a walkthrough", "create testing steps", or generate QA documentation |
| `review-bot` | Triage GitHub bot review comments on PRs: re-reviews each comment against the actual code, applies valid fixes, dismisses false positives, and posts a summary comment on the PR. | You invoke `/mella:review-bot`, or say "handle the bot review", "triage bot comments on PR #N" |
| `implement` | TDD-driven implementation with a strict Red→Green loop. Auto-detects GStack planning artifacts if present; otherwise elicits a test queue interactively. Works standalone on any project. | You invoke `/mella:implement`, or say "start building", "let's build this", "ready to implement" |

Skills can be invoked directly or triggered automatically based on context. For example, after implementing a feature you can say "now write a walkthrough guide" and Claude will use the skill.

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
# Review code on current branch
/mella:review

# Create commits with intelligent grouping
/mella:commit group

# Create commits, push, and handle PR
/mella:commit group pr push

# Generate testing walkthroughs
/mella:walkthrough

# Triage bot review comments on a PR
/mella:review-bot

# Start a TDD-driven implementation
/mella:implement
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
