# worktree-ready

Make a new git worktree of a Laravel app ready to use with no hands, and tidy it away when you are done.

worktree-ready is a Claude Code mod. When Claude enters a worktree of a Laravel app, it brings the worktree up to the same state as your main checkout, links it as its own `.test` site over HTTPS, and shows you the URL. When the worktree is exited, it unlinks the site and removes the folder if the work is finished.

## Requirements

- A Claude Code build that loads plugin modules (mods).
- macOS on APFS. Dependencies are cloned with `cp -c`, a copy-on-write clone, so the worktree must be on the same volume as the main checkout (worktrees under `.claude/worktrees/` always are).
- Laravel Valet or Herd. Without one the worktree is still set up, it just is not linked.
- `composer`, and your JS package manager, on the PATH.

## What happens when a worktree is entered

The mod only acts in a linked worktree that has an `artisan` file. Each step is skipped when it has nothing to do.

1. **Clone** `vendor`, `node_modules` and `public/build` from the main checkout with copy-on-write. This takes seconds and shares disk blocks until a file changes. `public/hot` and `bootstrap/cache` are never cloned.
2. **Copy `.env`** from the main checkout, if the worktree has none. The worktree shares main's database. A sqlite database is shared by pointing `DB_DATABASE` at main's file.
3. **Install only what changed.** `composer install` runs when `composer.lock` differs from main's, and the JS install runs when its lockfile differs. The package manager is picked from the lockfile (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock` or `package-lock.json`).
4. **Build assets only when needed.** The `build` script runs when the worktree's `resources/`, `package.json` or Vite, Tailwind, PostCSS or TypeScript config differ from main's working tree, or when main has no `public/build`.
5. **Link and secure.** The site is linked as `<project>-<worktree>` (for example `kandu-purring-crafting.test`), secured, and checked against `links`. The word `worktree` is never part of the name. A name that already points at a different folder is left alone and reported. `APP_URL` in the worktree's `.env` is set to the new URL.

Claude does not get control back until this finishes, as with a `SessionStart` hook, so its first command in the worktree already has what it needs. Progress shows under the prompt.

A worktree that a session starts in (`claude --worktree`) is set up the same way.

## What happens when it is exited

Whether the exit keeps or removes the worktree, the site is unsecured and unlinked, and the mod checks that it is gone from `links`.

If the exit kept the worktree, the mod then removes the folder and its branch when there is nothing to lose: no uncommitted changes, and the branch is merged into the default branch. Anything else is kept, and you are told why once. The same check runs for leftovers at the start of the next session, along with links whose folder no longer exists. Only worktrees under the project's `.claude/worktrees/` that the mod set up are ever removed.

## Options

| Option | Default | What it does |
|--------|---------|--------------|
| Site tool | `auto` | `valet`, `herd` or `auto`. Auto uses whichever is installed and does nothing when both are, with a toast asking you to choose. |

## Limits

- A worktree whose branch was squash-merged is reported as not merged, because its commits are not in the default branch's history. It stays until you remove it.
- A session that ends without exiting the worktree leaves it marked active, so it is kept.
- Herd's `links` output is assumed to match Valet's table. It has not been tried.
- The whole flow was tested against a faked machine. It has not run against a real Herd.
