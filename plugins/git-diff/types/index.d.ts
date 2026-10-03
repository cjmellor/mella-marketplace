export type FileStat = { path: string; added: number; removed: number }
export type DiffStat = { files: number; added: number; removed: number; rows: FileStat[] }
export type ViewMode = 'list' | 'tree'

declare module 'claude-code' {
  interface PluginState {
    'git-diff': { stat: DiffStat | null; view: ViewMode; isOpen: boolean }
  }
}
