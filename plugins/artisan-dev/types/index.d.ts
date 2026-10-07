export type ProcState = 'up' | 'restarting' | 'exited'

export type Proc = {
  label: string
  command: string
  color: string
  pid: number
  state: ProcState
  startedAt: number
  errors: number
  lines: string[]
}

export type Entry = { label: string; text: string; at: number }

export type Dev = {
  status: 'stopped' | 'running' | 'stopping'
  procs: Proc[]
  feed: Entry[]
  notes: string[]
}

export type DevEventType = 'start' | 'pid' | 'output' | 'exit' | 'failed' | 'restarting'

export type DevEvent = {
  type: DevEventType
  label?: string
  command?: string
  color?: string
  pid?: number
  text?: string
  code?: number
  signal?: string | null
  quiet?: boolean
  time?: string
}


export type Layout = { branch: string; worktrees: string[] }

export type ShareState = 'starting' | 'checking' | 'open' | 'broken' | 'failed'

export type LeftoverKind = 'local-host' | 'plain-http' | 'vite' | 'broken'

export type Leftover = { kind: LeftoverKind; url: string }

export type Share = {
  state: ShareState
  dir: string
  port: number | null
  url: string | null
  leftovers: Leftover[]
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'artisan-dev': {
      dev: Dev
      selected: string | null
      now: number
      isOpen: boolean
      override: number | null
      configured: number | null
      appUrl: string | null
      detected: number | null
      back: number
      onlyErrors: boolean
      tunnel: { label: string; url: string } | null
      share: Share | null
      attached: { label: string | null; text: string } | null
      layout: Layout | null
    }
  }
}
