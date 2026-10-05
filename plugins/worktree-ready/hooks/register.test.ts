import { expect, mock, test } from 'claude-code/testing'

const MAIN = '/m/kandu'
const TREE = '/m/kandu/.claude/worktrees/purring-crafting'
const GIT_DIR = '/m/kandu/.git/worktrees/purring-crafting'
const NAME = 'kandu-purring-crafting'
const REV = `${TREE}\n${GIT_DIR}\n${MAIN}/.git\n`

type Site = { name: string; path: string; secure: boolean }

type World = {
  files: Set<string>
  texts: Map<string, string>
  sites: Site[]
  calls: string[]
  store: Map<string, unknown>
  toasts: string[]
  logs: string[]
  cwd: string
  installed: string[]
  sameLocks: boolean
  sameAssets: boolean
  dirty: boolean
  merged: boolean
  head: string
  statusFails: boolean
  locked: boolean
  lockMade: number
}

const table = (sites: Site[]) =>
  [
    '| Site | SSL | URL | Path | PHP Version |',
    ...sites.map(site => `| ${site.name} | ${site.secure ? 'X' : ' '} | ${site.secure ? 'https' : 'http'}://${site.name}.test | ${site.path} | php@8.5 |`),
  ].join('\n')

const world = (overrides: Partial<World> = {}): World => ({
  files: new Set([
    `${TREE}/artisan`, `${TREE}/composer.lock`, `${TREE}/package.json`, `${TREE}/bun.lock`, `${TREE}/.env.example`,
    `${MAIN}/vendor`, `${MAIN}/node_modules`, `${MAIN}/public/build`, `${MAIN}/.env`, TREE,
  ]),
  texts: new Map([
    [`${MAIN}/.env`, 'APP_NAME=Kandu\nAPP_URL=http://kandu.test\n'],
    [`${TREE}/package.json`, '{"scripts":{"build":"vite build"}}'],
  ]),
  sites: [{ name: 'kandu', path: MAIN, secure: true }],
  calls: [],
  store: new Map(),
  toasts: [],
  logs: [],
  cwd: MAIN,
  installed: ['valet'],
  sameLocks: true,
  sameAssets: true,
  dirty: false,
  merged: true,
  head: 'abc123',
  statusFails: false,
  locked: false,
  lockMade: 0,
  ...overrides,
})

const respond = (w: World, argv: string[], cwd: string | undefined) => {
  const line = argv.join(' ')
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
  const fail = () => ({ exitCode: 1, stdout: '', stderr: '' })

  w.calls.push(line)

  if (line.startsWith('git rev-parse --path-format=absolute')) return cwd === TREE ? ok(REV) : ok(`${MAIN}\n${MAIN}/.git\n${MAIN}/.git\n`)
  if (line.startsWith('sh -c command -v ')) return w.installed.includes(line.slice('sh -c command -v '.length)) ? ok('/bin/x') : fail()
  if (line.startsWith('cp -c -R ')) {
    w.files.add(argv[4] ?? '')

    return ok()
  }
  if (line.startsWith('cmp -s')) return w.sameLocks ? ok() : fail()
  if (line === 'git rev-parse HEAD') return ok(`${w.head}\n`)
  if (line === 'printenv HOME') return ok('/u\n')
  if (line.startsWith('mkdir ')) return w.locked ? fail() : ok()
  if (line.startsWith('rmdir ')) {
    w.locked = false

    return ok()
  }
  if (line.startsWith('stat -f')) return ok(`${w.lockMade}\n`)
  if (line === 'git rev-parse --abbrev-ref HEAD') return ok('worktree-purring-crafting\n')
  if (line.startsWith(`git -C ${MAIN} diff --quiet`)) return w.sameAssets ? ok() : fail()
  if (line === 'git status --porcelain') return w.statusFails ? fail() : ok(w.dirty ? ' M app/User.php\n' : '')
  if (line.startsWith('git -C') && line.includes('symbolic-ref')) return ok('origin/main\n')
  if (line.includes('merge-base --is-ancestor')) return w.merged ? ok() : fail()
  if (line.includes('worktree remove')) {
    w.files.delete(TREE)

    return ok()
  }
  if (line.endsWith(' links')) return ok(table(w.sites))
  if (line.startsWith('valet link ')) {
    w.sites.push({ name: argv[2] ?? '', path: cwd ?? '', secure: false })

    return ok()
  }
  if (line.startsWith('valet secure ')) {
    const site = w.sites.find(entry => entry.name === argv[2])

    if (site) site.secure = true

    return ok()
  }
  if (line.startsWith('valet unlink ')) {
    w.sites = w.sites.filter(entry => entry.name !== argv[2])

    return ok()
  }

  return ok()
}

const stubWorld = (on: (name: string, hook: (...args: any[]) => unknown) => void, w: World) => {
  on('process.run', ($: unknown, e: { argv: string[]; init?: { cwd?: string } }) => ({ value: respond(w, e.argv, e.init?.cwd) }))
  on('fs.exists', ($: unknown, e: { path: string }) => ({ value: w.files.has(e.path) }))
  on('fs.read', ($: unknown, e: { path: string }) => ({ value: w.texts.get(e.path) ?? '' }))
  on('fs.write', ($: unknown, e: { path: string; text: string }) => {
    w.texts.set(e.path, e.text)
    w.files.add(e.path)

    return { value: undefined }
  })
  on('store.get', ($: unknown, e: { key: string }) => ({ value: w.store.get(e.key) }))
  on('store.set', ($: unknown, e: { key: string; value: unknown }) => {
    w.store.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', ($: unknown, e: { key: string }) => {
    w.store.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($: unknown, e: { text: string }) => {
    w.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', ($: unknown, e: { text: string }) => {
    w.logs.push(e.text)

    return { value: undefined }
  })
  on('session.cwd', () => ({ value: w.cwd }))
  on('session.repo', () => ({ value: { root: MAIN, remote: null, internal: false } }))
}

const enter = (w: World) => () => {
  w.files.add(TREE)

  return { result: { worktreePath: TREE, worktreeBranch: 'worktree-purring-crafting', message: 'Switched' } }
}

const leave = (action: string) => () => ({ result: { action, originalCwd: MAIN, worktreePath: TREE } })

const ran = (w: World, prefix: string) => w.calls.filter(call => call.startsWith(prefix))

test('entering a worktree whose lockfiles and assets match main clones, installs and builds nothing, and links over https', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', enter(w))
  const entered = (await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })) as { context?: string[] }

  expect(w.logs).toEqual([`purring-crafting is served at https://${NAME}.test`])
  expect(entered.context?.join(' ')).toContain(`https://${NAME}.test`)
  expect(ran(w, 'cp -c -R')).toEqual([`cp -c -R ${MAIN}/vendor ${TREE}/vendor`, `cp -c -R ${MAIN}/node_modules ${TREE}/node_modules`, `cp -c -R ${MAIN}/public/build ${TREE}/public/build`])
  expect(ran(w, 'composer')).toEqual([])
  expect(ran(w, 'bun')).toEqual([])
  expect(ran(w, 'valet link ')).toEqual([`valet link ${NAME}`])
  expect(ran(w, 'valet secure')).toEqual([`valet secure ${NAME}`])
  expect(w.texts.get(`${TREE}/.env`)).toBe(`APP_NAME=Kandu\nAPP_URL=https://${NAME}.test\n`)
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ link: NAME, tool: 'valet', state: 'active', branch: 'worktree-purring-crafting' })
  expect(w.toasts).toContain(`Worktree ready at https://${NAME}.test`)
})

test('points Vite at the secured site certificate so the dev server runs on https', async ($, on) => {
  const cert = `/u/.config/valet/Certificates/${NAME}.test`
  const w = world()

  w.files.add(`${cert}.key`)
  w.files.add(`${cert}.crt`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(w.texts.get(`${TREE}/.env`)).toBe(`APP_NAME=Kandu\nAPP_URL=https://${NAME}.test\nVITE_DEV_SERVER_KEY=${cert}.key\nVITE_DEV_SERVER_CERT=${cert}.crt\n`)
})

test('a changed lockfile installs, and changed frontend sources rebuild', async ($, on) => {
  const w = world({ sameLocks: false, sameAssets: false })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'composer install')).toEqual(['composer install --no-interaction'])
  expect(ran(w, 'bun install')).toEqual(['bun install --frozen-lockfile'])
  expect(ran(w, 'bun run build')).toEqual(['bun run build'])
})

test('a main checkout with no built assets forces a build', async ($, on) => {
  const w = world()

  w.files.delete(`${MAIN}/public/build`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'bun run build')).toEqual(['bun run build'])
})

test('a site name that already points elsewhere is never overwritten', async ($, on) => {
  const w = world()

  w.sites.push({ name: NAME, path: '/somewhere/else', secure: true })
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.sites.find(site => site.name === NAME)?.path).toBe('/somewhere/else')
  expect(w.texts.get(`${TREE}/.env`)).toBe('APP_NAME=Kandu\nAPP_URL=http://kandu.test\n')
})

test('with both tools installed and no choice made, nothing is linked and the user is told', async ($, on) => {
  const w = world({ installed: ['valet', 'herd'] })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.toasts.some(text => text.includes('both installed'))).toBe(true)
})

test('a main checkout that is not a Laravel worktree is left alone', async ($, on) => {
  const w = world()

  w.files.delete(`${TREE}/artisan`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'cp')).toEqual([])
  expect(w.store.size).toBe(0)
})

test('leaving a finished worktree unsecures, unlinks, verifies, then removes the folder and branch', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  w.head = 'def456'
  w.calls.length = 0
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, 'valet unsecure')).toEqual([`valet unsecure ${NAME}`])
  expect(ran(w, 'valet unlink')).toEqual([`valet unlink ${NAME}`])
  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(ran(w, `git -C ${MAIN} branch -d`)).toEqual([`git -C ${MAIN} branch -d worktree-purring-crafting`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('leaving a worktree with uncommitted work unlinks it but keeps the folder, and says so once', async ($, on) => {
  const w = world({ dirty: true, head: 'def456' })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ state: 'exited', link: null, notified: true })
  expect(w.toasts.some(text => text.includes('uncommitted'))).toBe(true)
})

test('a worktree whose branch is not merged is kept', async ($, on) => {
  const w = world({ merged: false, head: 'def456' })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.toasts.some(text => text.includes('not merged'))).toBe(true)
})

test('a worktree entered and left without a commit is kept, even though main contains its branch', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
})

test('a worktree whose git status fails is treated as dirty', async ($, on) => {
  const w = world({ head: 'def456', statusFails: true })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
})

test('an entry the tool denied or failed sets nothing up', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', () => ({ deny: 'not allowed' }))
  await $.tool.call({ tool: 'EnterWorktree', name: 'x' })

  expect(w.calls.filter(call => call.startsWith('valet') || call.startsWith('cp'))).toEqual([])
  expect(w.store.size).toBe(0)
})

test('a setup lock left behind by a dead session is cleared once it is old', async ($, on) => {
  const w = world({ locked: true, lockMade: 1 })

  const clock = mock.clock(on)

  await clock.advance(3_600_000)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'valet link ')).toEqual([`valet link ${NAME}`])
})

test('a fresh lock means another setup is running', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ locked: true, lockMade: Math.floor((await clock.now()) / 1000) })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.toasts.some(text => text.includes('another setup'))).toBe(true)
})

test('main\'s storage link is recreated in the worktree', async ($, on) => {
  const w = world()

  w.files.add(`${MAIN}/public/storage`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(ran(w, 'php artisan storage:link')).toEqual(['php artisan storage:link'])
})

test('when the tool removes the worktree itself, only the link and record are cleaned up', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('remove')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'remove' })

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('an exit the tool refused leaves the link and the record alone', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : { result: 'refused: uncommitted changes' }))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })
  w.calls.length = 0
  await $.tool.call({ tool: 'ExitWorktree', action: 'remove' })

  expect(ran(w, 'valet unlink')).toEqual([])
  expect(w.sites.some(site => site.name === NAME)).toBe(true)
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ state: 'active', link: NAME })
})

test('the next session removes a worktree that was left exited, and leaves links it did not make alone', async ($, on) => {
  const w = world({ head: 'def456' })
  const clock = mock.clock(on)

  w.sites.push({ name: 'kandu-ghost', path: `${MAIN}/.claude/worktrees/ghost`, secure: true })
  w.sites.push({ name: NAME, path: TREE, secure: true })
  w.store.set(`wt:${TREE}`, { path: TREE, main: MAIN, project: 'kandu', branch: 'worktree-purring-crafting', base: 'abc123', tool: 'valet', link: NAME, state: 'exited', notified: false })
  stubWorld(on, w)
  on('session.start', () => ({ cwd: MAIN }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: MAIN })
  await clock.advance(1)

  expect(w.sites.map(site => site.name)).toEqual(['kandu', 'kandu-ghost'])
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('a worktree .env copied in earlier still gets main\'s sqlite file, and the path comes from the tool result not the session', async ($, on) => {
  const w = world()

  w.files.add(`${MAIN}/database/database.sqlite`)
  w.files.add(`${TREE}/.env`)
  w.texts.set(`${TREE}/.env`, 'DB_CONNECTION=sqlite\nAPP_URL=http://kandu.test\n')
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'purring-crafting' })

  expect(w.cwd).toBe(MAIN)
  expect(w.texts.get(`${TREE}/.env`)).toBe(`DB_CONNECTION=sqlite\nAPP_URL=https://${NAME}.test\nDB_DATABASE=${MAIN}/database/database.sqlite\n`)
})
