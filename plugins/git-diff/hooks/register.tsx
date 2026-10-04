import type { EngineInterface, Register, RenderChildren } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { DiffStat, FileStat, ViewMode } from '../types'

type Entry = { label: string; depth: number; isDir: boolean; added: number; removed: number }
type Node = { name: string; children: Map<string, Node>; file?: FileStat }

const stat = atom({ plugin: 'git-diff', key: 'stat' } as const, null)
const view = atom({ plugin: 'git-diff', key: 'view' } as const, 'list' as ViewMode)
const isOpen = atom({ plugin: 'git-diff', key: 'isOpen' } as const, false)
const branch = atom({ plugin: 'git-diff', key: 'branch' } as const, null)

const RIGHT_GUTTER = 4

const BAR_CELLS = 5
const PANE = 'changes'
const UNTRACKED_LIMIT = 100
const MAX_PANE_ROWS = 30

export const parseNumstat = (output: string): DiffStat => {
  const rows: FileStat[] = output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [added, removed, ...path] = line.split('\t')

      return { path: path.join('\t'), added: Number(added) || 0, removed: Number(removed) || 0 }
    })
    .sort((a, b) => b.added + b.removed - (a.added + a.removed))

  return {
    files: rows.length,
    added: rows.reduce((sum, row) => sum + row.added, 0),
    removed: rows.reduce((sum, row) => sum + row.removed, 0),
    rows,
  }
}

export const barCells = (
  { added, removed }: { added: number; removed: number },
  cells = BAR_CELLS,
): { green: number; red: number; grey: number } => {
  const total = added + removed
  const green = total === 0 ? 0 : Math.round((added / total) * cells)
  const red = total === 0 ? 0 : cells - green

  return { green, red, grey: cells - green - red }
}

const totals = (node: Node): { added: number; removed: number } => {
  if (node.file) {
    return { added: node.file.added, removed: node.file.removed }
  }

  return [...node.children.values()].reduce(
    (sum, child) => {
      const part = totals(child)

      return { added: sum.added + part.added, removed: sum.removed + part.removed }
    },
    { added: 0, removed: 0 },
  )
}

const flatten = (node: Node, depth: number): Entry[] =>
  [...node.children.values()]
    .sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name))
    .flatMap(child => {
      let merged = child
      let label = child.name

      while (!merged.file && merged.children.size === 1) {
        const only = [...merged.children.values()][0]

        if (only.file) {
          break
        }

        merged = only
        label = `${label}/${only.name}`
      }

      const entry: Entry = {
        label: merged.file ? label : `${label}/`,
        depth,
        isDir: !merged.file,
        ...totals(merged),
      }

      return [entry, ...flatten(merged, depth + 1)]
    })

export const entries = (rows: FileStat[], mode: ViewMode): Entry[] => {
  if (mode === 'list') {
    return rows.map(row => ({ label: row.path, depth: 0, isDir: false, added: row.added, removed: row.removed }))
  }

  const root: Node = { name: '', children: new Map() }

  for (const row of rows) {
    const parts = row.path.split('/')
    let node = root

    parts.forEach((part, index) => {
      const next = node.children.get(part) ?? { name: part, children: new Map<string, Node>() }
      node.children.set(part, next)
      node = next

      if (index === parts.length - 1) {
        node.file = row
      }
    })
  }

  return flatten(root, 0)
}

async function untrackedNumstat($: EngineInterface): Promise<string> {
  const { stdout } = await $.process.run(['git', 'ls-files', '--others', '--exclude-standard'])
  const files = stdout.split('\n').filter(Boolean).slice(0, UNTRACKED_LIMIT)

  const lines = await Promise.all(
    files.map(async file => {
      const { stdout: counted } = await $.process.run(['git', 'diff', '--no-index', '--numstat', '--', '/dev/null', file])
      const [added] = counted.split('\t')

      return `${Number(added) || 0}\t0\t${file}`
    }),
  )

  return lines.join('\n')
}

export const barSquares = (
  counts: { added: number; removed: number },
  cells = BAR_CELLS,
): ('green' | 'red' | 'grey')[] => {
  const { green, red, grey } = barCells(counts, cells)

  return [...Array(green).fill('green'), ...Array(red).fill('red'), ...Array(grey).fill('grey')]
}

async function currentBranch($: EngineInterface): Promise<string | null> {
  const named = await $.process.run(['git', 'branch', '--show-current'])
  const name = named.stdout.trim()

  if (name) {
    return name
  }

  const detached = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'])

  return detached.exitCode === 0 ? detached.stdout.trim() : null
}

async function refresh($: EngineInterface) {
  const name = await currentBranch($)
  await update($, branch, () => name)
  const tracked = await $.process.run(['git', 'diff', 'HEAD', '--numstat'])
  const untracked = tracked.exitCode === 0 ? await untrackedNumstat($) : ''
  await update($, stat, () => (tracked.exitCode === 0 ? parseNumstat(`${tracked.stdout}\n${untracked}`) : null))
}

async function openPane($: EngineInterface) {
  await refresh($)
  const current = await read($, stat)
  const lines = current === null ? 1 : entries(current.rows, 'tree').length
  await $.ui.open({ id: PANE, title: 'Changes', focus: true, closeOnEscape: true, rows: Math.min(lines + 2, MAX_PANE_ROWS) })
  await update($, isOpen, () => true)
}

async function togglePane($: EngineInterface) {
  if (await read($, isOpen)) {
    await $.ui.close({ id: PANE })
    await update($, isOpen, () => false)

    return
  }

  await openPane($)
}

const RESEED_MS = 500

async function seed($: EngineInterface) {
  await update($, isOpen, () => false)
  await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git-diff', description: 'Show uncommitted changes per file in a pane' })
    await seed($)

    return next(e)
  })

  // /clear resets this plugin's state after session.end and fires no session.start, so setup reruns from a timer.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      $.clock.after(RESEED_MS, () => {
        void seed($)
      })
    }

    return next(e)
  })

  on('command.run', { command: 'git-diff' }, async $ => {
    await openPane($)

    return { text: 'Changes pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)

    if (e.id === PANE) {
      await update($, isOpen, () => false)
    }

    return closed
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await refresh($)

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    await refresh($)

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const other = await next(e)
    const current = await read($, stat)

    if (e.props.hasSurvey) {
      return other
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const name = await read($, branch)
    const stack = <T extends RenderChildren>(band: T) => (other ? <Box flexDirection="column">{band}{other}</Box> : band)

    if (current === null || current.files === 0) {
      return name ? stack(
        <Box width={e.props.bodyColumns - RIGHT_GUTTER} justifyContent="flex-end">
          <Text dimColor>{` ${name}`}</Text>
        </Box>,
      ) : other
    }

    const squares = barSquares(current)
    const paneIsOpen = await read($, isOpen)

    const band = (
      <Box width={e.props.bodyColumns - RIGHT_GUTTER} justifyContent="space-between">
        <Box>
          <Text dimColor>{`± ${current.files} ${current.files === 1 ? 'file' : 'files'}  `}</Text>
          <Text color="green" bold>+{current.added}</Text>
          <Text> </Text>
          <Text color="red" bold>−{current.removed}</Text>
          <Text>  </Text>
          {squares.map(color => (
            <Text color={color === 'grey' ? undefined : color} dimColor={color === 'grey'}>◼</Text>
          ))}
          <Text>  </Text>
          <Button
            key="toggle"
            label={paneIsOpen ? '−' : '+'}
            plain
            dimColor
            onPress={() => togglePane($)}
          />
        </Box>
        {name && <Text dimColor>{` ${name}`}</Text>}
      </Box>
    )

    return stack(band)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, stat)
    const mode = await read($, view)

    if (current === null || current.files === 0) {
      return <Text dimColor>No uncommitted changes.</Text>
    }

    const shown = entries(current.rows, mode)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)
    const addedWidth = Math.max(...shown.map(entry => `+${entry.added}`.length))
    const removedWidth = Math.max(...shown.map(entry => `−${entry.removed}`.length))

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{current.files} {current.files === 1 ? 'file' : 'files'}  </Text>
          <Text color="green" bold>+{current.added}</Text>
          <Text> </Text>
          <Text color="red" bold>−{current.removed}</Text>
          <Text>   </Text>
          <Button
            key="view"
            label={mode === 'list' ? 'View: List (t)' : 'View: Tree (t)'}
            hotkey="t"
            onPress={() => update($, view, current => (current === 'list' ? 'tree' : 'list'))}
          />
        </Box>
        <Text> </Text>
        {shown.slice(0, room).map(entry => {
          const squares = barSquares(entry)

          return (
            <Box>
              <Text color="green">{`+${entry.added}`.padStart(addedWidth)} </Text>
              <Text color="red">{`−${entry.removed}`.padStart(removedWidth)}  </Text>
              {squares.map(color => (
                <Text color={color === 'grey' ? undefined : color} dimColor={color === 'grey'}>◼</Text>
              ))}
              <Text> </Text>
              <Text color="gray" dimColor>{'│ '.repeat(entry.depth)}</Text>
              <Text bold={entry.isDir}>{entry.label}</Text>
            </Box>
          )
        })}
        {shown.length > room && <Text dimColor>…and {shown.length - room} more</Text>}
      </Box>
    )
  })
}
