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
      attached: { label: string | null; text: string } | null
      layout: Layout | null
    }
  }
}
