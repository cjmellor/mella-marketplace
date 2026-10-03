import { expect, test } from 'claude-code/testing'

import { barCells, barSquares, entries, parseNumstat } from './register'

test('bar squares run green, then red, then grey', () => {
  expect(barSquares({ added: 3, removed: 1 })).toEqual(['green', 'green', 'green', 'green', 'red'])
  expect(barSquares({ added: 0, removed: 0 })).toEqual(['grey', 'grey', 'grey', 'grey', 'grey'])
})

const rows = [
  { path: 'src/a/b/one.ts', added: 4, removed: 1 },
  { path: 'src/a/b/two.ts', added: 2, removed: 0 },
  { path: 'README.md', added: 1, removed: 1 },
]

test('tree view rolls totals up into folders and merges single-child chains', () => {
  expect(entries(rows, 'tree')).toEqual([
    { label: 'src/a/b/', depth: 0, isDir: true, added: 6, removed: 1 },
    { label: 'one.ts', depth: 1, isDir: false, added: 4, removed: 1 },
    { label: 'two.ts', depth: 1, isDir: false, added: 2, removed: 0 },
    { label: 'README.md', depth: 0, isDir: false, added: 1, removed: 1 },
  ])
})

test('list view keeps full paths in the given order', () => {
  expect(entries(rows, 'list').map(entry => entry.label)).toEqual(['src/a/b/one.ts', 'src/a/b/two.ts', 'README.md'])
})

test('sums numstat rows, treating binary files as zero lines, biggest change first', () => {
  const stat = parseNumstat('3\t1\ta.ts\n-\t-\timg.png\n10\t0\tb.ts\n')

  expect(stat.files).toBe(3)
  expect(stat.added).toBe(13)
  expect(stat.removed).toBe(1)
  expect(stat.rows.map(row => row.path)).toEqual(['b.ts', 'a.ts', 'img.png'])
})

test('splits the bar by share of added lines', () => {
  expect(barCells({ added: 3, removed: 2 })).toEqual({ green: 3, red: 2, grey: 0 })
  expect(barCells({ added: 0, removed: 0 })).toEqual({ green: 0, red: 0, grey: 5 })
  expect(barCells({ added: 1, removed: 1 }, 8)).toEqual({ green: 4, red: 4, grey: 0 })
})
