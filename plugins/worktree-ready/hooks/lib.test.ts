import { expect, test } from 'claude-code/testing'

import { chooseTool, jsPlan, linkName, parseLinks, parseWorktree, setEnv, shareSqlite, underWorktrees } from './lib'

const LINKS = [
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
  '|\u001b[32m Site                     \u001b[39m|\u001b[32m SSL \u001b[39m|\u001b[32m URL                                   \u001b[39m|\u001b[32m Path                                      \u001b[39m|\u001b[32m PHP Version \u001b[39m|',
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
  '| glowbreak-ui             |     | http://glowbreak-ui.test              | /Users/me/glowbreak/.claude/worktrees/ui  | php@8.5     |',
  '| kandu                    |  X  | https://kandu.test                    | /Users/me/kandu                           | php@8.5     |',
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
].join('\n')

test('a link name never contains the word worktree', () => {
  expect(linkName('kandu', 'purring-crafting', '/p/purring-crafting')).toBe('kandu-purring-crafting')
  expect(linkName('kandu', 'worktree-deps-plugin', '/p/x')).toBe('kandu-deps-plugin')
  expect(linkName('My Worktree App', 'Fix_Login', '/p/x')).toBe('my-app-fix-login')
  expect(linkName('kandu', 'worktree', '/p/worktree')).not.toContain('worktree')
  expect(linkName('kandu', 'worktree', '/p/worktree')).not.toBe('kandu')
})

test('a link name stays a valid host label', () => {
  const name = linkName('kandu', 'a'.repeat(120), '/p/x')

  expect(name.length).toBeLessThanOrEqual(60)
  expect(name).toMatch(/^[a-z0-9-]+$/)
  expect(name.endsWith('-')).toBe(false)
})

test('reads the sites table from valet links', () => {
  expect(parseLinks(LINKS)).toEqual([
    { name: 'glowbreak-ui', secure: false, url: 'http://glowbreak-ui.test', path: '/Users/me/glowbreak/.claude/worktrees/ui' },
    { name: 'kandu', secure: true, url: 'https://kandu.test', path: '/Users/me/kandu' },
  ])
  expect(parseLinks('')).toEqual([])
})

test('a linked worktree names its main checkout, the main checkout itself is not one', () => {
  const linked = '/m/kandu/.claude/worktrees/x\n/m/kandu/.git/worktrees/x\n/m/kandu/.git\n'
  const main = '/m/kandu\n/m/kandu/.git\n/m/kandu/.git\n'

  expect(parseWorktree(linked)).toEqual({ top: '/m/kandu/.claude/worktrees/x', gitDir: '/m/kandu/.git/worktrees/x', main: '/m/kandu' })
  expect(parseWorktree(main)).toBeNull()
  expect(parseWorktree('')).toBeNull()
})

test('only worktrees Claude made under the project are ours to remove', () => {
  expect(underWorktrees('/m/kandu', '/m/kandu/.claude/worktrees/x')).toBe(true)
  expect(underWorktrees('/m/kandu', '/elsewhere/x')).toBe(false)
  expect(underWorktrees('/m/kandu', '/m/kandu')).toBe(false)
})

test('picks the site tool from the setting and what is installed', () => {
  expect(chooseTool('auto', ['valet'])).toEqual({ tool: 'valet', reason: null })
  expect(chooseTool('auto', ['herd'])).toEqual({ tool: 'herd', reason: null })
  expect(chooseTool('auto', ['valet', 'herd'])).toEqual({ tool: null, reason: 'both' })
  expect(chooseTool('auto', [])).toEqual({ tool: null, reason: 'none' })
  expect(chooseTool('herd', ['valet', 'herd'])).toEqual({ tool: 'herd', reason: null })
  expect(chooseTool('herd', ['valet'])).toEqual({ tool: null, reason: 'missing' })
})

test('the JS package manager follows the lockfile, and a build runs only when there is a script', () => {
  expect(jsPlan(['bun.lock', 'package-lock.json'], true)).toEqual({ lock: 'bun.lock', install: ['bun', 'install', '--frozen-lockfile'], build: ['bun', 'run', 'build'] })
  expect(jsPlan(['package-lock.json'], false)).toEqual({ lock: 'package-lock.json', install: ['npm', 'ci'], build: null })
  expect(jsPlan(['pnpm-lock.yaml'], true).install).toEqual(['pnpm', 'install', '--frozen-lockfile'])
  expect(jsPlan([], true)).toEqual({ lock: null, install: null, build: null })
})

test('sets an env value in place, or adds it', () => {
  expect(setEnv('APP_NAME=Kandu\nAPP_URL=http://kandu.test\nAPP_ENV=local\n', 'APP_URL', 'https://kandu-x.test')).toBe('APP_NAME=Kandu\nAPP_URL=https://kandu-x.test\nAPP_ENV=local\n')
  expect(setEnv('APP_NAME=Kandu', 'APP_URL', 'https://x.test')).toBe('APP_NAME=Kandu\nAPP_URL=https://x.test\n')
  expect(setEnv('', 'APP_URL', 'https://x.test')).toBe('APP_URL=https://x.test\n')
  expect(setEnv('DB_DATABASE=a\n', 'DB_DATABASE', '/path with space/db.sqlite')).toBe('DB_DATABASE="/path with space/db.sqlite"\n')
})

test('a sqlite database is shared by pointing the worktree at main\'s file', () => {
  expect(shareSqlite('DB_CONNECTION=sqlite\n', '/m/database/database.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/m/database/database.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=sqlite\nDB_DATABASE=database.sqlite\n', '/m/db.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/m/db.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=sqlite\nDB_DATABASE=/abs/db.sqlite\n', '/m/db.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/abs/db.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=pgsql\nDB_DATABASE=kandu\n', '/m/db.sqlite')).toBe('DB_CONNECTION=pgsql\nDB_DATABASE=kandu\n')
})
