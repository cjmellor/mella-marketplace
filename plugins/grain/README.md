# grain

Automatic, always-on cross-session memory for Claude Code.

grain quietly records what you did and decided in each project, then recalls it
at the start of every session — so nothing important is lost to a fresh session
or to context compaction. No commands to run, no setup per project. It just
remembers.

> The name is a nod to *Black Mirror*'s "The Entire History of You" — the
> "grain" implant that passively records everything for later replay.

## How it works

Three lifecycle hooks, nothing fires on every turn:

| Hook | What it does |
|------|--------------|
| **SessionStart** | Reads your global + this-project memory and injects a recent digest into the new session. |
| **PreCompact** | Before context is compacted, writes the session-so-far to disk and emits a short anchor so key facts survive. |
| **SessionEnd** | Finalises this session's memory entry. |

Capture is **pattern-based and local** — it pulls your prompts, the files you
touched, the closing summary, and any next steps straight from the transcript.
**No separate model calls, no API keys, no cost, no network.**

## Where memory lives

Plain Markdown, centrally, never inside your repos:

```
~/.claude/grain/
├── global.md                    # cross-project memory
└── projects/<project-key>/memory.md
```

Files are yours to read, edit, or delete by hand. Per-project memory is keyed by
git remote (falling back to the repo path), so it follows the project around.

## Controls

- **Opt out of a session:** include `<private>` or `<no-memory>` anywhere in the
  conversation and that session won't be captured.
- **Tune recall size:** `GRAIN_RECALL_BUDGET` (chars of project memory injected,
  default 6000) and `GRAIN_GLOBAL_BUDGET` (default 2000).
- **Relocate the store (e.g. for testing):** `GRAIN_DIR=/some/path`.

## Status

v0.1.0 — early. Hooks fail open: if anything goes wrong, your session is never
blocked or slowed.

### Known limitations

- A short session that never compacts **and** is hard-killed (terminal closed,
  so `SessionEnd` doesn't fire) may not be captured. A SessionStart "catch what
  we missed" backstop is planned.
- Capture is literal (pattern-based); it records *what* happened well but may not
  always capture *why*. An optional rationale-capture layer is planned.
