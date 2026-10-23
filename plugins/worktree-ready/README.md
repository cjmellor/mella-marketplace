# worktree-ready

Make a new git worktree of a Laravel app ready to use with no hands, and tidy it away when you are done.

worktree-ready is a Claude Code mod. When Claude enters a worktree of a Laravel app, it brings the worktree up to the same state as your main checkout, links it as its own `.test` site over HTTPS, and shows you the URL. When the worktree is exited, it unlinks the site and removes the folder if the work is finished.

## Requirements

- A Claude Code build that loads plugin modules (mods).
- macOS on APFS. Dependencies are cloned with `cp -c`, a copy-on-write clone, so the worktree must be on the same volume as the main checkout (worktrees under `.claude/worktrees/` always are).
- Laravel Valet. Without it the worktree is still set up, it just is not linked.
- `composer`, and your JS package manager, on the PATH.

## What happens when a worktree is entered

The mod only acts in a linked worktree that has an `artisan` file. Each step is skipped when it has nothing to do.

1. **Clone** `vendor`, `node_modules` and `public/build` from the main checkout with copy-on-write. This takes seconds and shares disk blocks until a file changes. `public/hot` and `bootstrap/cache` are never cloned.
2. **Copy `.env`** from the main checkout, if the worktree has none. The worktree shares main's database. A sqlite database is shared by pointing `DB_DATABASE` at main's file.
3. **Install only what changed.** `composer install` runs when `composer.lock` differs from main's, and the JS install runs when its lockfile differs. The package manager is picked from the lockfile (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock` or `package-lock.json`).
4. **Build assets only when needed.** The `build` script runs when the worktree's `resources/`, `package.json` or Vite, Tailwind, PostCSS or TypeScript config differ from main's working tree, or when main has no `public/build`.
5. **Link and secure.** The site is linked as `<project>-<worktree>` (for example `acme-blue-heron.test`), secured, and checked against `links`. The word `worktree` is never part of the name. A name that already points at a different folder is left alone and reported. `APP_URL` in the worktree's `.env` is set to the new URL, and `VITE_DEV_SERVER_KEY` and `VITE_DEV_SERVER_CERT` to the site's certificate, so the Vite dev server runs on https at that host. Without them, laravel-vite-plugin looks for a certificate named after the folder, finds none, and serves plain http assets that an https page blocks.

Claude does not get control back until this finishes, as with a `SessionStart` hook, so its first command in the worktree already has what it needs. Progress shows under the prompt.

A worktree that a session starts in (`claude --worktree`) is set up the same way.

## What happens when it is exited

Whether the exit keeps or removes the worktree, the site is unsecured and unlinked, and the mod checks that it is gone: from `links`, from the `Sites` folder, and that no nginx config or certificate for it is left. Leftover files are deleted and checked again, except an nginx config that proxies (a `valet proxy` of the same name is never touched). A site that cannot be fully removed is reported, and its worktree is kept until a later session can finish the job.

If the exit kept the worktree, the mod then removes the folder (checking that it is gone) and its branch when there is nothing to lose: no uncommitted changes, and the branch has commits of its own that are merged into the default branch, or a merged PR (found with `gh`) whose head is the worktree's current commit, which covers squash merges. A worktree on a detached HEAD counts as merged when its commit is in the default branch; it has no branch to delete. A worktree you entered and left without committing is kept. A worktree still locked by a running Claude session, or locked by anything other than Claude, is kept; a lock left by a Claude session that is no longer running is released. Anything else is kept, and you are told why once.

A session that ends while it is inside a worktree (you exit, or the process is stopped) marks it exited, but the time a session has to end is too short to unlink or remove anything. The same check runs for those, and other leftovers, at the start of the next session in any project, not only the one the worktree belongs to. A worktree still marked active whose Claude session has died (a lock naming a process that no longer runs) is treated the same way; one whose session is running is left alone.

Valet's `links` hides a site once its folder is gone, so the same start-of-session pass also reads the `Sites` folder and removes every site that points under a `.claude/worktrees/` folder that no longer exists, whether or not the mod set it up. Only worktrees under a project's `.claude/worktrees/` that the mod set up are ever removed.

## Limits

- A worktree whose branch was squash-merged without a PR, or with `gh` missing or signed out, is reported as not merged. It stays until you remove it.
- A session that is killed outright (SIGKILL, a crash) never ends cleanly. Its worktree stays marked active until a later session sees that the lock's process has died; a worktree with no Claude session lock is kept.
- A worktree entered and left without a commit is kept, on a branch or a detached HEAD, even though its commit is in the default branch.
- Valet is the only supported site tool.
- The enter and exit flows were tested against a faked machine. The start-of-session site cleanup was also run against a real Valet.

## Development

The pure helpers (link names, `.env` edits, the `links` table, lockfile and asset checks) are in `hooks/lib.ts`, and the enter and exit flows in `hooks/register.ts`. Both are covered by tests that fake the file system, `git`, `composer`, the package manager and Valet:

```bash
claude plugin validate plugins/worktree-ready
claude plugin test plugins/worktree-ready
```

## License

MIT
