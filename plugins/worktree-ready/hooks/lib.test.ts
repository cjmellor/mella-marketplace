import { expect, test } from 'claude-code/testing'

import { certBase, inWorktrees, isProxy, jsPlan, linkName, lockOf, parseLinks, parseSiteScan, parseWorktree, setEnv, shareSqlite, siteFiles, siteLink, underWorktrees } from './lib'

test('reads who holds a worktree lock from git worktree list --porcelain', () => {
  const list = [
    'worktree /m/acme\nHEAD a\nbranch refs/heads/main',
    'worktree /m/acme/.claude/worktrees/heron\nHEAD b\nbranch refs/heads/worktree-heron\nlocked claude session heron (pid 20388 start Mon Oct 19 19:58:21 2026)',
    'worktree /m/acme/.claude/worktrees/owl\nHEAD c\nlocked',
    'worktree /m/acme/.claude/worktrees/fox\nHEAD d\nlocked on a USB stick',
  ].join('\n\n')

  expect(lockOf(list, '/m/acme/.claude/worktrees/heron')).toEqual({ kind: 'session', pid: 20388 })
  expect(lockOf(list, '/m/acme/.claude/worktrees/owl')).toEqual({ kind: 'other' })
  expect(lockOf(list, '/m/acme/.claude/worktrees/fox')).toEqual({ kind: 'other' })
  expect(lockOf(list, '/m/acme')).toEqual({ kind: 'none' })
})

test('finds the site certificate where Valet keeps it', () => {
  expect(certBase('/u', 'acme-wt.test')).toBe('/u/.config/valet/Certificates/acme-wt.test')
})

test('lists every file Valet keeps for a site, and tells a proxy config from a plain site', () => {
  expect(siteFiles('/u', 'acme-wt.test')).toEqual({
    nginx: '/u/.config/valet/Nginx/acme-wt.test',
    certs: ['crt', 'key', 'csr', 'conf'].map(extension => `/u/.config/valet/Certificates/acme-wt.test.${extension}`),
  })
  expect(isProxy('location / {\n  proxy_pass http://127.0.0.1:8095;\n}')).toBe(true)
  expect(isProxy('location / {\n  rewrite ^ /server.php last;\n}')).toBe(false)
})

test('reads the site symlinks Valet hides once their folder is gone', () => {
  expect(parseSiteScan('acme\t/m/acme\nacme-ghost\t/m/acme/.claude/worktrees/ghost\n')).toEqual([
    { name: 'acme', path: '/m/acme' },
    { name: 'acme-ghost', path: '/m/acme/.claude/worktrees/ghost' },
  ])
  expect(parseSiteScan('')).toEqual([])
  expect(siteLink('/u', 'acme-ghost')).toBe('/u/.config/valet/Sites/acme-ghost')
})

test('only paths under a .claude/worktrees folder count as worktree sites', () => {
  expect(inWorktrees('/m/acme/.claude/worktrees/heron')).toBe(true)
  expect(inWorktrees('/m/acme')).toBe(false)
})

const LINKS = [
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
  '|\u001b[32m Site                     \u001b[39m|\u001b[32m SSL \u001b[39m|\u001b[32m URL                                   \u001b[39m|\u001b[32m Path                                      \u001b[39m|\u001b[32m PHP Version \u001b[39m|',
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
  '| glowbreak-ui             |     | http://glowbreak-ui.test              | /Users/me/glowbreak/.claude/worktrees/ui  | php@8.5     |',
  '| acme                    |  X  | https://acme.test                    | /Users/me/acme                           | php@8.5     |',
  '+--------------------------+-----+---------------------------------------+-------------------------------------------+-------------+',
].join('\n')

test('a link name never contains the word worktree', () => {
  expect(linkName('acme', 'blue-heron', '/p/blue-heron')).toBe('acme-blue-heron')
  expect(linkName('acme', 'worktree-deps-plugin', '/p/x')).toBe('acme-deps-plugin')
  expect(linkName('My Worktree App', 'Fix_Login', '/p/x')).toBe('my-app-fix-login')
  expect(linkName('acme', 'worktree', '/p/worktree')).not.toContain('worktree')
  expect(linkName('acme', 'worktree', '/p/worktree')).not.toBe('acme')
  expect(linkName('acme', 'worktreefix', '/p/x')).toBe('acme-fix')
})

test('a link name stays a valid host label', () => {
  const name = linkName('acme', 'a'.repeat(120), '/p/x')

  expect(name.length).toBeLessThanOrEqual(60)
  expect(name).toMatch(/^[a-z0-9-]+$/)
  expect(name.endsWith('-')).toBe(false)
})

test('reads the sites table from valet links', () => {
  expect(parseLinks(LINKS)).toEqual([
    { name: 'glowbreak-ui', secure: false, url: 'http://glowbreak-ui.test', path: '/Users/me/glowbreak/.claude/worktrees/ui' },
    { name: 'acme', secure: true, url: 'https://acme.test', path: '/Users/me/acme' },
  ])
  expect(parseLinks('')).toEqual([])
})

test('a linked worktree names its main checkout, the main checkout itself is not one', () => {
  const linked = '/m/acme/.claude/worktrees/x\n/m/acme/.git/worktrees/x\n/m/acme/.git\n'
  const main = '/m/acme\n/m/acme/.git\n/m/acme/.git\n'

  expect(parseWorktree(linked)).toEqual({ top: '/m/acme/.claude/worktrees/x', gitDir: '/m/acme/.git/worktrees/x', main: '/m/acme' })
  expect(parseWorktree(main)).toBeNull()
  expect(parseWorktree('')).toBeNull()
})

test('only worktrees Claude made under the project are ours to remove', () => {
  expect(underWorktrees('/m/acme', '/m/acme/.claude/worktrees/x')).toBe(true)
  expect(underWorktrees('/m/acme', '/elsewhere/x')).toBe(false)
  expect(underWorktrees('/m/acme', '/m/acme')).toBe(false)
})

test('the JS package manager follows the lockfile, and a build runs only when there is a script', () => {
  expect(jsPlan(['bun.lock', 'package-lock.json'], true)).toEqual({ lock: 'bun.lock', install: ['bun', 'install', '--frozen-lockfile'], build: ['bun', 'run', 'build'] })
  expect(jsPlan(['package-lock.json'], false)).toEqual({ lock: 'package-lock.json', install: ['npm', 'ci'], build: null })
  expect(jsPlan(['pnpm-lock.yaml'], true).install).toEqual(['pnpm', 'install', '--frozen-lockfile'])
  expect(jsPlan([], true)).toEqual({ lock: null, install: null, build: null })
})

test('sets an env value in place, or adds it', () => {
  expect(setEnv('APP_NAME=Acme\nAPP_URL=http://acme.test\nAPP_ENV=local\n', 'APP_URL', 'https://acme-x.test')).toBe('APP_NAME=Acme\nAPP_URL=https://acme-x.test\nAPP_ENV=local\n')
  expect(setEnv('APP_NAME=Acme', 'APP_URL', 'https://x.test')).toBe('APP_NAME=Acme\nAPP_URL=https://x.test\n')
  expect(setEnv('', 'APP_URL', 'https://x.test')).toBe('APP_URL=https://x.test\n')
  expect(setEnv('DB_DATABASE=a\n', 'DB_DATABASE', '/path with space/db.sqlite')).toBe('DB_DATABASE="/path with space/db.sqlite"\n')
})

test('a sqlite database is shared by pointing the worktree at main\'s file', () => {
  expect(shareSqlite('DB_CONNECTION=sqlite\n', '/m/database/database.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/m/database/database.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=sqlite\nDB_DATABASE=database.sqlite\n', '/m/db.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/m/db.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=sqlite\nDB_DATABASE=/abs/db.sqlite\n', '/m/db.sqlite')).toBe('DB_CONNECTION=sqlite\nDB_DATABASE=/abs/db.sqlite\n')
  expect(shareSqlite('DB_CONNECTION=pgsql\nDB_DATABASE=acme\n', '/m/db.sqlite')).toBe('DB_CONNECTION=pgsql\nDB_DATABASE=acme\n')
})
