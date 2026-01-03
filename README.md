# Mella Marketplace

A curated collection of plugins for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic's official CLI for Claude.

## What's Included

### mella

Productivity tools to streamline your development workflow.

| Command | Description |
|---------|-------------|
| `/mella:walkthrough` | Auto-generates step-by-step testing guides for features and bug fixes. Detects changes from git staged files or PRs and creates comprehensive QA instructions. |

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
/mella:walkthrough
```

## Uninstall

```bash
/plugin uninstall mella@mella-marketplace
/plugin marketplace remove mella-marketplace
```

## License

MIT
