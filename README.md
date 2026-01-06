# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

## What's Included

### mella

Productivity tools to streamline your development workflow.

**Commands:**

| Command | Description |
|---------|-------------|
| `/mella:commit` | Create git commits with optional intelligent grouping (`group`), push (`push`), and PR creation (`pr`) |
| `/mella:walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes |

**Skills (auto-triggered):**

| Skill | Triggers when... |
|-------|------------------|
| `walkthrough` | You ask Claude to "write a walkthrough", "create testing steps", or generate QA documentation |

Skills are triggered automatically based on context. For example, after implementing a feature you can say "now write a walkthrough guide" and Claude will use the skill.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured

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
# Create commits with intelligent grouping
/mella:commit group

# Create commits, push, and handle PR
/mella:commit group pr push

# Generate testing walkthroughs
/mella:walkthrough
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
