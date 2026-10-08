# guardrails

Keep Claude's hands off the things you want to decide, steer its shell commands to the tools you use, and tidy each file it edits with the project's own formatter.

guardrails is a Claude Code mod. It works in any project: every rule switches on from what the project contains (a lockfile, `vendor/bin/pint`, `go.mod`, a CLAUDE.md line), never from its name.

## Requirements

- A Claude Code build that loads plugin modules (mods).

## Git

| Command                                               | Runs when                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git push`                                            | Your last message asked for it: it says push or ship, and not after a negation such as "don't push".                                                                                                                        |
| `gh pr create`, `gh pr ready`                         | Your last message says PR, pull request or ship.                                                                                                                                                                            |
| `gh pr merge`                                         | Your last message says merge or ship.                                                                                                                                                                                       |
| `git commit`                                          | A commit skill (any skill named `commit`, such as `mella:commit`) is running: Claude called it, or you typed `/mella:commit`. The window closes when the turn ends. With no commit skill installed, commits are left alone. |
| `git merge --no-ff`                                   | Never, where the project's CLAUDE.md or AGENTS.md mentions `--no-ff`.                                                                                                                                                       |
| A commit or PR whose text holds a Claude session link | Never.                                                                                                                                                                                                                      |

"Your last message" is the last prompt you typed, at the terminal, through Remote Control or as a `claude -p` prompt. Background task notifications and messages from other sessions or plugins do not count. The next prompt you type closes the door again.

## Shell

Refused, with a hint that names the right tool:

- CI polling: `gh run watch`, `gh pr checks --watch`, and `while`/`until` loops around `sleep`. Use the Monitor tool.
- `sed -i` (use `sd` or the Edit tool), `grep` (use `rg`), `find` (use `fd`).
- `gh run view --log-failed` that is not written to a file.
- File edits from Bash: `perl -pi` and `ruby -i`, `cat` or `tee` heredocs into a file, and Python, Node, Ruby, Perl or PHP scripts, inline or saved to a file, that write to a path inside the project. Scripts that only read, or write outside the project (such as `/tmp`), still run.

## Project tools

After each Write or Edit, the formatter the project has set up runs on that one file. Claude is told what it changed, so it re-reads the file before its next edit.

| File                         | Formatter                                   | When                                                                                                                           |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `*.php`                      | Pint (`vendor/bin/pint --format agent`)     | `vendor/bin/pint` exists. Blade files only with `Pint/laravel_blade`. `notPath` in `pint.json` is respected.                   |
| `*.blade.php`                | sheath (`artisan sheath:lint --fix`)        | `config/sheath.php` exists. Runs before Pint, so Pint formats last. Only safe fixes are applied; the rest is passed to Claude. |
| JS, TS, CSS, JSON, Markdown  | `vp fmt`                                    | `vite.config.*` has a `fmt` block and `node_modules/.bin/vp` exists. `ignorePatterns` is respected.                            |
| JS, TS, CSS, JSON            | Biome                                       | `biome.json(c)` and `node_modules/.bin/biome` exist, and there is no `vp fmt`.                                                 |
| JS, TS, CSS, Blade, Markdown | Prettier                                    | A Prettier config and `node_modules/.bin/prettier` exist, and there is no `vp fmt` or Biome.                                   |
| `*.go`                       | gofmt                                       | `go.mod` exists and `gofmt` is on the PATH.                                                                                    |
| `*.rs`                       | rustfmt, with the edition from `Cargo.toml` | `Cargo.toml` exists and `rustfmt` is on the PATH.                                                                              |
| `*.py`                       | Ruff, or Black                              | Ruff or Black is configured, and installed in `.venv` or on the PATH.                                                          |
| `*.swift`                    | swift-format                                | `.swift-format` exists and `swift-format` is on the PATH.                                                                      |

Files in `vendor`, `node_modules`, `target`, `.venv`, `build` and `dist` are never formatted. Linters, static analysis and tests never run per edit: they are too slow and work on the whole project.

Commands:

- The package manager comes from `packageManager` in `package.json`, then the lockfile. The others are refused (`npm` in a bun project, `bunx` in a pnpm project).
- `pint --test` is refused where Pint is installed. Run `pint --dirty --format agent` to fix instead.
- `--coverage` together with `--tia` is refused.
- In a Laravel project, a single `artisan` command gets `--no-interaction`.
- Where `/opt/homebrew/bin/valet` exists, bare `valet` is refused, since it resolves to the Composer copy and asks for a password.

## Options

Each part has its own switch in `/config`, all on by default.

| Option        | What it covers                            |
| ------------- | ----------------------------------------- |
| Git guard     | The Git table.                            |
| Shell guard   | The Shell list.                           |
| Project tools | Formatters and the project command rules. |

## Limits

- The guard reads commands as text. A command it cannot see into, such as a script that runs `git push` itself, is not caught.
- A script that creates a brand-new file at the project root by bare name is not caught. One that writes into a project folder is.
- If the guard itself fails on a command, the command is refused rather than run.

## Development

The rules are pure functions in `hooks/git.ts`, `hooks/shell.ts` and `hooks/project.ts`. The hooks, project detection and fixer runs are in `hooks/register.ts`.

```bash
claude plugin validate plugins/guardrails
claude plugin test plugins/guardrails
```

## License

MIT
