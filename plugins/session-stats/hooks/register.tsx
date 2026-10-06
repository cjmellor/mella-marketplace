import type { EngineInterface, Register, SessionUsage, TurnUsage } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Category, Location, Snapshot, Totals } from '../types'

const emptyTotals: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turnMs: 0, byModel: {} }

const snapshot = atom({ plugin: 'session-stats', key: 'snapshot' } as const, null)
const breakdown = atom({ plugin: 'session-stats', key: 'breakdown' } as const, [] as Category[])
const isOpen = atom({ plugin: 'session-stats', key: 'isOpen' } as const, false)
const now = atom({ plugin: 'session-stats', key: 'now' } as const, 0)
const totals = atom({ plugin: 'session-stats', key: 'totals' } as const, emptyTotals)
const effort = atom({ plugin: 'session-stats', key: 'effort' } as const, null)
const location = atom({ plugin: 'session-stats', key: 'location' } as const, null)

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const EFFORT_ICONS: Record<(typeof EFFORT_LEVELS)[number], string> = { low: '○', medium: '◐', high: '●', xhigh: '◉', max: '◈' }

export const effortIcon = (level: string | number | null): string =>
  level === null ? '' : (EFFORT_ICONS[String(level) as keyof typeof EFFORT_ICONS] ?? String(level))

export const parseEffort = (args: string): string | null => {
  const level = args.trim().toLowerCase()

  return (EFFORT_LEVELS as readonly string[]).includes(level) ? level : null
}

const BAR_CELLS = 5
const PANE_BAR_CELLS = 20
const PANE = 'usage'
const MAX_PANE_ROWS = 30
const TICK_MS = 60_000
const LOCATION_OVERHEAD = 4
const BAND_RESERVE = 2

type Level = 'green' | 'yellow' | 'red'

let ticker: { cancel: () => void } | undefined
export const prettyModel = (id: string): string => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id)

  if (!match) {
    return id
  }

  const [, family = '', major, minor] = match

  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${minor ? `${major}.${minor}` : major}`
}

export const levelColor = (percent: number): Level => (percent >= 85 ? 'red' : percent >= 60 ? 'yellow' : 'green')

const capitalise = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const windowModel = (kind: string): string | undefined => /^seven_day_(.+)$/.exec(kind)?.[1]

export const limitLabel = (kind: string): string => {
  const model = windowModel(kind)

  return model ? `W ${capitalise(model)}` : ({ five_hour: '5h', seven_day: 'W', spend_limit: 'Spend' })[kind] ?? kind
}

export const limitTitle = (kind: string): string => {
  const model = windowModel(kind)

  return model
    ? `Weekly · ${capitalise(model)}`
    : ({ five_hour: 'Session limit', seven_day: 'Weekly · all models', spend_limit: 'Spend limit' })[kind] ?? kind
}

export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

export const addTurn = (current: Totals, usage: TurnUsage, durationMs: number): Totals => ({
  input: current.input + usage.input_tokens,
  output: current.output + usage.output_tokens,
  cacheRead: current.cacheRead + usage.cache_read_input_tokens,
  cacheWrite: current.cacheWrite + usage.cache_creation_input_tokens,
  turnMs: current.turnMs + durationMs,
  byModel: {
    ...current.byModel,
    [usage.model]:
      (current.byModel[usage.model] ?? 0) +
      usage.input_tokens +
      usage.output_tokens +
      usage.cache_read_input_tokens +
      usage.cache_creation_input_tokens,
  },
})

export const cacheHit = (current: Totals): number | null => {
  const prompt = current.input + current.cacheRead + current.cacheWrite

  return prompt === 0 ? null : Math.round((current.cacheRead / prompt) * 100)
}

export const modelShares = (current: Totals): { model: string; percent: number }[] => {
  const sum = Object.values(current.byModel).reduce((acc, tokens) => acc + tokens, 0)

  return Object.entries(current.byModel)
    .map(([model, tokens]) => ({ model, percent: sum === 0 ? 0 : Math.round((tokens / sum) * 100) }))
    .filter(share => share.percent > 0)
    .sort((a, b) => b.percent - a.percent)
}

export const fillCells = (percent: number, cells = BAR_CELLS): number =>
  Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))

export const countdown = (resetsAt: string | undefined, at: number): string => {
  const minutes = Math.ceil((Date.parse(resetsAt ?? '') - at) / 60_000)

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return ''
  }

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }

  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export const tokensLabel = (tokens: number): string =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`

export const toSnapshot = (model: string, usage: SessionUsage): Snapshot => ({
  model,
  percent: usage.context.percent ?? null,
  tokens: usage.context.tokens ?? null,
  window: usage.context.window,
  limits: usage.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  usd: usage.cost?.usd ?? null,
})

export const parseLocation = (revParse: string, branch: string, head: string): Location | null => {
  const [toplevel, gitDir, commonDir] = revParse.split('\n').map(line => line.trim())

  if (!toplevel || !gitDir || !commonDir) {
    return null
  }

  return {
    branch: branch.trim() || head.trim() || null,
    worktree: gitDir === commonDir ? null : (toplevel.split('/').filter(Boolean).pop() ?? null),
  }
}

export const fitLocation = (where: Location | null, room: number): { branch: string; worktree: string } => {
  const names = [where?.branch ?? '', where?.worktree ?? '']
  const order = names.flatMap((name, slot) => (name ? [{ name, slot }] : [])).sort((a, b) => a.name.length - b.name.length)
  const shown = ['', '']
  let left = room - order.length * LOCATION_OVERHEAD

  if (left < order.length) {
    return { branch: '', worktree: '' }
  }

  order.forEach(({ name, slot }, done) => {
    const cap = Math.floor(left / (order.length - done))
    const text = name.length > cap ? `${name.slice(0, cap - 1)}…` : name

    shown[slot] = text
    left -= text.length
  })

  return { branch: shown[0] ?? '', worktree: shown[1] ?? '' }
}

export const bandColumns = (current: Snapshot, icon: string, at: number): number => {
  const percent = current.percent === null ? '–' : `${current.percent}%`
  const limits = current.limits.reduce((sum, limit) => {
    const left = countdown(limit.resetsAt, at)

    return sum + 2 + limitLabel(limit.kind).length + 1 + `${Math.round(limit.percentUsed)}%`.length + (left ? left.length + 3 : 0)
  }, 0)

  return prettyModel(current.model).length + (icon ? icon.length + 1 : 0) + 2 + BAR_CELLS + 1 + percent.length + limits + 3
}

async function readLocation($: EngineInterface): Promise<Location | null> {
  const top = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])

  if (top.exitCode !== 0) {
    return null
  }

  const named = await $.process.run(['git', 'branch', '--show-current'])
  const detached = named.exitCode === 0 && !named.stdout.trim() ? await $.process.run(['git', 'rev-parse', '--short', 'HEAD']) : null

  return parseLocation(top.stdout, named.exitCode === 0 ? named.stdout : '', detached?.stdout ?? '')
}

async function refreshLocation($: EngineInterface) {
  const next = await readLocation($).catch(() => null)
  const last = await read($, location)

  if (last?.branch !== next?.branch || last?.worktree !== next?.worktree) {
    await update($, location, () => next)
  }
}

async function refresh($: EngineInterface) {
  const usage = await $.session.usage()
  const model = await $.session.model()
  await update($, snapshot, () => toSnapshot(model, usage))
  await update($, now, () => Date.now())
}

async function tick($: EngineInterface) {
  await update($, now, () => Date.now())
}

async function loadBreakdown($: EngineInterface) {
  await refresh($)
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const categories = (context.breakdown?.categories ?? []).map(({ name, tokens, kind }) => ({ name, tokens, kind }))
  await update($, breakdown, () => categories)
}

async function openPane($: EngineInterface) {
  await loadBreakdown($)
  const current = await read($, snapshot)
  const lines = (await read($, breakdown)).length + (current?.limits.length ?? 0) + 20
  await $.ui.open({ id: PANE, title: 'Usage', focus: true, closeOnEscape: true, rows: Math.min(lines, MAX_PANE_ROWS) })
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

type TextElement = ReturnType<EngineInterface['ui']['resolve']>['Text']

function squares(Text: TextElement, percent: number | null, cells: number) {
  const filled = percent === null ? 0 : fillCells(percent, cells)
  const color = percent === null ? undefined : levelColor(percent)

  return [...Array(cells).keys()].map(index => (
    <Text color={index < filled ? color : undefined} dimColor={index >= filled}>◼</Text>
  ))
}

const RESEED_MS = 500

async function seed($: EngineInterface) {
  await update($, isOpen, () => false)
  await refresh($)
  await refreshLocation($)
  ticker?.cancel()
  ticker = await $.clock.every(TICK_MS, () => tick($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await seed($)
    await $.command
      .register({ name: 'session-stats', description: 'Show model, effort and usage in a pane' })
      .catch(() => undefined)

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

  on('command.run', { command: 'session-stats' }, async $ => {
    await openPane($)

    return { text: 'Session stats pane opened.' }
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = parseEffort(e.args)

    if (level) {
      await update($, effort, () => level)
    }

    return result
  })

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const before = (await read($, snapshot))?.model
    const result = await next(e)
    await refresh($).catch(() => undefined)

    if ((await read($, snapshot))?.model !== before) {
      await update($, effort, () => null)
    }

    return result
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)

    if (e.id === PANE) {
      await update($, isOpen, () => false)
    }

    return closed
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, effort, () => e.effort ?? null)
    }

    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      const usage = e.usage
      await update($, totals, current => addTurn(current, usage, e.durationMs))
    }

    await refresh($)
    await refreshLocation($)

    return next(e)
  })

  on('tool.call', { tool: ['EnterWorktree', 'ExitWorktree'] }, async ($, e, next) => {
    const result = await next(e)

    $.clock.after(0, () => {
      void refreshLocation($).catch(() => undefined)
    })

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const other = await next(e)
    const current = await read($, snapshot)

    if (e.props.hasSurvey || current === null) {
      return other
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const at = await read($, now)
    const paneIsOpen = await read($, isOpen)
    const icon = effortIcon(await read($, effort))
    const shown = fitLocation(await read($, location), e.props.bodyColumns - bandColumns(current, icon, at) - BAND_RESERVE)

    const band = (
      <Box>
        <Text bold>{prettyModel(current.model)}</Text>
        {icon && <Text>{` ${icon}`}</Text>}
        <Text>  </Text>
        {squares(Text, current.percent, BAR_CELLS)}
        <Text color={current.percent === null ? undefined : levelColor(current.percent)} dimColor={current.percent === null}>
          {` ${current.percent === null ? '–' : `${current.percent}%`}`}
        </Text>
        {current.limits.map(limit => {
          const left = countdown(limit.resetsAt, at)

          return (
            <Box>
              <Text dimColor>  {limitLabel(limit.kind)} </Text>
              <Text color={levelColor(limit.percentUsed)}>{Math.round(limit.percentUsed)}%</Text>
              {left && <Text dimColor> ({left})</Text>}
            </Box>
          )
        })}
        {shown.branch ? <Text dimColor>{`  ⎇ ${shown.branch}`}</Text> : null}
        {shown.worktree ? <Text dimColor>{` @ ${shown.worktree}`}</Text> : null}
        <Text>  </Text>
        <Button key="toggle" label={paneIsOpen ? '−' : '+'} plain dimColor onPress={() => togglePane($)} />
      </Box>
    )

    return other ? (
      <Box flexDirection="column">
        {band}
        {other}
      </Box>
    ) : (
      band
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, snapshot)
    const categories = await read($, breakdown)
    const spent = await read($, totals)
    const at = await read($, now)
    const level = await read($, effort)

    if (current === null) {
      return <Text dimColor>No usage reading yet.</Text>
    }

    const shown = categories
      .filter(category => category.kind !== 'deferred')
      .sort((a, b) => Number(a.kind !== 'used') - Number(b.kind !== 'used') || b.tokens - a.tokens)
    const nameWidth = Math.max(0, ...shown.map(category => category.name.length))
    const tokenWidth = Math.max(0, ...shown.map(category => tokensLabel(category.tokens).length))
    const hit = cacheHit(spent)
    const shares = modelShares(spent)
    const titleWidth = Math.max(8, ...current.limits.map(limit => limitTitle(limit.kind).length)) + 2
    const tokenRows: [string, number][] = [
      ['Input', spent.input],
      ['Output', spent.output],
      ['Cache read', spent.cacheRead],
      ['Cache write', spent.cacheWrite],
    ]

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>Usage  </Text>
          <Text dimColor>{prettyModel(current.model)}  </Text>
          {level !== null && <Text>{`${effortIcon(level)} ${level}  `}</Text>}
          <Button key="refresh" label="Refresh (r)" hotkey="r" onPress={() => loadBreakdown($)} />
        </Box>
        <Text> </Text>
        <Box>
          <Text dimColor>{'Context'.padEnd(titleWidth)}</Text>
          {squares(Text, current.percent, PANE_BAR_CELLS)}
          <Text color={current.percent === null ? undefined : levelColor(current.percent)}>
            {` ${current.percent === null ? '–' : `${current.percent}%`}`}
          </Text>
          <Text dimColor>
            {current.tokens === null ? '' : `  ${tokensLabel(current.tokens)} / ${tokensLabel(current.window)}`}
          </Text>
        </Box>
        {current.limits.map(limit => {
          const left = countdown(limit.resetsAt, at)

          return (
            <Box>
              <Text dimColor>{limitTitle(limit.kind).padEnd(titleWidth)}</Text>
              {squares(Text, limit.percentUsed, PANE_BAR_CELLS)}
              <Text color={levelColor(limit.percentUsed)}>{` ${Math.round(limit.percentUsed)}%`}</Text>
              {left && <Text dimColor>  resets in {left}</Text>}
            </Box>
          )
        })}
        <Text> </Text>
        <Text bold>This session</Text>
        <Box>
          {current.usd !== null && <Text dimColor>Cost </Text>}
          {current.usd !== null && <Text>{`$${current.usd.toFixed(2)}`}  </Text>}
          <Text dimColor>Turns </Text>
          <Text>{formatDuration(spent.turnMs)}  </Text>
          {hit !== null && <Text dimColor>Cache hit </Text>}
          {hit !== null && <Text>{hit}%</Text>}
        </Box>
        {shares.length > 0 && (
          <Box>
            {shares.map(share => (
              <Box>
                <Text dimColor>{prettyModel(share.model)} </Text>
                <Text>{share.percent}%  </Text>
              </Box>
            ))}
          </Box>
        )}
        <Text> </Text>
        <Text bold>Breakdown</Text>
        {tokenRows.map(([label, tokens]) => (
          <Box>
            <Text dimColor>{label.padEnd(12)}</Text>
            <Text>{tokensLabel(tokens)}</Text>
          </Box>
        ))}
        <Text> </Text>
        <Text bold>Context window</Text>
        {shown.length === 0 && <Text dimColor>No context breakdown yet.</Text>}
        {shown.map(category => (
          <Box>
            <Text dimColor={category.kind !== 'used'}>{category.name.padEnd(nameWidth)}  </Text>
            <Text dimColor>{tokensLabel(category.tokens).padStart(tokenWidth)}  </Text>
            <Text dimColor>{`${((category.tokens / current.window) * 100).toFixed(1)}%`}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
