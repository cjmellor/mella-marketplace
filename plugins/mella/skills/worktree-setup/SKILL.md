---
name: worktree-setup
description: Provision a project so every new git worktree starts ready to work — env and secret files, dependencies, plugins, MCP servers and branch base carried over from the main checkout. Use when setting up worktrees for a project, or when a worktree is missing files, dependencies, plugins or MCP servers.
---

# Worktree provisioning

A **provisioned** worktree is one a fresh session works in immediately: the same config, dependencies, plugins and MCP servers as the checkout it branched from, nothing installed by hand, and a clean `git status`.

Findings are verified on Claude Code 2.1.283 against a Laravel app (Kandu, `~/Dev/Private/projects/kandu`, commit `906781a`) unless marked **inferred** or **untested**. Several contradict the Claude Code docs, so after a Claude Code upgrade re-run step 7 before trusting them.

Work from the project's **main checkout** throughout. It is the single source every worktree inherits from: personal config lives in files that `.worktreeinclude` copies, dependencies are cloned from it, and hooks and MCP overrides point at scripts inside it.

Read the section of [references/stacks.md](references/stacks.md) for this project's stack before step 1; it lists the usual paths, dependency trees and install commands per stack.

## 1. Inventory what a fresh checkout lacks

```bash
git ls-files -oi --exclude-standard --directory
git ls-files -ci --exclude-standard
```

The first lists every gitignored path: all of it is absent from a new worktree. Sort each path into one bucket:

- **Config**: small files a session needs (`.env*`, credentials, agent config such as `.mcp.json`, generated guideline dirs, `.claude/settings.local.json`) → `.worktreeinclude`, step 2.
- **Dependencies**: large trees rebuilt from a lockfile → provisioning hook, step 5.
- **Build output**: compiled assets that tests or pages read → `.worktreeinclude` when rebuilding is slow or writes tracked files; otherwise leave it to the stack.
- **Local noise**: caches, logs, IDE state → stays behind.

The second lists files tracked despite matching `.gitignore`. A tracked file comes from git, so `.worktreeinclude` skips it, and any personal edit to it lands in a shared file. Ask the user about each: untrack with `git rm --cached` (the local copy stays) and move it to the config bucket, or keep it tracked and generic.

Done when every ignored path sits in a bucket and the user has ruled on every tracked-but-ignored file.

## 2. Write `.worktreeinclude`

A committed file at the project root, `.gitignore` syntax, listing the config bucket plus any build output chosen in step 1. Always include `.claude/settings.local.json`; step 3 depends on it.

How Claude Code applies it:

- Every worktree Claude Code creates gets it: `--worktree`, EnterWorktree, subagent isolation, background jobs. Defining a `WorktreeCreate` hook turns it off.
- Only gitignored paths copy; tracked files are skipped.
- Copies are byte for byte. **Symlinks are dropped** and **nested git repositories are skipped** (Composer packages installed from source are nested repos), so a dependency tree arrives broken — dependencies belong to the step-5 hook.
- Copies land before hooks run, so the hook can use copied credentials.
- Each file comes from the checkout being branched from, falling back to the main checkout when that checkout lacks it (**inferred** from checksums).

## 3. Personal settings live in `.claude/settings.local.json`

Put every personal Claude Code setting for the project in the main checkout's `.claude/settings.local.json`. It is gitignored, so it stays personal, and step 2's include hands it to every worktree. The tracked `.claude/settings.json` is for settings everyone who clones the repo should get.

- **Branch base**: `"worktree": {"baseRef": "head"}`. New worktrees then branch from the current checkout's `HEAD` (inside a worktree, that worktree's `HEAD`). The default, `"fresh"`, branches from `origin/<default branch>` and silently drops local work. It cannot name a branch.
- **Plugins**: `claude plugin install <plugin>@<marketplace> --scope local`, run in the main checkout. A project-scope install from the main checkout does **not** load in a session started inside a worktree, despite the docs. To move an existing install, install at local scope first, then `claude plugin uninstall <plugin> --scope <old scope> --keep-data`; plain uninstall deletes the plugin's data directory.

Done when `jq '{worktree, enabledPlugins}' .claude/settings.local.json` shows the branch base and every plugin the user relies on in this project.

## 4. Choose the hook events

Two creation paths, two events; register the step-5 script for both:

| Worktree created by | Event | Matcher |
|---|---|---|
| `claude --worktree`, subagent isolation, background jobs | `SessionStart` | `startup` |
| EnterWorktree inside a running session | `PostToolUse` | `EnterWorktree` |

`CwdChanged` stays silent on EnterWorktree. `${CLAUDE_PROJECT_DIR}` keeps pointing at the launch directory, so the script reads the worktree from stdin (`.new_cwd // .cwd`).

Merge into the main checkout's `.claude/settings.local.json`, with the absolute path of the script in the main checkout (a worktree's own copy only exists once the script is committed and the branch contains it):

```json
"hooks": {
  "SessionStart": [{"matcher": "startup", "hooks": [{"type": "command", "command": "/abs/path/to/project/.claude/hooks/worktree-deps.sh", "timeout": 600}]}],
  "PostToolUse": [{"matcher": "EnterWorktree", "hooks": [{"type": "command", "command": "/abs/path/to/project/.claude/hooks/worktree-deps.sh", "timeout": 600}]}]
}
```

## 5. Install the provisioning hook

Copy [templates/worktree-deps.sh](templates/worktree-deps.sh) to `.claude/hooks/worktree-deps.sh` and `chmod +x` it. Edit exactly two lines, `deps=(…)` and `install()`, from the stack recipe.

What the script guarantees:

- Exits at once in the main checkout, outside git, and when every dependency tree already exists, so running on every session start costs nothing.
- Clones each missing tree from the main checkout with `cp -c -R`, an APFS clone (macOS): blocks are shared until written, and symlinks and nested repos survive. In Kandu that took 11s and 18 MB, against 680 MB for a byte copy. On Linux, swap in `cp -a --reflink=auto` (**untested**).
- Then runs the package managers against the worktree's own lockfiles, which reconciles branch differences (verified: a branch on Laravel 13.32 was cloned from a main checkout on 13.29 and came out on 13.32).
- Holds `$git_dir/deps.lock` while working, so the two events never double-run and step 6 can wait on it.
- Prints one line on success, which lands in Claude's context on `SessionStart`; install output goes to `$git_dir/worktree-deps.log`.

Clone rather than symlink dependency trees: tools that resolve the project root through the dependency path break on a symlink (Pest did in Kandu).

Done when a hand run on a throwaway worktree (`git worktree add`, then `echo '{"cwd":"<worktree path>"}' | .claude/hooks/worktree-deps.sh`) exits 0 and prints the ready line, a second run exits 0 silently, and the stack's smoke command works in that worktree. Remove the throwaway worktree afterwards.

## 6. Hold MCP servers until dependencies exist

A stdio MCP server launched from project code (Laravel Boost's `php artisan boost:mcp`) starts alongside `SessionStart`, before the hook finishes, and fails with "Connection closed" in every `--worktree` session. Wrap it:

1. Copy [templates/mcp-wait.sh](templates/mcp-wait.sh) to `.claude/scripts/<server>-mcp.sh`, `chmod +x`, and set `marker` to a file that exists only once dependencies are installed and the `exec` line to the server's real command.
2. From the main checkout, register it as a local-scope override under the server's existing name:

   ```bash
   claude mcp add -s local <server-name> -- "$PWD/.claude/scripts/<server>-mcp.sh"
   ```

Local scope outranks the project `.mcp.json`, and Claude Code takes the whole entry from the winning scope with no merging. The override lives in `~/.claude.json`, so the tracked `.mcp.json` stays generic, and installers that regenerate `.mcp.json` (`boost:install`) leave it alone. `/mcp` and `claude mcp list` warn about one name in two scopes; that is expected. A session launched from the main checkout uses the main checkout's MCP config inside its worktree (**inferred**).

## 7. Verify with fresh sessions

Each probe is a real headless session creating a real worktree. Run from the main checkout, filling `$P` with the checks below:

```bash
claude -p --worktree wt-probe-a --permission-mode bypassPermissions "$P"
(cd .claude/worktrees/<existing feature worktree> && claude -p --worktree wt-probe-b --permission-mode bypassPermissions "$P")
claude -p --permission-mode bypassPermissions "Use the EnterWorktree tool with name wt-probe-c. Then: $P"
```

`$P` asks the session to run, as separate Bash commands, `pwd`, `git log -1 --format=%H`, `ls -d` on every config path and one marker per dependency tree, and the stack's smoke command; to call one tool on each project MCP server and answer CONNECTED or FAILED; and to report raw output.

Plugins need their own probe, from a session started *inside* a worktree (one launched from main reads main's settings and proves nothing):

```bash
cd .claude/worktrees/wt-probe-a && claude -p 'From your own available-skills list only (use no tools), list every skill whose name contains "<plugin>", or reply NONE.'
```

Probes sometimes skip a question or guess, so check the disk as well: the hook log at `.git/worktrees/<name>/worktree-deps.log`, symlink counts against main (`fd -H -t l . <tree> | wc -l`), and `git status --short`.

Done when every probe shows every config path and dependency marker, the smoke command succeeds, each MCP server answers CONNECTED, each plugin's skills are listed, each probe's base commit equals the `HEAD` of the checkout it started from, and `git status --short` is empty in every probe worktree.

Clean up. Headless probes leave their worktrees locked, and a session inside a worktree may register a local plugin record for that path in `~/.claude/plugins/installed_plugins.json`. For each probe, confirm `git -C <path> status --porcelain` prints nothing, run `claude plugin uninstall <plugin> --scope local --keep-data` inside it if a record was added, then:

```bash
git worktree unlock <path> && git worktree remove --force <path> && git branch -D worktree-<name>
```

## 8. Commit and hand over

Commit `.worktreeinclude`, `.claude/hooks/worktree-deps.sh` and any `.claude/scripts/*-mcp.sh` through the project's commit workflow. Personal config stays uncommitted by design: `.claude/settings.local.json` and `~/.claude.json`.

## Traps

- The auto-mode classifier may refuse edits to Claude settings files as self-modification. Give the user the exact JSON to paste and carry on with the rest; a denial covers the outcome, so another tool or route is off the table.
- `jq '… | keys?'` on a missing key prints nothing at all, which makes a populated file look empty. Select the fields explicitly.
- Builds in a worktree run only the asset step. A build that also regenerates tracked files (Kandu's `vp run build` chains Maizzle over `resources/views/mail/compiled`) dirties the tree; copy its output through `.worktreeinclude` instead, and run the asset-only command (`vp build`) when a rebuild is genuinely needed.
