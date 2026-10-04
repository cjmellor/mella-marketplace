import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'

import {
  addTurn,
  cacheHit,
  countdown,
  effortIcon,
  fillCells,
  formatDuration,
  levelColor,
  limitLabel,
  limitTitle,
  modelShares,
  parseEffort,
  prettyModel,
  tokensLabel,
} from './register'

const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turnMs: 0, byModel: {} }

test('turns add into session totals, cache hit and model shares', () => {
  const first = addTurn(
    empty,
    { model: 'claude-sonnet-5-5', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 },
    2000,
  )
  const second = addTurn(
    first,
    { model: 'claude-fable-5-1', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 105 },
    3000,
  )

  expect(second).toEqual({
    input: 10,
    output: 5,
    cacheRead: 90,
    cacheWrite: 105,
    turnMs: 5000,
    byModel: { 'claude-sonnet-5-5': 105, 'claude-fable-5-1': 105 },
  })
  expect(cacheHit(first)).toBe(90)
  expect(cacheHit(empty)).toBeNull()
  expect(modelShares(second).map(share => share.percent)).toEqual([50, 50])
})

test('per-model weekly windows get their own titles and labels', () => {
  expect(limitTitle('five_hour')).toBe('Session limit')
  expect(limitTitle('seven_day')).toBe('Weekly · all models')
  expect(limitTitle('seven_day_fable')).toBe('Weekly · Fable')
  expect(limitLabel('seven_day_fable')).toBe('W Fable')
})

test('effort levels map to icons, numbers and nothing', () => {
  expect(['low', 'medium', 'high', 'xhigh', 'max'].map(effortIcon)).toEqual(['○', '◐', '●', '◉', '◈'])
  expect(effortIcon(8000)).toBe('8000')
  expect(effortIcon(null)).toBe('')
})

test('an /effort argument names a level only when it is one', () => {
  expect(parseEffort(' High ')).toBe('high')
  expect(parseEffort('xhigh')).toBe('xhigh')
  expect(parseEffort('')).toBeNull()
  expect(parseEffort('auto')).toBeNull()
})

const stubState = (on: On) => {
  const written: Record<string, unknown> = {}

  on('state.get', (_$, e) => ({ value: { value: written[e.key], version: 1 } }))
  on('state.set', (_$, e) => {
    written[e.key] = e.value

    return { value: { isSet: true, version: 1 } }
  })

  return written
}

test('a model switch updates the shown model without waiting for a turn', async ($, on) => {
  on('session.usage', () => ({ value: { context: { percent: 10, tokens: 1000, window: 200_000 }, rateLimits: [] } as never }))
  let model = 'claude-opus-5-5'
  on('session.model', () => ({ value: model }))
  on('command.run', () => {
    model = 'claude-sonnet-5-5'

    return { text: '' }
  })
  const written = stubState(on)

  await $.command.run({ command: 'model', args: 'sonnet' })

  expect((written.snapshot as Snapshot | undefined)?.model).toBe('claude-sonnet-5-5')
  expect(written.effort).toBeNull()
})

test('/effort with a level updates the icon without waiting for a turn', async ($, on) => {
  on('command.run', () => ({ text: '' }))
  const written = stubState(on)

  await $.command.run({ command: 'effort', args: 'low' })

  expect(written.effort).toBe('low')
})

test('durations read as hours, minutes or seconds', () => {
  expect(formatDuration(1_013_000)).toBe('16m 53s')
  expect(formatDuration(45_000)).toBe('45s')
  expect(formatDuration(3_900_000)).toBe('1h 5m')
})

test('model ids become readable names', () => {
  expect(prettyModel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('claude-opus-4-20250514')).toBe('Opus 4')
  expect(prettyModel('sonnet')).toBe('sonnet')
})

test('usage level turns yellow at 60 and red at 85', () => {
  expect([0, 59, 60, 84, 85, 100].map(levelColor)).toEqual(['green', 'green', 'yellow', 'yellow', 'red', 'red'])
})

test('fill cells round and clamp', () => {
  expect(fillCells(0)).toBe(0)
  expect(fillCells(50)).toBe(3)
  expect(fillCells(130)).toBe(5)
})

test('countdown shows days and hours, hours and minutes, or minutes', () => {
  const at = Date.parse('2026-10-03T12:00:00Z')

  expect(countdown('2026-10-07T14:00:00Z', at)).toBe('4d 2h')
  expect(countdown('2026-10-03T14:05:00Z', at)).toBe('2h 5m')
  expect(countdown('2026-10-03T12:34:00Z', at)).toBe('34m')
  expect(countdown('2026-10-03T11:00:00Z', at)).toBe('')
  expect(countdown(undefined, at)).toBe('')
})

test('limit labels and token counts are short', () => {
  expect(limitLabel('five_hour')).toBe('5h')
  expect(limitLabel('seven_day')).toBe('W')
  expect(tokensLabel(950)).toBe('950')
  expect(tokensLabel(24_300)).toBe('24k')
  expect(tokensLabel(1_250_000)).toBe('1.3M')
})
