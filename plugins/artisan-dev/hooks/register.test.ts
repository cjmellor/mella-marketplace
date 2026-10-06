import { expect, test } from 'claude-code/testing'

import type { Dev } from '../types'
import { hasError, layoutChange, parseLayout, applyEvent, colorFor, applySgr, buttonGrid, buttonText, clearedLog, color256, afterCarriage, findTunnelUrl, layoutEntry, isProblem, logText, matchProcess, parseHosts, statusText, visibleEntries, effectivePort, gridRows, hasAnsi, logRoom, nextBack, judgeExit, noProcess, parseAnsi, wrapRanges, wrapSegments, parseDevArgs, statusColor, parseDevList, parseEnvPort, parseEnvValue, siteUrl, siteHost, promptText, rule, spawnArgv, toPort, PGID_MARK, splitLines, stripAnsi, summarise, uptime, wrapText } from './register'

const empty: Dev = { status: 'running', procs: [], feed: [], notes: [] }
const started = applyEvent(empty, { type: 'start', label: 'server', command: 'php artisan serve', pid: 10, time: '2026-10-03T16:00:00.000Z' })

test('strips ansi codes', () => {
  expect(stripAnsi('\u001b[32mready\u001b[0m')).toBe('ready')
})

test('splits lines across chunks', () => {
  const first = splitLines('', 'one\ntw')
  const second = splitLines(first.rest, 'o\n')

  expect(first.lines).toEqual(['one'])
  expect(second.lines).toEqual(['two'])
  expect(second.rest).toBe('')
})

test('formats uptime', () => {
  expect(uptime(0, 5000)).toBe('5s')
  expect(uptime(0, 125_000)).toBe('2m')
  expect(uptime(0, 3_900_000)).toBe('1h 5m')
})

test('tracks start, output, errors and restarts', () => {
  const output = applyEvent(started, { type: 'output', label: 'server', text: ' INFO Server running on [http://127.0.0.1:8123]. ' })
  const failed = applyEvent(output, { type: 'output', label: 'server', text: 'Fatal error: boom' })
  const restarted = applyEvent(failed, { type: 'start', label: 'server', pid: 11, time: '2026-10-03T16:01:00.000Z' })

  expect(output.procs[0]?.lines).toHaveLength(1)
  expect(failed.procs[0]?.errors).toBe(1)
  expect(restarted.procs[0]?.pid).toBe(11)
  expect(restarted.procs[0]?.errors).toBe(0)
  expect(summarise(failed)).toEqual({ total: 1, up: 1, errors: 1 })
})

test('marks an exited process and ignores unknown labels', () => {
  const exited = applyEvent(started, { type: 'exit', label: 'server', code: 1 })

  expect(exited.procs[0]?.state).toBe('exited')
  expect(applyEvent(started, { type: 'output', label: 'nope', text: 'x' })).toBe(started)
})

test('the prompt carries the state, then the failing processes, else the latest feed, else only the state', () => {
  const quiet = applyEvent(started, { type: 'output', label: 'server', text: 'booted', time: '2026-10-03T16:00:01.000Z' })
  const failed = applyEvent(quiet, { type: 'output', label: 'server', text: 'Exception: boom' })
  const state = 'STATE LINE'

  expect(promptText('app', failed, null, state)).toContain(state)
  expect(promptText('app', failed, null, state)).toContain('Exception: boom')
  expect(promptText('app', quiet, null, state)).toContain('server  booted')
  expect(promptText('app', quiet, 'server', state)).toContain('[server] `php artisan serve`')
  expect(promptText('app', clearedLog(failed), null, state)).not.toContain('```')
  expect(promptText('app', clearedLog(failed), null, state)).toContain(state)
})

test('keeps one feed across processes in arrival order', () => {
  const both = applyEvent(started, { type: 'start', label: 'queue', command: 'php artisan queue:listen', pid: 12 })
  const first = applyEvent(both, { type: 'output', label: 'queue', text: 'one', time: '2026-10-03T16:00:01.000Z' })
  const second = applyEvent(first, { type: 'output', label: 'server', text: 'two', time: '2026-10-03T16:00:02.000Z' })

  expect(second.feed.map(entry => `${entry.label}:${entry.text}`)).toEqual(['queue:one', 'server:two'])
})

test('colours wrap around the palette', () => {
  expect(colorFor(0)).toBe(colorFor(9))
})

test('wraps long text at spaces without losing words', () => {
  const rows = wrapText('precheck component DNS resolver healthy', 16)

  expect(rows.every(row => row.length <= 16)).toBe(true)
  expect(rows.join(' ')).toBe('precheck component DNS resolver healthy')
})

test('hard-wraps a word longer than the width', () => {
  expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
})

test('a pid event records the process group without touching the log', () => {
  const tracked = applyEvent(started, { type: 'pid', label: 'server', pid: 4242 })

  expect(tracked.procs[0]?.pid).toBe(4242)
  expect(tracked.feed).toEqual(started.feed)
})

test('failed and exit events both leave the process exited', () => {
  expect(applyEvent(started, { type: 'failed', label: 'server', code: 1 }).procs[0]?.state).toBe('exited')
  expect(applyEvent(started, { type: 'exit', label: 'server', signal: 'SIGTERM' }).feed.at(-1)?.text).toBe('· exit (SIGTERM)')
})

test('a start event carries the colour from dev:list', () => {
  const coloured = applyEvent(empty, { type: 'start', label: 'queue', command: 'q', color: '#93c5fd' })

  expect(coloured.procs[0]?.color).toBe('#93c5fd')
})

test('reads any number of processes from dev:list output', () => {
  const output = 'warning\n[{"command":"a b","name":"one","color":"#111"},{"command":"c","name":"two","color":"#222"},{"command":"d","name":"three"}]'

  expect(parseDevList(output).map(entry => entry.label)).toEqual(['one', 'two', 'three'])
  expect(parseDevList('no json here')).toEqual([])
})

test('every process is launched in its own session so its whole group can be killed', () => {
  const argv = spawnArgv('bun run dev')

  expect(argv.slice(0, 4)).toEqual(['perl', '-MPOSIX', '-e', 'POSIX::setsid(); exec @ARGV'])
  expect(argv.at(-1)).toContain('bun run dev')
  expect(argv.at(-1)).toContain(`${PGID_MARK}$$`)
})

test('output arriving during a stop is logged but not counted as an error', () => {
  const quiet = applyEvent(started, { type: 'output', label: 'server', text: 'error: script "dev" was terminated by signal SIGTERM', quiet: true })

  expect(quiet.procs[0]?.errors).toBe(0)
  expect(quiet.procs[0]?.lines).toContain('error: script "dev" was terminated by signal SIGTERM')
})

test('draws a titled rule exactly as wide as the pane', () => {
  expect(rule('Log', 20)).toHaveLength(20)
  expect(rule('Log', 20).startsWith('── Log ')).toBe(true)
  expect(rule('', 10)).toBe('──────────')
})

test('reads SERVER_PORT from .env text', () => {
  expect(parseEnvPort('APP_NAME=x\nSERVER_PORT=8111\n')).toBe(8111)
  expect(parseEnvPort('export SERVER_PORT="8222" # dev\n')).toBe(8222)
  expect(parseEnvPort("SERVER_PORT='8333'")).toBe(8333)
  expect(parseEnvPort('#SERVER_PORT=8444\nAPP_URL=http://localhost')).toBeNull()
  expect(parseEnvPort('SERVER_PORT=abc')).toBeNull()
  expect(parseEnvPort('SERVER_PORT=70000')).toBeNull()
  expect(parseEnvPort('')).toBeNull()
})

test('parses the three port argument styles', () => {
  expect(parseDevArgs('')).toEqual({ action: 'open' })
  expect(parseDevArgs('port=8111')).toEqual({ action: 'open', port: 8111 })
  expect(parseDevArgs('--port=8111')).toEqual({ action: 'open', port: 8111 })
  expect(parseDevArgs('-p 8111')).toEqual({ action: 'open', port: 8111 })
  expect(parseDevArgs('--port 8111')).toEqual({ action: 'open', port: 8111 })
  expect(parseDevArgs('port=default')).toEqual({ action: 'open', port: null })
})

test('rejects bad arguments with a helpful message', () => {
  expect(parseDevArgs('port=abc').error).toContain('not a valid port')
  expect(parseDevArgs('port=0').error).toContain('not a valid port')
  expect(parseDevArgs('-p').error).toContain('not a valid port')
  expect(parseDevArgs('banana').error).toContain('Unknown argument')
  expect(parseDevArgs('stop banana').error).toContain('Unknown argument')
})

test('the real server port wins over the override, which wins over .env', () => {
  expect(effectivePort({ override: 1, configured: 2, detected: 3 })).toBe(3)
  expect(effectivePort({ override: 1, configured: 2, detected: null })).toBe(1)
  expect(effectivePort({ override: null, configured: 2, detected: null })).toBe(2)
  expect(effectivePort({ override: null, configured: null, detected: null })).toBeNull()
  expect(toPort(' 8080 ')).toBe(8080)
})

test('the log fills whatever height the pane body has, leaving a row of slack', () => {
  expect(logRoom(28, 2, 6, false)).toBe(12)
  expect(logRoom(60, 2, 6, false)).toBe(44)
  expect(logRoom(60, 1, 6, true)).toBe(44)
  expect(logRoom(10, 3, 6, false)).toBe(4)
})

test('scrolling moves the log back from the newest line and clamps at both ends', () => {
  expect(nextBack(0, -1, 100)).toBe(3)
  expect(nextBack(3, 1, 100)).toBe(0)
  expect(nextBack(0, -1, 0)).toBe(0)
  expect(nextBack(0, -100, 10)).toBe(9)
  expect(nextBack(5, 40, 100)).toBe(0)
  expect(nextBack(0, -20, 100)).toBe(20)
})

const ESC = '\u001b'

test('parses colours, bold and resets into styled segments', () => {
  const segments = parseAnsi(`${ESC}[1m${ESC}[36m[vite+]${ESC}[0m server ${ESC}[32mrestarted${ESC}[39m.`)

  expect(segments.map(segment => segment.text)).toEqual(['[vite+]', ' server ', 'restarted', '.'])
  expect(segments[0]?.style).toEqual({ bold: true, color: 'cyan' })
  expect(segments[1]?.style).toEqual({})
  expect(segments[2]?.style.color).toBe('green')
  expect(segments[3]?.style.color).toBeUndefined()
})

test('understands bright, 256-colour and truecolour codes', () => {
  expect(applySgr({}, [91]).color).toBe('#fca5a5')
  expect(applySgr({}, [38, 5, 196]).color).toBe('#ff0000')
  expect(applySgr({}, [38, 5, 244]).color).toBe('#808080')
  expect(applySgr({}, [38, 2, 255, 128, 0]).color).toBe('#ff8000')
  expect(applySgr({}, [48, 2, 0, 0, 255]).background).toBe('#0000ff')
  expect(applySgr({ color: 'red' }, [31, 0])).toEqual({})
  expect(color256(300)).toBeUndefined()
})

test('drops cursor, mode and hyperlink escapes but keeps the text', () => {
  const noisy = `${ESC}[2K${ESC}[1A${ESC}[?25lready${ESC}]8;;https://x.test${ESC}\\ link${ESC}]8;;${ESC}\\`

  expect(parseAnsi(noisy).map(segment => segment.text).join('')).toBe('ready link')
  expect(stripAnsi(noisy)).toBe('ready link')
  expect(hasAnsi(noisy)).toBe(true)
  expect(hasAnsi('plain')).toBe(false)
})

test('wrapping keeps each piece of text in its own colour', () => {
  const segments = parseAnsi(`${ESC}[31mred words here${ESC}[0m and plain tail`)
  const rows = wrapSegments(segments, 12)

  expect(rows.map(row => row.map(segment => segment.text).join(''))).toEqual(['red words', 'here and', 'plain tail'])
  expect(rows[0]?.[0]?.style.color).toBe('red')
  expect(rows[1]?.[0]?.style.color).toBe('red')
  expect(rows[1]?.[1]?.style.color).toBeUndefined()
  expect(wrapRanges('abcdefghij', 4)).toEqual([[0, 4], [4, 8], [8, 10]])
})

test('keeps raw ANSI in the log but counts errors on the plain text', () => {
  const raw = `${ESC}[31merror${ESC}[0m: see ${ESC}[36mhttps://x.test:5176/${ESC}[0m`
  const next = applyEvent(started, { type: 'output', label: 'server', text: raw })

  expect(next.procs[0]?.lines.at(-1)).toBe(raw)
  expect(next.procs[0]?.errors).toBe(1)
  expect(promptText('app', next, 'server', 'state')).not.toContain(ESC)
})

test('buttons form an even grid, balanced so there is never a lone orphan row', () => {
  expect(gridRows(5, 20, 105)).toEqual([[0, 1, 2, 3, 4]])
  expect(gridRows(5, 20, 62)).toEqual([[0, 1, 2], [3, 4]])
  expect(gridRows(5, 20, 41)).toEqual([[0, 1], [2, 3], [4]])
  expect(gridRows(5, 20, 10)).toEqual([[0], [1], [2], [3], [4]])
  expect(gridRows(0, 20, 50)).toEqual([])
})

test('buttons keep their natural text and the grid is sized by the widest one', () => {
  const texts = [buttonText('Stop all', 'x'), buttonText('Restart process', 't')]

  expect(texts).toEqual(['Stop all (x)', 'Restart process (t)'])
  expect(buttonGrid(texts, 80)).toEqual([[0, 1]])
  expect(buttonGrid(texts, 25)).toEqual([[0], [1]])
})

test('clearing the log empties every log and error count but keeps the process rows', () => {
  const busy = applyEvent(started, { type: 'output', label: 'server', text: 'Fatal error: boom' })
  const cleared = clearedLog({ ...busy, notes: ['launcher: hello'] })

  expect(cleared.feed).toEqual([])
  expect(cleared.notes).toEqual([])
  expect(cleared.procs.map(proc => proc.label)).toEqual(['server'])
  expect(cleared.procs[0]?.lines).toEqual([])
  expect(cleared.procs[0]?.errors).toBe(0)
})

test('reads APP_URL from .env, skipping commented lines and trailing comments', () => {
  const text = '#APP_URL=http://localhost:8000\nAPP_URL=https://voice-isolator.test # valet\nAPP_NAME=x'

  expect(parseEnvValue(text, 'APP_URL')).toBe('https://voice-isolator.test')
  expect(parseEnvValue('APP_URL="http://app.test"', 'APP_URL')).toBe('http://app.test')
  expect(parseEnvValue('APP_NAME=x', 'APP_URL')).toBeNull()
  expect(parseEnvValue('APP_URL=', 'APP_URL')).toBe('')
})

test('open site uses APP_URL, but a local address gets the real server port', () => {
  expect(siteUrl('https://voice-isolator.test', 8111)).toBe('https://voice-isolator.test')
  expect(siteUrl('http://localhost', 8111)).toBe('http://localhost:8111')
  expect(siteUrl('http://localhost:8000/app', 8111)).toBe('http://localhost:8111/app')
  expect(siteUrl('http://127.0.0.1', null)).toBe('http://127.0.0.1')
  expect(siteUrl(null, 8111)).toBe('http://127.0.0.1:8111')
  expect(siteUrl('not a url', 8111)).toBe('http://127.0.0.1:8111')
  expect(siteUrl(null, null)).toBe('http://127.0.0.1:8000')
})

test('parses the subcommands, with a process target where one makes sense', () => {
  expect(parseDevArgs('stop')).toEqual({ action: 'stop' })
  expect(parseDevArgs('STATUS')).toEqual({ action: 'status' })
  expect(parseDevArgs('start --port=8111')).toEqual({ action: 'start', port: 8111 })
  expect(parseDevArgs('restart')).toEqual({ action: 'restart' })
  expect(parseDevArgs('restart queue')).toEqual({ action: 'restart', target: 'queue' })
  expect(parseDevArgs('restart -p 8222')).toEqual({ action: 'restart', port: 8222 })
  expect(parseDevArgs('ask vite')).toEqual({ action: 'ask', target: 'vite' })
  expect(parseDevArgs('site')).toEqual({ action: 'site' })
  expect(parseDevArgs('clear')).toEqual({ action: 'clear' })
})

test('rejects what a subcommand cannot take', () => {
  expect(parseDevArgs('stop port=8111').error).toContain("can't be used with \"/dev stop\"")
  expect(parseDevArgs('status queue').error).toContain('Unknown argument "queue"')
  expect(parseDevArgs('restart a b').error).toContain('Unknown argument "b"')
})

test('matches a process by name, case-insensitively, or by its number', () => {
  const procs = [{ label: 'queue' }, { label: 'Mailpit' }, { label: 'vite' }]

  expect(matchProcess(procs, 'QUEUE')).toBe('queue')
  expect(matchProcess(procs, 'mailpit')).toBe('Mailpit')
  expect(matchProcess(procs, '3')).toBe('vite')
  expect(matchProcess(procs, '9')).toBeNull()
  expect(matchProcess(procs, 'nope')).toBeNull()
})

test('status text summarises every process', () => {
  const two = applyEvent(started, { type: 'start', label: 'queue', command: 'q', time: '2026-10-03T16:00:00.000Z' })
  const text = statusText('voice-isolator', two, 8111, 'https://voice-isolator.test', Date.parse('2026-10-03T16:02:00.000Z'))

  expect(text.split('\n')[0]).toBe('voice-isolator dev — running · 2/2 up · :8111')
  expect(text).toContain('https://voice-isolator.test')
  expect(text).toContain('● queue')
  expect(statusText('voice-isolator', empty, null, 'u', 0)).toBe('Dev servers are not running.')
})

test('finds the tunnel URL in the real cloudflared and app output, and skips the stale one', () => {
  const box = '2026-10-03T16:17:20Z INF |  https://screenshots-watch-ind-throughout.trycloudflare.com                                |'
  const app = ' INFO TUNNEL_URL updated to: https://screenshots-watch-ind-throughout.trycloudflare.com. '
  const stale = '2026-10-03T16:17:20Z INF Environmental variables map[TUNNEL_URL:https://height-grocery-southern-girls.trycloudflare.com]'
  const local = ' INFO Tunnelling https://voice-isolator.test (host: voice-isolator.test). '

  expect(findTunnelUrl(box)).toBe('https://screenshots-watch-ind-throughout.trycloudflare.com')
  expect(findTunnelUrl(app)).toBe('https://screenshots-watch-ind-throughout.trycloudflare.com')
  expect(findTunnelUrl(stale)).toBeNull()
  expect(findTunnelUrl(local)).toBeNull()
})

test('recognises ngrok, Expose and Herd share, and ignores their docs pages', () => {
  expect(findTunnelUrl('t=2026 lvl=info msg="started tunnel" url=https://ab12.ngrok-free.app')).toBe('https://ab12.ngrok-free.app')
  expect(findTunnelUrl('Public HTTPS: https://my-app.sharedwithexpose.com')).toBe('https://my-app.sharedwithexpose.com')
  expect(findTunnelUrl('See https://ngrok.com/docs for help')).toBeNull()
  expect(findTunnelUrl('listening on http://127.0.0.1:8123')).toBeNull()
})

test('extra tunnel hosts come from the user setting', () => {
  expect(parseHosts(' My.Tunnel.Example.com, https://other.test/path ')).toEqual(['my.tunnel.example.com', 'other.test'])
  expect(parseHosts('')).toEqual([])
  expect(findTunnelUrl('url https://abc.my.example.com/x', ['my.example.com'])).toBe('https://abc.my.example.com/x')
  expect(findTunnelUrl('url https://abc.my.example.com/x')).toBeNull()
})

test('errors-only keeps warnings, errors, coloured levels and process events', () => {
  expect(isProblem(' INFO Server running on [http://127.0.0.1:8123]. ')).toBe(false)
  expect(isProblem(' WARN Unable to respect the PHP_CLI_SERVER_WORKERS variable')).toBe(true)
  expect(isProblem('2026-10-03T16:49:21Z ERR tunnel dropped')).toBe(true)
  expect(isProblem('Fatal error: boom')).toBe(true)
  expect(isProblem(`${ESC}[31mERROR${ESC}[0m disk full`)).toBe(true)
  expect(isProblem('· exit (143)')).toBe(true)
  expect(isProblem('precheck complete hard_fail=false')).toBe(false)
})

test('the visible log follows the selected process and the errors-only filter', () => {
  const noisy = applyEvent(
    applyEvent(started, { type: 'output', label: 'server', text: ' INFO ready' }),
    { type: 'output', label: 'server', text: ' WARN careful' },
  )

  expect(visibleEntries(noisy, 'server', false).map(entry => entry.text)).toEqual([' INFO ready', ' WARN careful'])
  expect(visibleEntries(noisy, 'server', true).map(entry => entry.text)).toEqual([' WARN careful'])
  expect(visibleEntries(noisy, '*', true).map(entry => entry.text)).toEqual([' WARN careful'])
})

test('copied log text is plain, and labelled only in the all view', () => {
  const entries = [
    { label: 'server', text: `${ESC}[32mready${ESC}[0m`, at: 0 },
    { label: 'queue', text: 'job done', at: 0 },
  ]

  expect(logText(entries, false)).toBe('ready\njob done')
  expect(logText(entries, true).split('\n')[0]).toContain('server  ready')
})

test('seven buttons split 3 + 2 + 2 rather than leaving an orphan', () => {
  expect(gridRows(7, 19, 60)).toEqual([[0, 1, 2], [3, 4], [5, 6]])
})

test('parses the errors, copy and tunnel subcommands', () => {
  expect(parseDevArgs('errors')).toEqual({ action: 'errors' })
  expect(parseDevArgs('tunnel')).toEqual({ action: 'tunnel' })
  expect(parseDevArgs('copy vite')).toEqual({ action: 'copy', target: 'vite' })
  expect(parseDevArgs('copy a b').error).toContain('Unknown argument "b"')
  expect(parseDevArgs('tunnel queue').error).toContain('Unknown argument')
})

test('a port belongs to every process, so it cannot be combined with restarting one', () => {
  expect(parseDevArgs('restart vite port=8111').error).toContain('every process')
  expect(parseDevArgs('restart --port=8111')).toEqual({ action: 'restart', port: 8111 })
  expect(parseDevArgs('restart vite')).toEqual({ action: 'restart', target: 'vite' })
})

test('reads quoted env values whole and strips a comment only from unquoted ones', () => {
  expect(parseEnvValue('APP_URL="https://a.test/#x"', 'APP_URL')).toBe('https://a.test/#x')
  expect(parseEnvValue('APP_URL="https://a.test" # note', 'APP_URL')).toBe('https://a.test')
  expect(parseEnvValue("APP_URL='https://a.test'", 'APP_URL')).toBe('https://a.test')
  expect(parseEnvValue('APP_URL=https://a.test # note', 'APP_URL')).toBe('https://a.test')
})

test('keeps the last carriage-return rewrite of a progress line', () => {
  expect(afterCarriage('10%\r50%\r100%')).toBe('100%')
  expect(afterCarriage('done\r')).toBe('done')
  expect(afterCarriage('plain')).toBe('plain')
})

test('judges an exit: stopped, clean, failed to start, crashed, and given up', () => {
  const base = { wasStopped: false, code: 1, ranFor: 10_000, attempts: 0 }

  expect(judgeExit({ ...base, wasStopped: true, attempts: 3 })).toEqual({ outcome: 'stopped', attempts: 0 })
  expect(judgeExit({ ...base, code: 0, attempts: 3 })).toEqual({ outcome: 'exited', attempts: 0 })
  expect(judgeExit({ ...base, ranFor: 200 })).toEqual({ outcome: 'start-failed', attempts: 1 })
  expect(judgeExit(base)).toEqual({ outcome: 'restart', attempts: 1 })
  expect(judgeExit({ ...base, attempts: 5 })).toEqual({ outcome: 'gave-up', attempts: 6 })
})

test('a signal death that nobody asked for is a crash, and a long healthy run resets the budget', () => {
  expect(judgeExit({ wasStopped: false, code: null, ranFor: 10_000, attempts: 0 }).outcome).toBe('restart')
  expect(judgeExit({ wasStopped: false, code: 1, ranFor: 3_600_000, attempts: 5 })).toEqual({ outcome: 'restart', attempts: 1 })
})

test('names the known processes when a target does not match', () => {
  expect(noProcess('x', 'server, vite')).toBe('No process "x". Known: server, vite.')
  expect(noProcess('x', '')).toContain('run /dev first')
})

test('the status dot is green only when everything is up and running', () => {
  expect(statusColor('running', 3, 3)).toBe('green')
  expect(statusColor('running', 2, 3)).toBe('yellow')
  expect(statusColor('stopping', 3, 3)).toBe('yellow')
  expect(statusColor('stopped', 0, 3)).toBeUndefined()
})

test('a log entry takes as many rows as its wrapped text, after the time, name and level badge', () => {
  const at = Date.parse('2026-10-03T16:00:00.000Z')
  const long = 'word '.repeat(28).trim()

  expect(layoutEntry({ label: 'vite', text: 'short', at }, false, 6, 80).count).toBe(1)
  expect(layoutEntry({ label: 'vite', text: long, at }, false, 6, 80).count).toBe(2)
  expect(layoutEntry({ label: 'vite', text: long, at }, true, 6, 80).count).toBe(3)
  expect(layoutEntry({ label: 'q', text: ' INFO hello', at }, false, 6, 80)).toMatchObject({ level: 'INFO', message: 'hello', extra: 7 })
})

test('an ANSI entry is laid out on its visible text, not its escape codes', () => {
  const coloured = { label: 'vite', text: `${ESC}[32m${'x'.repeat(100)}${ESC}[0m`, at: 0 }

  expect(layoutEntry(coloured, false, 6, 62)).toMatchObject({ ansi: true, level: null, count: 2 })
})

test('names the host of a site that is not loopback', () => {
  expect(siteHost('https://kandu-purring-crafting.test')).toBe('kandu-purring-crafting.test')
  expect(siteHost('https://kandu.test:8443/app')).toBe('kandu.test')
  expect(siteHost('http://localhost:8000')).toBeNull()
  expect(siteHost('http://127.0.0.1')).toBeNull()
  expect(siteHost('http://0.0.0.0:8000')).toBeNull()
  expect(siteHost('http://[::1]:8000')).toBeNull()
  expect(siteHost(null)).toBeNull()
})


test('a branch switch or a worktree appearing counts as a change, the first read does not', () => {
  const porcelain = 'worktree /a/kandu\nHEAD abc\nbranch refs/heads/main\n'
  const main = parseLayout('main\n', '', porcelain)
  const added = parseLayout('main\n', '', `${porcelain}\nworktree /a/kandu/.claude/worktrees/x\nHEAD abc\n`)

  expect(main).toEqual({ branch: 'main', worktrees: ['/a/kandu'] })
  expect(layoutChange(null, main)).toBeNull()
  expect(layoutChange(main, main)).toBeNull()
  expect(layoutChange(main, parseLayout('', 'abc123\n', porcelain))).toBe('Branch changed to abc123')
  expect(layoutChange(main, added)).toBe('Worktrees changed')
})

test('only a severity marker where the tool puts one counts as an error', () => {
  expect(hasError('[2026-08-19 14:45:31] local.ERROR: SQLSTATE[42P01]: Undefined table: 7 ERROR:  relation "cache" does not exist')).toBe(true)
  expect(hasError('┌ 14:45:31 ERROR ────────────────────────────')).toBe(true)
  expect(hasError('┌ 14:45:31 Illuminate\\Database\\QueryException ───')).toBe(true)
  expect(hasError('┌ 14:45:31 PDOException ───')).toBe(true)
  expect(hasError('4:37:54 PM [vite] Internal server error: Failed to resolve import "x"')).toBe(true)
  expect(hasError('✘ [ERROR] Could not resolve "./missing"')).toBe(true)
  expect(hasError('error during build:')).toBe(true)
  expect(hasError('PHP Fatal error:  Uncaught TypeError: x')).toBe(true)
  expect(hasError('TypeError: Cannot read properties of undefined')).toBe(true)

  expect(hasError('16:37:54 [vite+] (client) page reload vendor/amphp/http-server/resources/error.html')).toBe(false)
  expect(hasError('│ SQLSTATE[42P01]: Undefined table: 7 ERROR:  relation "cache" does not exist')).toBe(false)
  expect(hasError('[previous exception] [object] (PDOException(code: 42P01): SQLSTATE[42P01]: Undefined table')).toBe(false)
  expect(hasError('                      ^ (Connection: pgsql, SQL: select * from "cache")')).toBe(false)
  expect(hasError('Error handling is configured for the failed jobs table')).toBe(false)
  expect(hasError('[2026-10-04 14:21:39] local.DEBUG: [vite] connected. {"url":"https://kandu.test/login"}')).toBe(false)
  expect(hasError('it_handles_failed_jobs ✓')).toBe(false)
})
