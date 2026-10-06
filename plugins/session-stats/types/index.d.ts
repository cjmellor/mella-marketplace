export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  model: string
  percent: number | null
  tokens: number | null
  window: number
  limits: Limit[]
  usd: number | null
}
export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turnMs: number
  byModel: Record<string, number>
}
export type Category ={ name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }

declare module 'claude-code' {
  interface PluginState {
    'session-stats': {
      snapshot: Snapshot | null
      breakdown: Category[]
      isOpen: boolean
      now: number
      totals: Totals
      effort: string | number | null
      location: string | null
    }
  }
}
