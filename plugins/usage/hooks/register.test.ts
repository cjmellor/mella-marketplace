import { expect, test } from 'claude-code/testing'

import { countdown, fillCells, levelColor, limitLabel, prettyModel, tokensLabel } from './register'

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
