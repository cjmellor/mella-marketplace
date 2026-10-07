# artisan-dev

Run a Laravel app's `php artisan dev` from inside Claude Code and manage it without leaving the session.

artisan-dev is a Claude Code mod. `/dev` starts every process `php artisan dev` would, opens a pane with their logs and controls, and keeps a one-line status band above the prompt while they run.

## Requirements

- A Claude Code build that loads plugin modules (mods).
- A Laravel app whose Artisan has `dev` and `dev:list`.
- macOS: processes are launched through `perl` (preinstalled) and the site is opened with `open`.
- For `/dev tunnel open`: `cloudflared` on the PATH (`brew install cloudflared`).

## Usage

`/dev` starts the processes and opens the pane. Add a subcommand to do one thing:

| Command | What it does |
|---------|--------------|
| `/dev` | Start everything and open the pane |
| `/dev start` | Start everything, no pane |
| `/dev stop` | Stop everything and clear the log |
| `/dev restart [name]` | Restart everything, or one process by name or number |
| `/dev status` | Show what is running |
| `/dev site` | Open the site |
| `/dev ask [name]` | Attach the server state and recent output to your next prompt |
| `/dev clear` | Clear the log |
| `/dev errors` | Toggle showing only errors and warnings |
| `/dev copy [name]` | Copy a process log (or the all view) to the clipboard |
| `/dev tunnel` | Show and copy the public tunnel URL, or the open tunnel's report |
| `/dev tunnel open` | Open a public tunnel to this checkout and check its links (again: check them again) |
| `/dev tunnel close` | Close that tunnel and start Vite again |
| `/dev help` | List the commands |

### Port

The port comes from, in order: a live `Server running on [http://host:PORT]` line from the app, a `--port` override, `SERVER_PORT` in the project's `.env`, then Laravel's default.

Override it for the session with `--port=8111`, `-p 8111` or `port=8111` on `/dev`, `/dev start` or `/dev restart`. If the servers are running, they restart on the new port. `port=default` (or `port=reset`) drops the override. A port can't be combined with restarting a single process, because it applies to every process.

The override lives in the session only. It is never written to `.env`, and it stays in place until you reset it or the session ends.

The site opens at `APP_URL` from the `.env` of the checkout the session is in, so inside a worktree it is that worktree's site. A loopback `APP_URL` (`localhost` or `127.0.0.1`) gets the real port; any other host is used as written. The band link is labelled with that host (`acme.test ↗`), or `:port ↗` for a loopback `APP_URL`.

### The pane

- **Processes** — `0` shows the combined log in arrival order; `1`–`9` pick a process. The up and down arrows move between process names only.
- **Toolbar** — `x` Stop all (or `s` Start all), `r` Restart all, `t` Restart one (the selected process), `o` Open site, `n` Open tunnel (or Close tunnel), `k` Check again (when the tunnel's links point away from it), `u` Copy tunnel (shown once a tunnel URL is known), `c` Copy log, `a` Ask Claude (attaches the state and recent output to your next prompt; the button then reads `asked ✓` and drops it).
- **Log** — keeps each process's own colours, wraps long lines, and scrolls with the wheel, page keys, Home and End. `e` (or the button in the Log divider) shows only errors and warnings.
- **Band above the prompt** — status dot, a clickable site link (see Port above), how many processes are up, an error count and the tunnel's state. `+` and `−` open and close the pane.

### Errors

A line counts as an error only when it carries a severity marker where its tool puts one: a log level such as Laravel's `local.ERROR:` or a Pail `ERROR` badge, an exception class at the start of the message, or a phrase such as `Fatal error`, `Uncaught` or Vite's `Internal server error:`. A word like `error` inside a file name, path or ordinary sentence doesn't count. Matching lines raise the band's error count, turn red in the log and show a toast.

### Crashes and restarts

The servers run from the checkout the session is in. When Claude enters or exits a worktree, or you run `/dev`, the mod moves to that checkout and restarts anything running there. It moves only once the checkout has `vendor/autoload.php`, so a worktree that isn't provisioned yet keeps the servers where they were. While the servers run, the mod also checks that checkout every few seconds. If its branch changes, or a git worktree is added or removed, it restarts everything and shows a toast naming the cause.

Each process runs in its own process group, so stopping or restarting one kills everything it started. A process that exits with a non-zero code or is killed from outside is restarted up to five times; a process that dies within a second of starting is not retried. The budget resets after a minute of healthy running or when you press Start all. Toasts report starts, crashes, restarts and giving up.

Reloading the mod or ending the session stops the servers. Anything left over from an earlier load is cleaned up when the session starts, but only if its process group still carries this mod's marker.

### Tunnels

`/dev tunnel open` (or `n` in the pane) opens a Cloudflare quick tunnel to the checkout the servers run from, for a browser that is not on your machine, such as a cloud test browser. It:

1. stops the dev process that runs Vite (its command runs `vite` or `run dev`) and keeps it stopped while the tunnel is open, Restart all included, because a Vite dev server sends the browser to `:5173` on a host it cannot reach;
2. runs the app's `build` script with the lockfile's package manager;
3. starts its own `php artisan serve` on the first free port from 8100, and `cloudflared tunnel --url` to that port, with no Host rewrite, so the app sees the tunnel's own host;
4. once `cloudflared` reports a registered connection, asks its own serve for `/` and the page's CSS and JS as the tunnel would deliver them (the tunnel's `Host`, `X-Forwarded-Proto: https`). Nothing is looked up in public DNS, so a fresh tunnel host is never cached as missing on your machine. A new tunnel can still take about 20 seconds to resolve for its first visit from elsewhere.

**Copy tunnel** appears only when no link on the page points away from the tunnel. Canonical and alternate links name the real site on purpose, so they never count. Otherwise the band says how many do, and `/dev tunnel` lists them with the fix each kind needs in the app:

| Link | Why | Fix in the app |
|------|-----|----------------|
| `https://site.test/…`, `localhost`, `127.0.0.1` | The app builds links from `APP_URL` | Let web requests use their own host: drop `URL::useOrigin` or `URL::forceRootUrl` for them |
| `http://<tunnel>/…` | The app thinks the request is plain http | `URL::forceScheme('https')` in `AppServiceProvider` |
| `:5173` | A Vite dev server is writing `public/hot` | Stop Vite in this checkout |
| Any asset that does not answer 200 | The app does not serve it at that path | — |

The mod never edits `.env`. Fix the app, then `/dev tunnel open` (or `k`) checks again on the same URL. `/dev tunnel close`, the session moving to another checkout, and the session ending all close the tunnel; closing it starts Vite again when the servers are running. `/clear` keeps it open.

A process of your own that prints a public tunnel URL (Cloudflare, ngrok, Expose and Herd share, localtunnel, localhost.run, Serveo, Pinggy, Tailscale funnel, Dev Tunnels and similar), such as a webhook tunnel, is still detected: the mod shows a toast and offers **Copy tunnel**, but its links are not checked, and an open tunnel of the mod's takes its place in the button. Detection reads process output, so a tunnel started outside the dev processes, such as from Herd's own Share button, isn't seen.

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `projectDir` | empty | Absolute path of the Laravel app, which the servers then never leave. Empty follows the session's checkout, worktrees included, falling back to the same folder in the main checkout until a worktree is provisioned. |
| `tunnelHosts` | empty | Extra comma-separated domains to treat as a tunnel, for providers not built in. |

## Development

The pure logic (argument parsing, `.env` reading, ANSI handling, layout, exit policy, the tunnel's link check) is covered by `hooks/register.test.ts`:

```bash
claude plugin validate plugins/artisan-dev
claude plugin test plugins/artisan-dev
```

The process lifecycle (starting, stopping, restarting, and the tunnel's serve and `cloudflared`) isn't covered by tests, because the test kit can't mock process spawning.

## License

MIT
