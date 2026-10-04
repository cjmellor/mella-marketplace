import type { EngineInterface, Register, RenderChildren } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Dev, DevEvent, Entry, Proc, Repo } from '../types'

const DEFAULT_PORT = 8000
const PANE = 'dev'
const PLUGIN = 'artisan-dev'
const RESEED_MS = 500
const PANE_ROWS = 28
const MAX_LINES = 300
const MAX_FEED = 600
const ALL = '*'
const PALETTE = ['#4ade80', '#22d3ee', '#c084fc', '#facc15', '#60a5fa', '#fb7185', '#fb923c', '#a3e635', '#f472b6']
const BADGES: Record<string, string> = {
  INFO: 'blue',
  NOTICE: 'cyan',
  WARN: 'yellow',
  WARNING: 'yellow',
  ERROR: 'red',
  FAIL: 'red',
  DEBUG: 'gray',
  INF: 'blue',
  WRN: 'yellow',
  ERR: 'red',
  DBG: 'gray',
}
const BADGE_PATTERN = /^\s*(INFO|NOTICE|WARN|WARNING|ERROR|FAIL|DEBUG|INF|WRN|ERR|DBG)\b\s*(.*)$/
const TIMESTAMP_PATTERN = /^\d{4}-\d\d-\d\dT[\d:.]+Z?\s+/
const TICK_MS = 5000
const TOAST_GAP_MS = 15_000
const TERM_GRACE_MS = 2000
const RESTART_DELAY_MS = 1000
const MIN_UPTIME_MS = 1000
const STABLE_UPTIME_MS = 60_000
const MAX_RESTARTS = 5
const MAX_LINE = 4000
export const PGID_MARK = '__dev_manager_pgid__:'
const ERROR_PATTERN = /\b(error|exception|fatal|failed)\b/i
const ANSI_PATTERN = /\u001b\[[0-9;:?]*[ -/]*[@-~]/g

const emptyDev: Dev = { status: 'stopped', procs: [], feed: [], notes: [] }

const dev = atom({ plugin: 'artisan-dev', key: 'dev' } as const, emptyDev)
const selected = atom({ plugin: 'artisan-dev', key: 'selected' } as const, null)
const now = atom({ plugin: 'artisan-dev', key: 'now' } as const, 0)
const isOpen = atom({ plugin: 'artisan-dev', key: 'isOpen' } as const, false)
const override = atom({ plugin: 'artisan-dev', key: 'override' } as const, null)
const configured = atom({ plugin: 'artisan-dev', key: 'configured' } as const, null)
const appUrl = atom({ plugin: 'artisan-dev', key: 'appUrl' } as const, null)
const detected = atom({ plugin: 'artisan-dev', key: 'detected' } as const, null)
const scrollBack = atom({ plugin: 'artisan-dev', key: 'back' } as const, 0)
const onlyErrors = atom({ plugin: 'artisan-dev', key: 'onlyErrors' } as const, false)
const tunnel = atom({ plugin: 'artisan-dev', key: 'tunnel' } as const, null)
const attached = atom({ plugin: 'artisan-dev', key: 'attached' } as const, null)
const repo = atom({ plugin: 'artisan-dev', key: 'repo' } as const, null)

const WHEEL_STEP = 3

export const nextBack = (current: number, by: number, total: number): number => {
  const step = Math.abs(by) <= WHEEL_STEP ? by * WHEEL_STEP : by

  return Math.min(Math.max(0, total - 1), Math.max(0, current - step))
}

const SERVER_LINE = /Server running on \[https?:\/\/[^\]:]+:(\d+)\]/

export const toPort = (value: string): number | null => {
  const port = Number(value.trim())

  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

const unquote = (value: string): string => {
  const quoted = value.match(/^(['"])(.*?)\1(?:\s+#.*)?\s*$/)

  return quoted ? (quoted[2] ?? '') : value.replace(/\s+#.*$/, '').trim()
}

export const parseEnvValue = (text: string, name: string): string | null => {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`)

  for (const line of text.split('\n')) {
    const match = line.match(pattern)

    if (match) {
      return unquote(match[1] ?? '')
    }
  }

  return null
}

export const parseEnvPort = (text: string): number | null => {
  const value = parseEnvValue(text, 'SERVER_PORT')

  return value === null ? null : toPort(value)
}

export const siteUrl = (appUrl: string | null, port: number | null): string => {
  const fallback = `http://127.0.0.1:${port ?? DEFAULT_PORT}`
  const found = appUrl?.match(/^(https?:\/\/)([^/:?#]+)(:\d+)?(.*)$/i)

  if (!appUrl || !found) {
    return fallback
  }

  const [, scheme = '', host = '', , rest = ''] = found
  const isLoopback = host === 'localhost' || host === '127.0.0.1'

  return isLoopback && port ? `${scheme}${host}:${port}${rest}` : appUrl
}

export const DEV_ACTIONS = [
  'start',
  'stop',
  'restart',
  'status',
  'site',
  'ask',
  'clear',
  'errors',
  'copy',
  'tunnel',
  'help',
] as const

export type DevAction = 'open' | (typeof DEV_ACTIONS)[number]

export type DevArgs = { action: DevAction; target?: string; port?: number | null; error?: string }

export const DEV_HELP = [
  '/dev                   start everything and open the pane',
  '/dev start             start everything (no pane)',
  '/dev stop              stop everything and clear the log',
  '/dev restart [name]    restart everything, or one process by name or number',
  '/dev status            show what is running',
  '/dev site              open the site',
  '/dev ask [name]        attach the state and latest output to your next prompt',
  '/dev clear             clear the log',
  '/dev errors            toggle showing only errors and warnings in the log',
  '/dev copy [name]       copy a process log (or the all view) to the clipboard',
  '/dev tunnel            show and copy the public tunnel URL, if one was printed',
  'Add --port=8111, -p 8111 or port=8111 to start or restart on another port (port=default resets).',
].join('\n')

const PORT_ACTIONS: DevAction[] = ['open', 'start', 'restart']
const TARGET_ACTIONS: DevAction[] = ['restart', 'ask', 'copy']

export const parseDevArgs = (args: string): DevArgs => {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const first = (tokens[0] ?? '').toLowerCase()
  const named = DEV_ACTIONS.find(name => name === first)
  const result: DevArgs = { action: named ?? 'open' }

  for (let index = named ? 1 : 0; index < tokens.length; index++) {
    const token = tokens[index] ?? ''
    const inline = token.match(/^(?:--port|-p|port)=(.+)$/)
    const separate = token === '--port' || token === '-p'
    const value = inline ? (inline[1] ?? '') : separate ? (tokens[++index] ?? '') : null

    if (value === null) {
      if (TARGET_ACTIONS.includes(result.action) && result.target === undefined) {
        result.target = token

        continue
      }

      return { action: result.action, error: `Unknown argument "${token}".\n${DEV_HELP}` }
    }

    if (!PORT_ACTIONS.includes(result.action)) {
      return { action: result.action, error: `A port can't be used with "/dev ${result.action}".` }
    }

    if (value === 'default' || value === 'reset') {
      result.port = null
    } else {
      const port = toPort(value)

      if (port === null) {
        return { action: result.action, error: `"${value}" is not a valid port (1–65535).` }
      }

      result.port = port
    }
  }

  if (result.action === 'restart' && result.target !== undefined && result.port !== undefined) {
    return { action: result.action, error: 'A port applies to every process — use /dev restart --port=N without a name.' }
  }

  return result
}

export const statusText = (name: string, current: Dev, port: number | null, url: string, at: number): string => {
  if (current.procs.length === 0) {
    return 'Dev servers are not running.'
  }

  const { total, up } = summarise(current)
  const width = Math.max(...current.procs.map(proc => proc.label.length))
  const rows = current.procs.map(proc => {
    const age = proc.state === 'up' ? `  ${uptime(proc.startedAt, at)}` : ''
    const errors = proc.errors > 0 ? `  ⚠${proc.errors}` : ''

    return `${proc.state === 'up' ? '●' : '○'} ${proc.label.padEnd(width)}  ${proc.state}${age}${errors}`
  })

  return [`${name} dev — ${current.status} · ${up}/${total} up${port ? ` · :${port}` : ''}`, url, ...rows].join('\n')
}

export const parseRepo = (revParse: string, branch: string, head: string): Repo | null => {
  const [toplevel, gitDir, commonDir] = revParse.split('\n').map(line => line.trim())

  if (!toplevel || !gitDir || !commonDir) {
    return null
  }

  return {
    branch: branch.trim() || head.trim() || null,
    worktree: gitDir === commonDir ? null : (toplevel.split('/').filter(Boolean).pop() ?? null),
  }
}

export const matchProcess = (procs: { label: string }[], target: string): string | null => {
  if (/^\d+$/.test(target)) {
    return procs[Number(target) - 1]?.label ?? null
  }

  return procs.find(proc => proc.label.toLowerCase() === target.toLowerCase())?.label ?? null
}

const PROBLEM_LEVELS = new Set(['WARN', 'WARNING', 'WRN', 'ERROR', 'ERR', 'FAIL'])

export const isProblem = (raw: string): boolean => {
  const plain = stripAnsi(raw).replace(TIMESTAMP_PATTERN, '')

  if (plain.startsWith('·')) {
    return true
  }

  const badge = plain.match(BADGE_PATTERN)

  return ERROR_PATTERN.test(plain) || (badge !== null && PROBLEM_LEVELS.has(badge[1] ?? ''))
}

export const visibleEntries = (current: Dev, pick: string, onlyProblems: boolean): Entry[] => {
  const shown = current.procs.find(proc => proc.label === pick)
  const entries: Entry[] = shown
    ? shown.lines.map(text => ({ label: shown.label, text, at: 0 }))
    : current.feed

  return onlyProblems ? entries.filter(entry => isProblem(entry.text)) : entries
}

export const logText = (entries: Entry[], withLabel: boolean): string => {
  const width = Math.max(0, ...entries.map(entry => entry.label.length))

  return entries
    .map(entry => {
      const text = stripAnsi(entry.text)

      return withLabel ? `${timeOf(entry.at)} ${entry.label.padEnd(width)}  ${text}` : text
    })
    .join('\n')
}

const TUNNEL_SUFFIXES = [
  'trycloudflare.com',
  'cfargotunnel.com',
  'ngrok-free.app',
  'ngrok-free.dev',
  'ngrok.app',
  'ngrok.dev',
  'ngrok.io',
  'sharedwithexpose.com',
  'loca.lt',
  'localtunnel.me',
  'lhr.life',
  'localhost.run',
  'serveo.net',
  'pinggy.io',
  'pinggy.link',
  'tunnelmole.com',
  'tunnelmole.net',
  'devtunnels.ms',
  'ts.net',
  'loophole.site',
  'bore.pub',
]
const TUNNEL_IGNORE = /map\[|environmental variables|settings:/i
const URL_IN_LINE = /https?:\/\/[^\s|)\]'"<>,]+/gi

export const parseHosts = (value: string): string[] =>
  value
    .split(/[,\s]+/)
    .map(host => host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, ''))
    .filter(Boolean)

export const findTunnelUrl = (raw: string, extraHosts: string[] = []): string | null => {
  const text = stripAnsi(raw)

  if (TUNNEL_IGNORE.test(text)) {
    return null
  }

  for (const match of text.matchAll(URL_IN_LINE)) {
    const url = match[0].replace(/[.,;:]+$/, '')
    const host = (url.replace(/^https?:\/\//i, '').split(/[/:?#]/)[0] ?? '').toLowerCase()
    const isBuiltIn = TUNNEL_SUFFIXES.some(suffix => host.endsWith(`.${suffix}`))
    const isExtra = extraHosts.some(extra => host === extra || host.endsWith(`.${extra}`))

    if (isBuiltIn || isExtra) {
      return url
    }
  }

  return null
}

export const effectivePort = (
  ports: { override: number | null; configured: number | null; detected: number | null },
): number | null => ports.detected ?? ports.override ?? ports.configured

const OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
const CSI_PATTERN = /\u001b\[([0-9;:?]*)([ -/]*[@-~])/g

export const stripAnsi = (text: string): string =>
  text.replace(OSC_PATTERN, '').replace(ANSI_PATTERN, '').replace(/[\u001b\u0007]/g, '')

export const hasAnsi = (text: string): boolean => text.includes('\u001b')

export type Style = {
  color?: string
  background?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  inverse?: boolean
}

export type Segment = { text: string; style: Style }

const BASIC = ['gray', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const BRIGHT = ['#9ca3af', '#fca5a5', '#86efac', '#fde047', '#93c5fd', '#d8b4fe', '#67e8f9', '#ffffff']
const CUBE = [0, 95, 135, 175, 215, 255]

const rgb = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map(value => Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0')).join('')}`

export const color256 = (n: number): string | undefined => {
  if (n < 0 || n > 255) {
    return undefined
  }

  if (n < 8) {
    return BASIC[n]
  }

  if (n < 16) {
    return BRIGHT[n - 8]
  }

  if (n < 232) {
    const index = n - 16

    return rgb(CUBE[Math.floor(index / 36)] ?? 0, CUBE[Math.floor(index / 6) % 6] ?? 0, CUBE[index % 6] ?? 0)
  }

  const level = 8 + (n - 232) * 10

  return rgb(level, level, level)
}

export const applySgr = (style: Style, codes: number[]): Style => {
  let next: Style = { ...style }
  const list = codes.length === 0 ? [0] : codes

  for (let index = 0; index < list.length; index++) {
    const code = list[index] ?? 0

    if (code === 0) {
      next = {}
    } else if (code === 1) {
      next.bold = true
    } else if (code === 2) {
      next.dim = true
    } else if (code === 3) {
      next.italic = true
    } else if (code === 4) {
      next.underline = true
    } else if (code === 7) {
      next.inverse = true
    } else if (code === 9) {
      next.strike = true
    } else if (code === 22) {
      next.bold = false
      next.dim = false
    } else if (code === 23) {
      next.italic = false
    } else if (code === 24) {
      next.underline = false
    } else if (code === 27) {
      next.inverse = false
    } else if (code === 29) {
      next.strike = false
    } else if (code >= 30 && code <= 37) {
      next.color = BASIC[code - 30]
    } else if (code >= 90 && code <= 97) {
      next.color = BRIGHT[code - 90]
    } else if (code >= 40 && code <= 47) {
      next.background = BASIC[code - 40]
    } else if (code >= 100 && code <= 107) {
      next.background = BRIGHT[code - 100]
    } else if (code === 39) {
      next.color = undefined
    } else if (code === 49) {
      next.background = undefined
    } else if (code === 38 || code === 48) {
      const mode = list[index + 1]
      let value: string | undefined

      if (mode === 5) {
        value = color256(list[index + 2] ?? -1)
        index += 2
      } else if (mode === 2) {
        value = rgb(list[index + 2] ?? 0, list[index + 3] ?? 0, list[index + 4] ?? 0)
        index += 4
      }

      if (code === 38) {
        next.color = value
      } else {
        next.background = value
      }
    }
  }

  return next
}

export const parseAnsi = (text: string): Segment[] => {
  const cleaned = text.replace(OSC_PATTERN, '')
  const segments: Segment[] = []
  let style: Style = {}
  let last = 0

  const push = (chunk: string) => {
    const plain = chunk.replace(/[\u001b\u0007]/g, '')

    if (plain) {
      segments.push({ text: plain, style })
    }
  }

  for (const match of cleaned.matchAll(CSI_PATTERN)) {
    const index = match.index ?? 0

    push(cleaned.slice(last, index))
    last = index + match[0].length

    if (match[2] === 'm') {
      style = applySgr(
        style,
        (match[1] ?? '')
          .split(/[;:]/)
          .filter(part => part !== '')
          .map(Number),
      )
    }
  }

  push(cleaned.slice(last))

  return segments
}

export const wrapRanges = (text: string, width: number): [number, number][] => {
  const ranges: [number, number][] = []
  let start = 0

  while (text.length - start > width) {
    const space = text.lastIndexOf(' ', start + width)
    const end = space > start ? space : start + width

    ranges.push([start, end])
    start = end

    while (start < text.length && /\s/.test(text[start] ?? '')) {
      start++
    }
  }

  ranges.push([start, text.length])

  return ranges
}

export const wrapSegments = (segments: Segment[], width: number): Segment[][] => {
  const plain = segments.map(segment => segment.text).join('')
  const styles: Style[] = segments.flatMap(segment => Array.from({ length: segment.text.length }, () => segment.style))

  return wrapRanges(plain, width).map(([from, to]) => {
    const row: Segment[] = []

    for (let index = from; index < to; index++) {
      const style = styles[index] ?? {}
      const tail = row[row.length - 1]

      if (tail && tail.style === style) {
        tail.text += plain[index] ?? ''
      } else {
        row.push({ text: plain[index] ?? '', style })
      }
    }

    return row
  })
}

export const splitLines = (buffer: string, chunk: string): { lines: string[]; rest: string } => {
  const parts = (buffer + chunk).split('\n')

  return { lines: parts.slice(0, -1), rest: parts[parts.length - 1] ?? '' }
}

export const uptime = (since: number, at: number): string => {
  const seconds = Math.max(0, Math.floor((at - since) / 1000))

  if (seconds < 60) {
    return `${seconds}s`
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`
  }

  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

const withProc = (procs: Proc[], label: string, change: (proc: Proc) => Proc): Proc[] =>
  procs.map(proc => (proc.label === label ? change(proc) : proc))

export const applyEvent = (current: Dev, event: DevEvent): Dev => {
  const label = event.label
  const at = Date.parse(event.time ?? '') || 0

  if (!label) {
    return current
  }

  const known = current.procs.some(proc => proc.label === label)

  if (event.type === 'start') {
    const fresh: Proc = {
      label,
      command: event.command ?? '',
      color: event.color ?? '',
      pid: event.pid ?? 0,
      state: 'up',
      startedAt: at,
      restarts: 0,
      errors: 0,
      lines: [],
    }

    return {
      ...current,
      procs: known
        ? withProc(current.procs, label, proc => ({
            ...proc,
            command: event.command ?? proc.command,
            color: event.color ?? proc.color,
            pid: event.pid ?? proc.pid,
            state: 'up',
            startedAt: at,
            restarts: proc.restarts + 1,
            errors: 0,
          }))
        : [...current.procs, fresh],
    }
  }

  if (!known) {
    return current
  }

  if (event.type === 'pid') {
    return { ...current, procs: withProc(current.procs, label, proc => ({ ...proc, pid: event.pid ?? proc.pid })) }
  }

  if (event.type === 'output') {
    const raw = (event.text ?? '').trimEnd()
    const text = stripAnsi(raw)

    if (!text.trim()) {
      return current
    }

    return {
      ...current,
      feed: [...current.feed, { label, text: raw, at }].slice(-MAX_FEED),
      procs: withProc(current.procs, label, proc => ({
        ...proc,
        errors: proc.errors + (!event.quiet && ERROR_PATTERN.test(text) ? 1 : 0),
        lines: [...proc.lines, raw].slice(-MAX_LINES),
      })),
    }
  }

  const detail = event.code ?? event.signal
  const note = `· ${event.type}${detail === undefined || detail === null ? '' : ` (${detail})`}`

  return {
    ...current,
    feed: [...current.feed, { label, text: note, at }].slice(-MAX_FEED),
    procs: withProc(current.procs, label, proc => ({
      ...proc,
      state:
        event.type === 'exit' || event.type === 'failed'
          ? 'exited'
          : event.type === 'restarting'
            ? 'restarting'
            : proc.state,
      lines: [...proc.lines, note].slice(-MAX_LINES),
    })),
  }
}

export const summarise = (current: Dev): { total: number; up: number; errors: number } => ({
  total: current.procs.length,
  up: current.procs.filter(proc => proc.state === 'up').length,
  errors: current.procs.reduce((sum, proc) => sum + proc.errors, 0),
})

const procTail = (proc: Proc): string =>
  `[${proc.label}] \`${proc.command}\`\n${proc.lines.slice(-25).map(stripAnsi).join('\n')}`

const logBlock = (current: Dev, label: string | null): string => {
  const failing = current.procs.filter(proc => proc.errors > 0)
  const picked = label ? current.procs.filter(proc => proc.label === label) : failing

  return picked.length > 0 ? picked.map(procTail).join('\n\n') : label ? '' : logText(current.feed.slice(-25), true)
}

export const promptText = (name: string, current: Dev, label: string | null, status: string): string => {
  const body = logBlock(current, label)
  const log = body ? `\n\n\`\`\`\n${body}\n\`\`\`` : ''

  return `State and latest output of \`php artisan dev\` in ${name}.\n\n${status}${log}\n`
}

export type ProcSpec = { label: string; command: string; color: string }

export const parseDevList = (output: string): ProcSpec[] => {
  const start = output.indexOf('[')

  if (start < 0) {
    return []
  }

  const parsed = JSON.parse(output.slice(start)) as { name?: string; command?: string; color?: string }[]

  return parsed
    .filter(entry => entry.name && entry.command)
    .map(entry => ({ label: entry.name ?? '', command: entry.command ?? '', color: entry.color ?? '' }))
}

export const spawnArgv = (command: string): string[] => [
  'perl',
  '-MPOSIX',
  '-e',
  'POSIX::setsid(); exec @ARGV',
  'sh',
  '-c',
  `echo ${PGID_MARK}$$; ${command}`,
]

export const afterCarriage = (line: string): string => line.split('\r').filter(Boolean).pop() ?? ''

export type ExitVerdict = {
  outcome: 'stopped' | 'exited' | 'start-failed' | 'gave-up' | 'restart'
  attempts: number
}

export const judgeExit = (exit: { wasStopped: boolean; code: number | null; ranFor: number; attempts: number }): ExitVerdict => {
  if (exit.wasStopped) {
    return { outcome: 'stopped', attempts: 0 }
  }

  if (exit.code === 0) {
    return { outcome: 'exited', attempts: 0 }
  }

  const attempts = (exit.ranFor >= STABLE_UPTIME_MS ? 0 : exit.attempts) + 1

  if (exit.ranFor < MIN_UPTIME_MS) {
    return { outcome: 'start-failed', attempts }
  }

  return { outcome: attempts > MAX_RESTARTS ? 'gave-up' : 'restart', attempts }
}

type Child = ReturnType<EngineInterface['process']['spawn']>

type Runner = ProcSpec & {
  run: Child | null
  pgid: number | null
  starting: boolean
  exiting: boolean
  stopping: boolean
  attempts: number
  timer: { cancel: () => void } | null
  done: Promise<void>
  finish: () => void
}

const runners = new Map<string, Runner>()
const lastToast: Record<string, number> = {}
let extraHosts: string[] = []
let project = { dir: '', name: '' }
let tick: { cancel: () => void } | null = null
let view = { columns: 80, labelWidth: 6 }

const newRunner = (spec: ProcSpec): Runner => ({
  ...spec,
  run: null,
  pgid: null,
  starting: false,
  exiting: false,
  stopping: false,
  attempts: 0,
  timer: null,
  done: Promise.resolve(),
  finish: () => {},
})

const isActive = (runner: Runner): boolean =>
  runner.run !== null || runner.timer !== null || runner.starting || runner.exiting

const anyActive = (): boolean => [...runners.values()].some(isActive)

const addsEntry = (event: DevEvent): boolean =>
  event.type !== 'start' && event.type !== 'pid' && (event.type !== 'output' || stripAnsi(event.text ?? '').trim() !== '')

async function observe($: EngineInterface, event: DevEvent, at: number) {
  if (event.type !== 'output' || event.quiet) {
    return
  }

  const label = event.label ?? ''
  const raw = event.text ?? ''
  const served = stripAnsi(raw).match(SERVER_LINE)

  if (served) {
    const before = await read($, detected)
    const port = toPort(served[1] ?? '')

    await update($, detected, () => port)

    if (before === null && port !== null) {
      $.ui.toast(`Server ready on :${port}`)
    }
  }

  const tunnelUrl = findTunnelUrl(raw, extraHosts)

  if (tunnelUrl) {
    const known = await read($, tunnel)

    if (known?.url !== tunnelUrl) {
      await update($, tunnel, () => ({ label, url: tunnelUrl }))
      $.ui.toast(`Tunnel ready: ${tunnelUrl} — press u to copy`, { timeoutMs: 8000 })
    }
  }

  if (ERROR_PATTERN.test(raw) && at - (lastToast[label] ?? 0) > TOAST_GAP_MS) {
    lastToast[label] = at
    $.ui.toast(`${label} — ${stripAnsi(raw).trim().slice(0, 80)}`, { timeoutMs: 6000 })
  }
}

async function emit($: EngineInterface, input: DevEvent | DevEvent[]) {
  const events = Array.isArray(input) ? input : [input]
  const time = new Date(await $.clock.now()).toISOString()
  const stamped = events.map((event): DevEvent => ({ ...event, time }))

  await update($, dev, current => stamped.reduce(applyEvent, current))

  const entries = stamped.filter(addsEntry)

  if (entries.length > 0) {
    const chosen = await read($, selected)
    const isFiltered = await read($, onlyErrors)
    const withName = chosen === null || chosen === ALL
    const added = entries
      .filter(
        event =>
          (withName || chosen === event.label) && (event.type !== 'output' || !isFiltered || isProblem(event.text ?? '')),
      )
      .reduce(
        (sum, event) =>
          sum + (event.type === 'output' ? countRows([{ label: event.label ?? '', text: event.text ?? '', at: 1 }], withName) : 1),
        0,
      )

    if (added > 0) {
      await update($, scrollBack, current => (current > 0 ? current + added : 0))
    }
  }

  for (const event of stamped) {
    await observe($, event, Date.parse(time))
  }
}

async function refreshRepo($: EngineInterface) {
  const top = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])
  const named = top.exitCode === 0 ? await $.process.run(['git', 'branch', '--show-current']) : null
  const detached = named && !named.stdout.trim() ? await $.process.run(['git', 'rev-parse', '--short', 'HEAD']) : null
  const next = named ? parseRepo(top.stdout, named.stdout, detached?.stdout ?? '') : null
  const last = await read($, repo)

  if (last?.branch !== next?.branch || last?.worktree !== next?.worktree) {
    await update($, repo, () => next)
  }
}

function ensureTick($: EngineInterface) {
  tick ??= $.clock.every(TICK_MS, async () => {
    await refreshRepo($)

    if (anyActive()) {
      const at = await $.clock.now()
      await update($, now, () => at)
    }
  })
}

async function basePort($: EngineInterface): Promise<number | null> {
  return (await read($, override)) ?? (await read($, configured))
}

async function readPorts($: EngineInterface) {
  return {
    override: await read($, override),
    configured: await read($, configured),
    detected: await read($, detected),
  }
}

async function loadConfigured($: EngineInterface) {
  const text = await $.fs.read(`${project.dir}/.env`).catch(() => '')
  await update($, configured, () => parseEnvPort(String(text)))
  await update($, appUrl, () => parseEnvValue(String(text), 'APP_URL') || null)
}

async function processEnv($: EngineInterface): Promise<Record<string, string>> {
  const port = await basePort($)
  const colour = { COLUMNS: '120', FORCE_COLOR: '3', CLICOLOR_FORCE: '1' }

  return port === null ? colour : { ...colour, SERVER_PORT: String(port) }
}

async function addNote($: EngineInterface, text: string) {
  await update($, dev, current => ({ ...current, notes: [...current.notes, text].slice(-50) }))
}

async function resetDetection($: EngineInterface) {
  await update($, detected, () => null)
  await update($, tunnel, () => null)
}

async function settle($: EngineInterface) {
  const active = anyActive()

  if (!active) {
    await resetDetection($)
  }

  await update($, dev, (current): Dev => ({
    ...current,
    status: active ? (current.status === 'stopping' ? 'stopping' : 'running') : 'stopped',
  }))
}

async function killGroup($: EngineInterface, pgid: number, graceMs = TERM_GRACE_MS) {
  await $.process.run(['kill', '-TERM', '--', `-${pgid}`])

  for (let waited = 0; waited < graceMs; waited += 100) {
    const alive = await $.process.run(['kill', '-0', '--', `-${pgid}`])

    if (alive.exitCode !== 0) {
      return
    }

    await $.clock.sleep(100)
  }

  await $.process.run(['kill', '-KILL', '--', `-${pgid}`])
}

function lineEvent(runner: Runner, raw: string): DevEvent {
  const line = afterCarriage(raw)
  const pgid = runner.pgid === null && line.startsWith(PGID_MARK) ? Number(line.slice(PGID_MARK.length)) : NaN

  if (Number.isInteger(pgid) && pgid > 1) {
    runner.pgid = pgid

    return { type: 'pid', label: runner.label, pid: pgid }
  }

  return { type: 'output', label: runner.label, text: line.slice(0, MAX_LINE), quiet: runner.stopping }
}

async function emitLines($: EngineInterface, runner: Runner, lines: string[]) {
  if (lines.length > 0) {
    await emit($, lines.map(line => lineEvent(runner, line)))
  }
}

async function resume($: EngineInterface, runner: Runner) {
  try {
    if (await startRunner($, runner)) {
      $.ui.toast(`${runner.label} is back up`)
    }
  } catch (error) {
    await addNote($, `${runner.label}: ${String(error)}`)
  }
}

async function pump($: EngineInterface, runner: Runner, run: Child, startedAt: number) {
  const rests = { stdout: '', stderr: '' }

  try {
    for await (const { stream, text } of run) {
      const split = splitLines(rests[stream], text)
      const overflow = split.rest.length > MAX_LINE

      rests[stream] = overflow ? '' : split.rest
      await emitLines($, runner, overflow ? [...split.lines, split.rest] : split.lines)
    }
  } catch (error) {
    await addNote($, `${runner.label}: ${String(error)}`)
  }

  await emitLines($, runner, Object.values(rests).filter(rest => rest.trim()))

  const result = await run.result.catch(() => ({ code: null, signal: null }))
  const ranFor = (await $.clock.now()) - startedAt
  const verdict = judgeExit({ wasStopped: runner.stopping, code: result.code, ranFor, attempts: runner.attempts })
  const how = result.code ?? result.signal ?? '?'

  runner.run = null
  runner.pgid = null
  runner.exiting = true
  runner.attempts = verdict.attempts
  await emit($, { type: 'exit', label: runner.label, code: result.code ?? undefined, signal: result.signal })

  if (verdict.outcome === 'exited') {
    $.ui.toast(`${runner.label} exited (${how})`)
  } else if (verdict.outcome === 'start-failed') {
    await emit($, { type: 'failed', label: runner.label, code: result.code ?? undefined })
    $.ui.toast(`${runner.label} failed to start (exit ${how}) — not retrying`, { timeoutMs: 10_000 })
  } else if (verdict.outcome === 'gave-up') {
    await emit($, { type: 'failed', label: runner.label, code: result.code ?? undefined })
    $.ui.toast(`${runner.label} keeps crashing (exit ${how}) — gave up after ${MAX_RESTARTS} restarts`, {
      timeoutMs: 10_000,
    })
  } else if (verdict.outcome === 'restart') {
    await emit($, { type: 'restarting', label: runner.label })
    $.ui.toast(`${runner.label} crashed (exit ${how}) — restarting ${verdict.attempts}/${MAX_RESTARTS}`, {
      timeoutMs: 6000,
    })

    if (runner.stopping) {
      await emit($, { type: 'exit', label: runner.label, signal: 'stopped' })
    } else {
      runner.timer = $.clock.after(RESTART_DELAY_MS, () => {
        runner.timer = null
        void resume($, runner)
      })
    }
  }

  runner.exiting = false
  runner.finish()
  await settle($)
}

async function startRunner($: EngineInterface, runner: Runner): Promise<boolean> {
  if (isActive(runner)) {
    return false
  }

  runner.starting = true
  runner.stopping = false
  runner.pgid = null
  runner.done = new Promise<void>(resolve => {
    runner.finish = resolve
  })

  try {
    const startedAt = await $.clock.now()
    const env = await processEnv($)

    if (runner.stopping) {
      runner.finish()

      return false
    }

    const run = $.process.spawn({ argv: spawnArgv(runner.command), cwd: project.dir, env })

    runner.run = run
    await emit($, { type: 'start', label: runner.label, command: runner.command, color: runner.color })
    await settle($)
    void pump($, runner, run, startedAt)

    return true
  } catch (error) {
    runner.finish()
    await addNote($, `${runner.label}: ${String(error)}`)

    return false
  } finally {
    runner.starting = false
  }
}

async function stopRunner($: EngineInterface, runner: Runner, graceMs = TERM_GRACE_MS) {
  const pending = runner.timer

  runner.stopping = true
  pending?.cancel()
  runner.timer = null

  const run = runner.run

  if (!run) {
    if (pending) {
      await emit($, { type: 'exit', label: runner.label, signal: 'stopped' })
    } else if (runner.starting || runner.exiting) {
      await runner.done
    }

    await settle($)

    return
  }

  for (let waited = 0; runner.run && runner.pgid === null && waited < 1000; waited += 50) {
    await $.clock.sleep(50)
  }

  if (runner.pgid) {
    await killGroup($, runner.pgid, graceMs)
  } else {
    void run.return({ code: null, signal: 'SIGTERM' })
  }

  await runner.done
}

async function releaseAll($: EngineInterface, graceMs: number) {
  await Promise.all(
    [...runners.values()].map(runner => {
      runner.stopping = true
      runner.timer?.cancel()
      runner.timer = null

      return runner.pgid ? killGroup($, runner.pgid, graceMs) : runner.run?.return({ code: null, signal: 'SIGTERM' })
    }),
  )
}

async function syncRunners($: EngineInterface): Promise<boolean> {
  const listed = await $.process.run(['php', 'artisan', 'dev:list', '--json'], { cwd: project.dir })

  if (listed.exitCode !== 0) {
    await addNote($, `dev:list failed: ${listed.stderr.trim().slice(0, 120)}`)

    return false
  }

  let specs: ProcSpec[] = []

  try {
    specs = parseDevList(listed.stdout)
  } catch (error) {
    await addNote($, `dev:list returned unreadable output: ${String(error)}`)

    return false
  }

  const names = new Set(specs.map(spec => spec.label))

  for (const spec of specs) {
    const existing = runners.get(spec.label)

    if (!existing) {
      runners.set(spec.label, newRunner(spec))
    } else if (!isActive(existing)) {
      existing.command = spec.command
      existing.color = spec.color
    }
  }

  for (const [name, runner] of runners) {
    if (!names.has(name) && !isActive(runner)) {
      runners.delete(name)
    }
  }

  return specs.length > 0
}

async function startAll($: EngineInterface): Promise<boolean> {
  if (!(await syncRunners($))) {
    $.ui.toast(`Couldn't list the dev processes: ${(await read($, dev)).notes.slice(-1)[0] ?? 'dev:list gave nothing'}`, { timeoutMs: 8000 })

    return false
  }

  await loadConfigured($)

  if (!anyActive()) {
    await resetDetection($)
  }

  ensureTick($)
  runners.forEach(runner => {
    runner.attempts = 0
  })
  $.ui.toast(`Starting ${runners.size} processes…`)
  await update($, dev, (current): Dev => ({ ...current, status: 'running' }))
  await Promise.all([...runners.values()].map(runner => startRunner($, runner)))

  return true
}

async function stopAll($: EngineInterface) {
  await update($, dev, (current): Dev => ({ ...current, status: 'stopping' }))
  await Promise.all([...runners.values()].map(runner => stopRunner($, runner)))
  await settle($)
}

export const clearedLog = (current: Dev): Dev => ({
  ...current,
  feed: [],
  notes: [],
  procs: current.procs.map(proc => ({ ...proc, lines: [], errors: 0 })),
})

async function stopAndClear($: EngineInterface) {
  await stopAll($)
  await update($, dev, current => clearedLog(current))
  await update($, scrollBack, () => 0)
  $.ui.toast('Stopped everything and cleared the log')
}

async function restartAll($: EngineInterface): Promise<boolean> {
  $.ui.toast('Restarting everything…')
  await stopAll($)

  return startAll($)
}

async function selectLog($: EngineInterface, label: string) {
  await update($, selected, () => label)
  await update($, scrollBack, () => 0)
}

async function selectedRunner($: EngineInterface): Promise<Runner | null> {
  const chosen = await read($, selected)

  return chosen ? (runners.get(chosen) ?? null) : null
}

async function restartOne($: EngineInterface, runner: Runner) {
  await stopRunner($, runner)
  runner.attempts = 0
  await startRunner($, runner)
  $.ui.toast(`Restarted ${runner.label}`)
}

async function restartSelected($: EngineInterface) {
  const runner = await selectedRunner($)

  if (!runner) {
    $.ui.toast('pick a process first (1–9)')

    return
  }

  await restartOne($, runner)
}

type CopySurface = Parameters<EngineInterface['ui']['copy']>[0]['surface']

async function copyText($: EngineInterface, text: string, surface: CopySurface | undefined, done: string): Promise<boolean> {
  const result = await $.ui.copy(surface ? { text, surface } : { text })

  if (result.isCopied) {
    $.ui.toast(done)

    return true
  }

  $.ui.toast(`Couldn't copy (${result.reason})`, { timeoutMs: 6000 })

  return false
}

async function copyLog($: EngineInterface, surface: CopySurface | undefined, forced: string | null = null): Promise<boolean> {
  const current = await read($, dev)
  const chosen = forced ?? (await read($, selected)) ?? ALL
  const pick = current.procs.some(proc => proc.label === chosen) ? chosen : ALL
  const isFiltered = await read($, onlyErrors)
  const entries = visibleEntries(current, pick, isFiltered)

  if (entries.length === 0) {
    $.ui.toast('Nothing to copy yet')

    return false
  }

  const from = pick === ALL ? 'all processes' : pick
  const done = `Copied ${entries.length} ${entries.length === 1 ? 'line' : 'lines'} from ${from}${isFiltered ? ' (errors only)' : ''}`

  return copyText($, logText(entries, pick === ALL), surface, done)
}

async function copyTunnel($: EngineInterface, surface: CopySurface | undefined): Promise<string | null> {
  const found = await read($, tunnel)

  if (!found) {
    $.ui.toast('No tunnel URL yet — it appears once the tunnel prints one', { timeoutMs: 6000 })

    return null
  }

  await copyText($, found.url, surface, `Copied ${found.url}`)

  return found.url
}

async function toggleErrors($: EngineInterface): Promise<boolean> {
  const next = !(await read($, onlyErrors))

  await update($, onlyErrors, () => next)
  await update($, scrollBack, () => 0)
  $.ui.toast(next ? 'Showing errors and warnings only' : 'Showing everything')

  return next
}

async function ownsGroup($: EngineInterface, pgid: number): Promise<boolean> {
  const listed = await $.process.run(['ps', '-o', 'command=', '-p', String(pgid)])

  return listed.exitCode === 0 && listed.stdout.includes(PGID_MARK)
}

async function reapStale($: EngineInterface) {
  const previous = await read($, dev)

  for (const proc of previous.procs) {
    if (proc.state !== 'exited' && proc.pid > 1 && (await ownsGroup($, proc.pid))) {
      await killGroup($, proc.pid)
    }
  }
}

async function openUrl($: EngineInterface, url: string) {
  await $.process.run(['open', url])
}

async function carryState($: EngineInterface) {
  return {
    dev: await read($, dev),
    selected: await read($, selected),
    override: await read($, override),
    configured: await read($, configured),
    appUrl: await read($, appUrl),
    detected: await read($, detected),
    tunnel: await read($, tunnel),
    onlyErrors: await read($, onlyErrors),
    repo: await read($, repo),
  }
}

async function restoreState($: EngineInterface, carried: Awaited<ReturnType<typeof carryState>>) {
  await update($, dev, () => carried.dev)
  await update($, selected, () => carried.selected)
  await update($, override, () => carried.override)
  await update($, configured, () => carried.configured)
  await update($, appUrl, () => carried.appUrl)
  await update($, detected, () => carried.detected)
  await update($, tunnel, () => carried.tunnel)
  await update($, onlyErrors, () => carried.onlyErrors)
  await update($, repo, () => carried.repo)
  await update($, isOpen, () => false)
  $.ui.status(undefined)
}

async function dropAttached($: EngineInterface) {
  await update($, attached, () => null)
  $.ui.status(undefined)
}

async function attachContext($: EngineInterface, forced: string | null = null): Promise<boolean> {
  const current = await read($, dev)

  if (current.procs.length === 0) {
    $.ui.toast('Nothing is running — start it first')

    return false
  }

  const chosen = await read($, selected)
  const label = forced ?? (chosen && chosen !== ALL ? chosen : null)
  const port = effectivePort(await readPorts($))
  const status = statusText(project.name, current, port, siteUrl(await read($, appUrl), port), await $.clock.now())

  await update($, attached, () => ({ label, text: promptText(project.name, current, label, status) }))
  $.ui.status(`${PLUGIN}: ${label ?? 'server state'} rides your next prompt (press asked ✓ to drop it)`)

  return true
}

async function toggleAttached($: EngineInterface) {
  if (await read($, attached)) {
    await dropAttached($)
    $.ui.toast('Dropped — nothing will ride your next prompt')

    return
  }

  await attachContext($)
}

export const noProcess = (target: string, names: string): string =>
  `No process "${target}". ${names ? `Known: ${names}.` : 'Nothing is running — run /dev first.'}`

async function runDev($: EngineInterface, args: DevArgs): Promise<string> {
  if (args.action === 'help') {
    return DEV_HELP
  }

  await loadConfigured($)

  const current = await read($, dev)
  const effective = effectivePort(await readPorts($))
  const url = siteUrl(await read($, appUrl), effective)

  if (args.action === 'status') {
    return statusText(project.name, current, effective, url, await $.clock.now())
  }

  if (args.action === 'site') {
    await openUrl($, url)

    return `Opening ${url}`
  }

  if (args.action === 'clear') {
    await update($, dev, snapshot => clearedLog(snapshot))
    await update($, scrollBack, () => 0)

    return 'Log cleared.'
  }

  if (args.action === 'errors') {
    return (await toggleErrors($)) ? 'Showing errors and warnings only.' : 'Showing everything.'
  }

  if (args.action === 'tunnel') {
    const copied = await copyTunnel($, undefined)

    return copied ? `Tunnel: ${copied} (copied)` : 'No tunnel URL yet.'
  }

  const names = current.procs.map(proc => proc.label).join(', ')
  const label = args.target ? matchProcess(current.procs, args.target) : null

  if (args.target && !label) {
    return noProcess(args.target, names)
  }

  if (args.action === 'copy') {
    return (await copyLog($, undefined, label)) ? 'Log copied.' : 'Nothing to copy yet.'
  }

  if (args.action === 'ask') {
    return (await attachContext($, label)) ? 'State and output will ride your next prompt.' : 'Nothing is running.'
  }

  const wasRunning = anyActive()

  if (args.action === 'stop') {
    if (!wasRunning) {
      return 'Nothing is running.'
    }

    await stopAndClear($)

    return 'Dev servers stopped.'
  }

  const runner = label ? runners.get(label) : undefined

  if (args.action === 'restart' && runner) {
    await restartOne($, runner)

    return `Restarted ${runner.label}.`
  }

  const previous = await basePort($)
  const requested = args.port

  if (requested !== undefined) {
    await update($, override, () => requested)
  }

  const port = await basePort($)
  const isRestart = args.action === 'restart' || (wasRunning && requested !== undefined && port !== previous)
  const onPort = ` on port ${port ?? DEFAULT_PORT}`

  if (!(isRestart ? await restartAll($) : await startAll($))) {
    return `Couldn't start the dev servers: ${(await read($, dev)).notes.slice(-1)[0] ?? 'dev:list gave nothing'}`
  }

  if (args.action === 'open') {
    await openPane($)
  }

  if (isRestart) {
    return `Restarting everything${onPort}.`
  }

  if (wasRunning) {
    return args.action === 'open' ? 'Dev pane opened.' : 'Already running.'
  }

  return `Dev servers starting${onPort}.`
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Dev', focus: true, closeOnEscape: true, rows: PANE_ROWS })
  await update($, isOpen, () => true)
}

async function togglePane($: EngineInterface) {
  const panes = await $.ui.panes()

  if (panes.some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })
    await update($, isOpen, () => false)

    return
  }

  await openPane($)
}

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export const colorFor = (index: number): string => PALETTE[index % PALETTE.length] ?? 'white'

export const timeOf = (at: number): string => new Date(at).toTimeString().slice(0, 8)

export const logRoom = (bodyRows: number, toolbarRows: number, procs: number, hasNotes: boolean): number => {
  const fixed = 8 + toolbarRows + procs + (hasNotes ? 1 : 0)

  return Math.max(4, bodyRows - fixed)
}

export const rule = (title: string, width: number): string => {
  const head = title ? `── ${title} ` : ''

  return head + '─'.repeat(Math.max(0, width - head.length))
}

export const buttonText = (label: string, hotkey: string): string => `${label} (${hotkey})`

export const gridRows = (count: number, cell: number, columns: number, gap = 1): number[][] => {
  if (count === 0) {
    return []
  }

  const fits = Math.max(1, Math.min(count, Math.floor((columns + gap) / (cell + gap))))
  const lines = Math.ceil(count / fits)
  const base = Math.floor(count / lines)
  const extra = count % lines
  const rows: number[][] = []
  let start = 0

  for (let line = 0; line < lines; line++) {
    const size = base + (line < extra ? 1 : 0)

    rows.push(Array.from({ length: size }, (_, offset) => start + offset))
    start += size
  }

  return rows
}

export const buttonGrid = (texts: string[], columns: number): number[][] =>
  gridRows(texts.length, Math.max(0, ...texts.map(text => text.length)) + 4, columns)

export const statusColor = (status: Dev['status'], up: number, total: number): string | undefined =>
  status === 'stopped' ? undefined : status === 'running' && up === total ? 'green' : 'yellow'

export const wrapText = (text: string, width: number): string[] =>
  wrapRanges(text, width).map(([from, to]) => text.slice(from, to))

export type EntryLayout = {
  ansi: boolean
  level: string | null
  message: string
  isError: boolean
  time: string
  name: string
  extra: number
  width: number
  count: number
}

export const layoutEntry = (entry: Entry, withName: boolean, labelWidth: number, columns: number): EntryLayout => {
  const time = entry.at > 0 ? `${timeOf(entry.at)} ` : ''
  const name = withName ? `${entry.label.padEnd(labelWidth)} ` : ''
  const ansi = hasAnsi(entry.text)
  const text = ansi
    ? parseAnsi(entry.text)
        .map(segment => segment.text)
        .join('')
    : entry.text.replace(TIMESTAMP_PATTERN, '')
  const badge = ansi ? null : text.match(BADGE_PATTERN)
  const level = badge?.[1] ?? null
  const message = badge ? (badge[2] ?? '') : text
  const extra = level ? level.length + 3 : 0
  const width = Math.max(12, columns - time.length - name.length - extra)

  return {
    ansi,
    level,
    message,
    isError: !badge && !ansi && ERROR_PATTERN.test(text),
    time,
    name,
    extra,
    width,
    count: wrapRanges(message, width).length,
  }
}

const countRows = (entries: Entry[], withName: boolean): number =>
  entries.reduce((sum, entry) => sum + layoutEntry(entry, withName, view.labelWidth, view.columns).count, 0)

function logRows(
  Box: Elements['Box'],
  Text: Elements['Text'],
  entry: Entry,
  color: string | null,
  labelWidth: number,
  columns: number,
  keyBase: string,
) {
  const layout = layoutEntry(entry, color !== null, labelWidth, columns)
  const indent = layout.time.length + layout.name.length + layout.extra
  const contents = layout.ansi
    ? wrapSegments(parseAnsi(entry.text), layout.width).map(segments => (
        <Box>
          {segments.map(segment => (
            <Text
              color={segment.style.color}
              backgroundColor={segment.style.background}
              bold={segment.style.bold}
              dimColor={segment.style.dim}
              italic={segment.style.italic}
              underline={segment.style.underline}
              strikethrough={segment.style.strike}
              inverse={segment.style.inverse}
            >
              {segment.text}
            </Text>
          ))}
        </Box>
      ))
    : wrapText(layout.message, layout.width).map(chunk => <Text color={layout.isError ? 'red' : undefined}>{chunk}</Text>)

  return contents.map((content, index) => (
    <Box key={`${keyBase}-${index}`}>
      <Box flexShrink={0}>
        {index === 0 ? (
          <Box>
            {layout.time ? <Text dimColor>{layout.time}</Text> : null}
            {color ? <Text color={color}>{layout.name}</Text> : null}
            {layout.level ? (
              <Box>
                <Text backgroundColor={BADGES[layout.level]} color="white" bold>{` ${layout.level} `}</Text>
                <Text> </Text>
              </Box>
            ) : null}
          </Box>
        ) : (
          <Text>{' '.repeat(indent)}</Text>
        )}
      </Box>
      {content}
    </Box>
  ))
}

export const register: Register = (on, options) => {
  extraHosts = parseHosts(String(options.tunnelHosts ?? ''))

  on('session.start', async ($, e, next) => {
    const dir = String(options.projectDir ?? '').trim() || (await $.session.cwd())

    project = { dir, name: dir.split('/').filter(Boolean).pop() ?? dir }
    await $.command.register({
      name: 'dev',
      description: `Manage ${project.name} \`php artisan dev\` in a pane`,
      argumentHint: '[start|stop|restart|status|site|ask|clear|errors|copy|tunnel|help] [--port=8111]',
    })
    await reapStale($)
    await update($, dev, () => emptyDev)
    await update($, isOpen, () => false)
    tick?.cancel()
    tick = null
    await dropAttached($)
    await refreshRepo($)
    ensureTick($)

    return next(e)
  })

  // /clear resets this plugin's state after session.end and fires no session.start, so the state is put back from a timer.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const carried = await carryState($)

      $.clock.after(RESEED_MS, () => {
        void restoreState($, carried)
      })

      return next(e)
    }

    tick?.cancel()
    tick = null
    await releaseAll($, Math.max(0, Math.min(TERM_GRACE_MS, next.budget.remainingMs - 500)))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const held = await read($, attached)

    if (!held) {
      return next(e)
    }

    await dropAttached($)

    return next({ ...e, context: [...(e.context ?? []), held.text] })
  })

  on('command.run', { command: 'dev' }, async ($, e) => {
    const parsed = parseDevArgs(e.args)

    if (parsed.error) {
      return { text: parsed.error }
    }

    return { text: await runDev($, parsed) }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)

    if (e.id === PANE) {
      await update($, isOpen, () => false)
    }

    return closed
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const other = await next(e)
    const current = await read($, dev)

    if (e.props.hasSurvey || (current.status === 'stopped' && current.procs.length === 0)) {
      return other
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const stack = <T extends RenderChildren>(band: T) => (other ? <Box flexDirection="column">{band}{other}</Box> : band)
    const open = await read($, isOpen)
    const { total, up, errors } = summarise(current)
    const color = statusColor(current.status, up, total)
    const port = effectivePort(await readPorts($))
    const base = await read($, appUrl)
    const where = await read($, repo)
    const detail = current.status === 'stopped' ? ' stopped' : ` · ${up}/${total} up`

    return stack(
      <Box>
        <Text color={color} dimColor={color === undefined}>●</Text>
        <Text bold>{' dev'}</Text>
        {current.status === 'stopped' ? null : (
          <Box marginLeft={1}>
            <Button
              key="dev-site"
              label={port ? `:${port} ↗` : '↗ site'}
              plain
              dimColor
              onPress={() => openUrl($, siteUrl(base, port))}
            />
          </Box>
        )}
        <Text dimColor>{detail}</Text>
        {errors > 0 ? <Text color="red">{` · ${errors} err`}</Text> : null}
        {where?.branch ? <Text dimColor>{` · ⎇ ${where.branch}`}</Text> : null}
        {where?.worktree ? <Text dimColor>{` · ⌂ ${where.worktree}`}</Text> : null}
        <Text>  </Text>
        <Button key="dev-toggle" label={open ? '−' : '+'} plain dimColor onPress={() => togglePane($)} />
      </Box>,
    )
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    if (e.element === undefined) {
      return next(e)
    }

    if (!e.element.startsWith('log-')) {
      return { deny: 'arrows walk the process names only' }
    }

    const label = e.element.slice('log-'.length)
    await selectLog($, label)

    return next(e)
  })


  on('ui.scroll', { requestId: PANE }, async ($, e) => {
    const current = await read($, dev)
    const chosen = (await read($, selected)) ?? ALL
    const total = countRows(visibleEntries(current, chosen, await read($, onlyErrors)), chosen === ALL)

    await update($, scrollBack, offset => nextBack(offset, e.by, total))

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, dev)
    const at = await read($, now)
    const chosen = (await read($, selected)) ?? ALL
    const pick = chosen === ALL || current.procs.some(proc => proc.label === chosen) ? chosen : ALL
    const running = current.status !== 'stopped'
    const ports = await readPorts($)
    const port = effectivePort(ports)
    const siteBase = await read($, appUrl)
    const columns = Math.max(24, e.props.bodyColumns - 2)
    const labelWidth = Math.max(6, ...current.procs.map(proc => proc.label.length))
    const { total, up, errors } = summarise(current)
    const dotColor = statusColor(current.status, up, total)
    const colors = Object.fromEntries(
      current.procs.map((proc, index) => [proc.label, proc.color || colorFor(index)]),
    )
    const isFiltered = await read($, onlyErrors)
    const found = await read($, tunnel)
    const isAttached = (await read($, attached)) !== null
    const entries = visibleEntries(current, pick, isFiltered)
    const filterLabel = isFiltered ? 'Errors only ✓' : 'Errors only'

    type Action = { key: string; hotkey: string; label: string; run: (surface?: CopySurface) => unknown }

    const actions: Action[] = [
      running
        ? { key: 'stop', hotkey: 'x', label: 'Stop all', run: () => stopAndClear($) }
        : { key: 'start', hotkey: 's', label: 'Start all', run: () => startAll($) },
      { key: 'restart', hotkey: 'r', label: 'Restart all', run: () => restartAll($) },
      { key: 'restart-one', hotkey: 't', label: 'Restart one', run: () => restartSelected($) },
      { key: 'site', hotkey: 'o', label: 'Open site', run: () => openUrl($, siteUrl(siteBase, port)) },
      ...(found ? [{ key: 'copy-tunnel', hotkey: 'u', label: 'Copy tunnel', run: (surface?: CopySurface) => copyTunnel($, surface) }] : []),
      { key: 'copy-log', hotkey: 'c', label: 'Copy log', run: surface => copyLog($, surface) },
      { key: 'ask', hotkey: 'a', label: isAttached ? 'asked ✓' : 'Ask Claude', run: () => toggleAttached($) },
    ]
    const buttonLabels = actions.map(action => buttonText(action.label, action.hotkey))
    const toolbar = buttonGrid(buttonLabels, columns)
    const bodyRows = e.props.scroll.bodyRows > 0 ? e.props.scroll.bodyRows : PANE_ROWS
    const room = logRoom(bodyRows, toolbar.length, current.procs.length, current.notes.length > 0)
    const withName = pick === ALL
    const counts = entries.map(entry => layoutEntry(entry, withName, labelWidth, columns).count)
    const totalRows = counts.reduce((sum, count) => sum + count, 0)
    const scrolled = Math.min(await read($, scrollBack), Math.max(0, totalRows - 1))
    const picked: number[] = []
    let gathered = 0

    for (let index = entries.length - 1; index >= 0 && gathered < scrolled + room; index--) {
      picked.unshift(index)
      gathered += counts[index] ?? 1
    }

    view = { columns, labelWidth }

    return (
      <Box flexDirection="column">
        <Box width={columns} justifyContent="space-between">
          <Box>
            <Text color={dotColor} dimColor={dotColor === undefined}>●</Text>
            <Text bold>{` ${project.name}`}</Text>
            <Text dimColor>{port ? `  :${port}` : ''}</Text>
            {ports.override !== null ? <Text dimColor>{' (override)'}</Text> : null}
          </Box>
          <Box>
            {errors > 0 ? <Text color="red">{`⚠ ${errors}  `}</Text> : null}
            <Text dimColor>{current.status === 'stopped' ? 'stopped' : current.status === 'stopping' ? 'stopping…' : `${up}/${total} up`}</Text>
          </Box>
        </Box>
        <Text dimColor>{rule('', columns)}</Text>
        {toolbar.map((row, line) => (
          <Box key={`toolbar-${line}`}>
            {row.map((index, position) => {
              const action = actions[index]

              return action ? (
                <Box key={action.key} marginLeft={position > 0 ? 1 : 0}>
                  <Button
                    key={action.key}
                    label={buttonLabels[index] ?? action.label}
                    hotkey={action.hotkey}
                    variant={action.key === 'stop' || action.key === 'start' ? 'primary' : undefined}
                    onPress={press => action.run(press.surface)}
                  />
                </Box>
              ) : null
            })}
          </Box>
        ))}
        <Text> </Text>
        <Text dimColor>{rule('Processes', columns)}</Text>
        {current.procs.length === 0 ? (
          <Text dimColor>{running ? '  Starting…' : '  Not running — press s to start everything.'}</Text>
        ) : (
          <Box>
            <Text bold={pick === ALL}>{pick === ALL ? '▸ ' : '  '}</Text>
            <Button key={`log-${ALL}`} label="All" hotkey="0" plain autoFocus onPress={() => selectLog($, ALL)} />
          </Box>
        )}
        {current.procs.map((proc, index) => {
          const isPicked = proc.label === pick
          const stateColor = proc.state === 'up' ? 'green' : proc.state === 'restarting' ? 'yellow' : undefined

          return (
            <Box key={`proc-${proc.label}`}>
              <Text color={proc.color || colorFor(index)} bold>{isPicked ? '▸ ' : '  '}</Text>
              <Button
                key={`log-${proc.label}`}
                label={proc.label.padEnd(labelWidth)}
                hotkey={index < 9 ? String(index + 1) : undefined}
                plain
                onPress={() => selectLog($, proc.label)}
              />
              <Text color={stateColor} dimColor={stateColor === undefined}>{proc.state === 'up' ? '  ●' : '  ○'}</Text>
              <Text color={stateColor} dimColor={stateColor === undefined}>{` ${proc.state.padEnd(10)}`}</Text>
              <Text dimColor>{(proc.state === 'up' ? uptime(proc.startedAt, at) : '').padEnd(6)}</Text>
              {proc.errors > 0 ? <Text color="red">{`⚠${proc.errors}`}</Text> : null}
            </Box>
          )
        })}
        <Text> </Text>
        <Box width={columns}>
          <Text dimColor>{rule(`Log · ${pick === ALL ? 'all' : pick}${scrolled > 0 ? `  ↑ ${scrolled} older · End to follow` : ''}`, Math.max(8, columns - filterLabel.length - 4))}</Text>
          <Box marginLeft={1}>
            <Button key="errors" label={filterLabel} hotkey="e" plain dimColor={!isFiltered} onPress={() => toggleErrors($)} />
          </Box>
        </Box>
        {picked.length === 0 && current.procs.length > 0 ? (
          <Text dimColor>{isFiltered ? '  No errors or warnings.' : '  No output yet.'}</Text>
        ) : null}
        {picked
          .flatMap(index =>
            logRows(Box, Text, entries[index] as Entry, withName ? (colors[entries[index]?.label ?? ''] ?? null) : null, labelWidth, columns, `row-${index}`),
          )
          .slice(Math.max(0, gathered - scrolled - room), Math.max(0, gathered - scrolled))}
        {current.notes.length > 0 ? <Text dimColor>{`launcher: ${current.notes[current.notes.length - 1]}`}</Text> : null}
      </Box>
    )
  })
}
