import type { EngineInterface, Register, SessionUsage } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Category, Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage', key: 'snapshot' } as const, null)
const breakdown = atom({ plugin: 'usage', key: 'breakdown' } as const, [] as Category[])
const isOpen = atom({ plugin: 'usage', key: 'isOpen' } as const, false)
const now = atom({ plugin: 'usage', key: 'now' } as const, 0)

const BAR_CELLS = 5
const PANE_BAR_CELLS = 20
const PANE = 'usage'
const MAX_PANE_ROWS = 30
const TICK_MS = 60_000

type Level = 'green' | 'yellow' | 'red'

let ticker: { cancel: () => void } | undefined

export const prettyModel = (id: string): string => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id)

  if (!match) {
    return id
  }

  const [, family, major, minor] = match

  return `${family[0].toUpperCase()}${family.slice(1)} ${minor ? `${major}.${minor}` : major}`
}

export const levelColor = (percent: number): Level => (percent >= 85 ? 'red' : percent >= 60 ? 'yellow' : 'green')

export const limitLabel = (kind: string): string =>
  ({ five_hour: '5h', seven_day: 'W', spend_limit: 'Spend' })[kind] ?? kind

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
  const lines = (await read($, breakdown)).length + (current?.limits.length ?? 0) + 8
  await $.ui.open({ id: PANE, title: 'Usage', focus: true, closeOnEscape: true, rows: Math.min(lines, MAX_PANE_ROWS) })
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

type TextElement = ReturnType<EngineInterface['ui']['resolve']>['Text']

function squares(Text: TextElement, percent: number | null, cells: number) {
  const filled = percent === null ? 0 : fillCells(percent, cells)
  const color = percent === null ? undefined : levelColor(percent)

  return [...Array(cells).keys()].map(index => (
    <Text color={index < filled ? color : undefined} dimColor={index >= filled}>◼</Text>
  ))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage', description: 'Show context and rate-limit usage in a pane' })
    await update($, isOpen, () => false)
    await refresh($)
    ticker?.cancel()
    ticker = await $.clock.every(TICK_MS, () => tick($))

    return next(e)
  })

  on('command.run', { command: 'usage' }, async $ => {
    await openPane($)

    return { text: 'Usage pane opened.' }
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

  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
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

    const band = (
      <Box>
        <Text bold>{prettyModel(current.model)}</Text>
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
    const at = await read($, now)

    if (current === null) {
      return <Text dimColor>No usage reading yet.</Text>
    }

    const shown = categories
      .filter(category => category.kind !== 'deferred')
      .sort((a, b) => Number(a.kind !== 'used') - Number(b.kind !== 'used') || b.tokens - a.tokens)
    const nameWidth = Math.max(0, ...shown.map(category => category.name.length))
    const tokenWidth = Math.max(0, ...shown.map(category => tokensLabel(category.tokens).length))

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{prettyModel(current.model)}</Text>
          <Text dimColor>  {current.usd === null ? '' : `$${current.usd.toFixed(2)}  `}</Text>
          <Button key="refresh" label="Refresh (r)" hotkey="r" onPress={() => loadBreakdown($)} />
        </Box>
        <Text> </Text>
        <Box>
          <Text dimColor>{'Context'.padEnd(8)}</Text>
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
              <Text dimColor>{limitLabel(limit.kind).padEnd(8)}</Text>
              {squares(Text, limit.percentUsed, PANE_BAR_CELLS)}
              <Text color={levelColor(limit.percentUsed)}>{` ${Math.round(limit.percentUsed)}%`}</Text>
              {left && <Text dimColor>  resets in {left}</Text>}
            </Box>
          )
        })}
        <Text> </Text>
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
