# artisan-dev

Run a Laravel app's `php artisan dev` from inside Claude Code and manage it without leaving the session.

artisan-dev is a Claude Code mod. `/dev` starts every process `php artisan dev` would, opens a pane with their logs and controls, and keeps a one-line status band above the prompt while they run.

## Requirements

- A Claude Code build that loads plugin modules (mods).
- A Laravel app whose Artisan has `dev` and `dev:list`.
- macOS: processes are launched through `perl` (preinstalled) and the site is opened with `open`.

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
| `/dev ask [name]` | Put the server state and recent output in the prompt |
| `/dev clear` | Clear the log |
| `/dev errors` | Toggle showing only errors and warnings |
| `/dev copy [name]` | Copy a process log (or the all view) to the clipboard |
| `/dev tunnel` | Show and copy the public tunnel URL |
| `/dev help` | List the commands |

### Port

The port comes from, in order: a live `Server running on [http://host:PORT]` line from the app, a `--port` override, `SERVER_PORT` in the project's `.env`, then Laravel's default.

Override it for the session with `--port=8111`, `-p 8111` or `port=8111` on `/dev`, `/dev start` or `/dev restart`. If the servers are running, they restart on the new port. `port=default` (or `port=reset`) drops the override. A port can't be combined with restarting a single process, because it applies to every process.

The override lives in the session only. It is never written to `.env`, and it stays in place until you reset it or the session ends.

The site opens at `APP_URL` from `.env`. A loopback `APP_URL` (`localhost` or `127.0.0.1`) gets the real port; any other host is used as written.

### The pane

- **Processes** — `0` shows the combined log in arrival order; `1`–`9` pick a process. The up and down arrows move between process names only.
- **Toolbar** — `x` Stop all (or `s` Start all), `r` Restart all, `t` Restart one (the selected process), `o` Open site, `u` Copy tunnel (shown once a tunnel URL is known), `c` Copy log, `a` Ask Claude.
- **Log** — keeps each process's own colours, wraps long lines, and scrolls with the wheel, page keys, Home and End. `e` (or the button in the Log divider) shows only errors and warnings.
- **Band above the prompt** — status dot, a clickable `:PORT ↗` link that opens the site, how many processes are up, and an error count. `+` and `−` open and close the pane.

### Crashes and restarts

Each process runs in its own process group, so stopping or restarting one kills everything it started. A process that exits with a non-zero code or is killed from outside is restarted up to five times; a process that dies within a second of starting is not retried. The budget resets after a minute of healthy running or when you press Start all. Toasts report starts, crashes, restarts and giving up.

Reloading the mod or ending the session stops the servers. Anything left over from an earlier load is cleaned up when the session starts, but only if its process group still carries this mod's marker.

### Tunnels

When a process prints a public tunnel URL (Cloudflare, ngrok, Expose and Herd share, localtunnel, localhost.run, Serveo, Pinggy, Tailscale funnel, Dev Tunnels and similar), the mod shows a toast and offers **Copy tunnel**. Detection reads process output, so a tunnel started outside the dev processes, such as from Herd's own Share button, isn't seen.

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `projectDir` | empty | Absolute path of the Laravel app. Empty uses the session's folder. |
| `tunnelHosts` | empty | Extra comma-separated domains to treat as a tunnel, for providers not built in. |

## Development

The pure logic (argument parsing, `.env` reading, ANSI handling, layout, exit policy) is covered by `hooks/register.test.ts`:

```bash
claude plugin validate plugins/artisan-dev
claude plugin test plugins/artisan-dev
```

The process lifecycle (starting, stopping, restarting) isn't covered by tests, because the test kit can't mock process spawning.

## License

MIT
