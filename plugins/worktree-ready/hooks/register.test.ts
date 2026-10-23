import { expect, mock, test } from 'claude-code/testing'

const MAIN = '/m/acme'
const TREE = '/m/acme/.claude/worktrees/blue-heron'
const GIT_DIR = '/m/acme/.git/worktrees/blue-heron'
const NAME = 'acme-blue-heron'
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
  mergedPrHeads: string[]
  lock: string | null
  lockHolderAlive: boolean
  head: string
  statusFails: boolean
  locked: boolean
  lockMade: number
  branch: string
  rmFails: boolean
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
    [`${MAIN}/.env`, 'APP_NAME=Acme\nAPP_URL=http://acme.test\n'],
    [`${TREE}/package.json`, '{"scripts":{"build":"vite build"}}'],
  ]),
  sites: [{ name: 'acme', path: MAIN, secure: true }],
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
  mergedPrHeads: [],
  lock: null,
  lockHolderAlive: false,
  head: 'abc123',
  statusFails: false,
  locked: false,
  lockMade: 0,
  branch: 'worktree-blue-heron',
  rmFails: false,
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
  if (line === 'git rev-parse --abbrev-ref HEAD') return ok(`${w.branch}\n`)
  if (line.startsWith('rm -f ')) {
    if (w.rmFails) return fail()

    for (const file of argv.slice(2)) {
      w.files.delete(file)
      w.sites = w.sites.filter(site => !file.endsWith(`/Sites/${site.name}`))
    }

    return ok()
  }
  if (line.startsWith('test -L ')) return w.sites.some(site => (argv[2] ?? '').endsWith(`/Sites/${site.name}`)) ? ok() : fail()
  if (line.startsWith('sh -c for l in')) return ok(w.sites.map(site => `${site.name}\t${site.path}`).join('\n'))
  if (line.startsWith(`git -C ${MAIN} diff --quiet`)) return w.sameAssets ? ok() : fail()
  if (line === 'git status --porcelain') return w.statusFails ? fail() : ok(w.dirty ? ' M app/User.php\n' : '')
  if (line.startsWith('git -C') && line.includes('symbolic-ref')) return ok('origin/main\n')
  if (line.includes('merge-base --is-ancestor')) return w.merged ? ok() : fail()
  if (line.startsWith('gh pr list --head worktree-blue-heron --state merged')) return ok(JSON.stringify(w.mergedPrHeads.map(headRefOid => ({ headRefOid }))))
  if (line === `git -C ${MAIN} worktree list --porcelain`) return ok(`worktree ${MAIN}\nHEAD a\n\nworktree ${TREE}\nHEAD b${w.lock ? `\n${w.lock}` : ''}\n`)
  if (line.startsWith('kill -0 ')) return w.lockHolderAlive ? ok() : fail()
  if (line === `git -C ${MAIN} worktree unlock ${TREE}`) {
    w.lock = null

    return ok()
  }
  if (line.includes('worktree remove')) {
    if (w.lock) return fail()

    w.files.delete(argv[argv.length - 1] ?? '')

    return ok()
  }
  if (line.endsWith(' links')) return ok(table(w.sites.filter(site => !site.path.includes('/.claude/worktrees/') || w.files.has(site.path))))
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
  on('session.end', ($: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))
}

const enter = (w: World) => () => {
  w.files.add(TREE)

  return { result: { worktreePath: TREE, worktreeBranch: 'worktree-blue-heron', message: 'Switched' } }
}

const leave = (action: string) => () => ({ result: { action, originalCwd: MAIN, worktreePath: TREE } })

const ran = (w: World, prefix: string) => w.calls.filter(call => call.startsWith(prefix))

test('entering a worktree whose lockfiles and assets match main clones, installs and builds nothing, and links over https', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', enter(w))
  const entered = (await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })) as { context?: string[] }

  expect(w.logs).toEqual([`blue-heron is served at https://${NAME}.test`])
  expect(entered.context?.join(' ')).toContain(`https://${NAME}.test`)
  expect(ran(w, 'cp -c -R')).toEqual([`cp -c -R ${MAIN}/vendor ${TREE}/vendor`, `cp -c -R ${MAIN}/node_modules ${TREE}/node_modules`, `cp -c -R ${MAIN}/public/build ${TREE}/public/build`])
  expect(ran(w, 'composer')).toEqual([])
  expect(ran(w, 'bun')).toEqual([])
  expect(ran(w, 'valet link ')).toEqual([`valet link ${NAME}`])
  expect(ran(w, 'valet secure')).toEqual([`valet secure ${NAME}`])
  expect(w.texts.get(`${TREE}/.env`)).toBe(`APP_NAME=Acme\nAPP_URL=https://${NAME}.test\n`)
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ link: NAME, tool: 'valet', state: 'active', branch: 'worktree-blue-heron' })
  expect(w.toasts).toContain(`Worktree ready at https://${NAME}.test`)
})

test('points Vite at the secured site certificate so the dev server runs on https', async ($, on) => {
  const cert = `/u/.config/valet/Certificates/${NAME}.test`
  const w = world()

  w.files.add(`${cert}.key`)
  w.files.add(`${cert}.crt`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(w.texts.get(`${TREE}/.env`)).toBe(`APP_NAME=Acme\nAPP_URL=https://${NAME}.test\nVITE_DEV_SERVER_KEY=${cert}.key\nVITE_DEV_SERVER_CERT=${cert}.crt\n`)
})

test('a changed lockfile installs, and changed frontend sources rebuild', async ($, on) => {
  const w = world({ sameLocks: false, sameAssets: false })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'composer install')).toEqual(['composer install --no-interaction'])
  expect(ran(w, 'bun install')).toEqual(['bun install --frozen-lockfile'])
  expect(ran(w, 'bun run build')).toEqual(['bun run build'])
})

test('a main checkout with no built assets forces a build', async ($, on) => {
  const w = world()

  w.files.delete(`${MAIN}/public/build`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'bun run build')).toEqual(['bun run build'])
})

test('a site name that already points elsewhere is never overwritten', async ($, on) => {
  const w = world()

  w.sites.push({ name: NAME, path: '/somewhere/else', secure: true })
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.sites.find(site => site.name === NAME)?.path).toBe('/somewhere/else')
  expect(w.texts.get(`${TREE}/.env`)).toBe('APP_NAME=Acme\nAPP_URL=http://acme.test\n')
})

test('without Valet installed, the worktree is set up but nothing is linked', async ($, on) => {
  const w = world({ installed: [] })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.toasts).toContain('Worktree ready')
})

test('a main checkout that is not a Laravel worktree is left alone', async ($, on) => {
  const w = world()

  w.files.delete(`${TREE}/artisan`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'cp')).toEqual([])
  expect(w.store.size).toBe(0)
})

test('leaving a finished worktree unsecures, unlinks, verifies, then removes the folder and branch', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.head = 'def456'
  w.calls.length = 0
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, 'valet unsecure')).toEqual([`valet unsecure ${NAME}`])
  expect(ran(w, 'valet unlink')).toEqual([`valet unlink ${NAME}`])
  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(ran(w, `git -C ${MAIN} branch -d`)).toEqual([`git -C ${MAIN} branch -d worktree-blue-heron`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('leaving a worktree with uncommitted work unlinks it but keeps the folder, and says so once', async ($, on) => {
  const w = world({ dirty: true, head: 'def456' })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
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
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.toasts.some(text => text.includes('not merged'))).toBe(true)
})

test('a worktree whose branch was squash-merged through a PR at its current commit is removed', async ($, on) => {
  const w = world({ merged: false, mergedPrHeads: ['def456'] })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.head = 'def456'
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('a worktree with commits after its merged PR is kept', async ($, on) => {
  const w = world({ merged: false, mergedPrHeads: ['abc999'], head: 'def456' })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.toasts.some(text => text.includes('not merged'))).toBe(true)
})

test('a session that ends inside its worktree leaves it for the next session to remove', async ($, on) => {
  const w = world()
  const clock = mock.clock(on)

  stubWorld(on, w)
  on('tool.call', enter(w))
  on('session.start', () => ({ cwd: MAIN }))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.head = 'def456'
  w.cwd = `${TREE}/app`
  w.calls.length = 0
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })

  expect(w.calls).toEqual([])
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ state: 'exited', link: NAME })

  w.cwd = MAIN
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: MAIN })
  await clock.advance(1)

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('a lock left by a Claude session that has died is released before removal', async ($, on) => {
  const w = world({ lock: 'locked claude session blue-heron (pid 4242 start Mon Oct 19 19:58:21 2026)' })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.head = 'def456'
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree unlock`)).toEqual([`git -C ${MAIN} worktree unlock ${TREE}`])
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('a worktree locked by a running session, or by anything else, is kept', async ($, on) => {
  const w = world({ lock: 'locked claude session blue-heron (pid 4242 start Mon Oct 19 19:58:21 2026)', lockHolderAlive: true })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.head = 'def456'
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree unlock`)).toEqual([])
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.toasts.some(text => text.includes('running session'))).toBe(true)

  w.lock = 'locked'
  w.lockHolderAlive = false
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
})

test('a /clear leaves the worktree active', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.cwd = TREE
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })

  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ state: 'active' })
})

test('a worktree entered and left without a commit is kept, even though main contains its branch', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
})

test('a worktree whose git status fails is treated as dirty', async ($, on) => {
  const w = world({ head: 'def456', statusFails: true })

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('keep')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
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
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'valet link ')).toEqual([`valet link ${NAME}`])
})

test('a fresh lock means another setup is running', async ($, on) => {
  const clock = mock.clock(on)
  const w = world({ locked: true, lockMade: Math.floor((await clock.now()) / 1000) })

  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'valet link ')).toEqual([])
  expect(w.toasts.some(text => text.includes('another setup'))).toBe(true)
})

test('main\'s storage link is recreated in the worktree', async ($, on) => {
  const w = world()

  w.files.add(`${MAIN}/public/storage`)
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(ran(w, 'php artisan storage:link')).toEqual(['php artisan storage:link'])
})

test('when the tool removes the worktree itself, only the link and record are cleaned up', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : leave('remove')()))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  await $.tool.call({ tool: 'ExitWorktree', action: 'remove' })

  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('an exit the tool refused leaves the link and the record alone', async ($, on) => {
  const w = world()

  stubWorld(on, w)
  on('tool.call', ($: unknown, e: { tool: string }) => (e.tool === 'EnterWorktree' ? enter(w)() : { result: 'refused: uncommitted changes' }))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })
  w.calls.length = 0
  await $.tool.call({ tool: 'ExitWorktree', action: 'remove' })

  expect(ran(w, 'valet unlink')).toEqual([])
  expect(w.sites.some(site => site.name === NAME)).toBe(true)
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ state: 'active', link: NAME })
})

const exitedRecord = (overrides: Record<string, unknown> = {}) => ({ path: TREE, main: MAIN, project: 'acme', branch: 'worktree-blue-heron', base: 'abc123', tool: 'valet', link: NAME, state: 'exited', notified: false, ...overrides })

const startSession = async ($: any, on: any, w: World) => {
  const clock = mock.clock(on)

  on('session.start', () => ({ cwd: MAIN }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: MAIN })
  await clock.advance(1)
}

test('the next session removes a worktree that was left exited, and leaves a link to a folder that exists but is not its own alone', async ($, on) => {
  const w = world({ head: 'def456' })

  w.files.add(`${MAIN}/.claude/worktrees/other`)
  w.sites.push({ name: 'acme-other', path: `${MAIN}/.claude/worktrees/other`, secure: true })
  w.sites.push({ name: NAME, path: TREE, secure: true })
  w.store.set(`wt:${TREE}`, exitedRecord())
  stubWorld(on, w)
  await startSession($, on, w)

  expect(w.sites.map(site => site.name)).toEqual(['acme', 'acme-other'])
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('the next session unlinks a site whose worktree folder is gone, even with no record of it', async ($, on) => {
  const w = world()

  w.sites.push({ name: 'acme-ghost', path: `${MAIN}/.claude/worktrees/ghost`, secure: true })
  w.files.add('/u/.config/valet/Nginx/acme-ghost.test')
  w.files.add('/u/.config/valet/Certificates/acme-ghost.test.crt')
  w.files.add('/u/.config/valet/Certificates/acme-ghost.test.key')
  stubWorld(on, w)
  await startSession($, on, w)

  expect(w.sites.map(site => site.name)).toEqual(['acme'])
  expect(ran(w, 'valet unsecure')).toEqual(['valet unsecure acme-ghost'])
  expect(w.files.has('/u/.config/valet/Nginx/acme-ghost.test')).toBe(false)
  expect(w.files.has('/u/.config/valet/Certificates/acme-ghost.test.crt')).toBe(false)
  expect(w.files.has('/u/.config/valet/Certificates/acme-ghost.test.key')).toBe(false)
  expect(w.toasts).toContain('Removed 1 site whose worktree folder no longer exists')
})

test('a nginx file left behind after unlink is removed, and a proxy config of the same name is not', async ($, on) => {
  const w = world()

  w.sites.push({ name: 'acme-ghost', path: `${MAIN}/.claude/worktrees/ghost`, secure: true })
  w.files.add('/u/.config/valet/Nginx/acme-ghost.test')
  w.texts.set('/u/.config/valet/Nginx/acme-ghost.test', 'server { proxy_pass http://127.0.0.1:8095; }')
  stubWorld(on, w)
  await startSession($, on, w)

  expect(w.sites.map(site => site.name)).toEqual(['acme'])
  expect(ran(w, 'rm -f')).toEqual([])
  expect(w.files.has('/u/.config/valet/Nginx/acme-ghost.test')).toBe(true)
})

test('files that cannot be removed are reported and keep the worktree, and the next session finishes the job', async ($, on) => {
  const w = world({ head: 'def456', rmFails: true })
  const clock = mock.clock(on)
  const key = `/u/.config/valet/Certificates/${NAME}.test.key`

  w.sites.push({ name: NAME, path: TREE, secure: true })
  w.files.add(key)
  w.store.set(`wt:${TREE}`, exitedRecord())
  stubWorld(on, w)
  on('session.start', () => ({ cwd: MAIN }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: MAIN })
  await clock.advance(1)

  expect(w.toasts.some(text => text.includes(`${NAME}.test.key could not be removed`))).toBe(true)
  expect(w.store.get(`wt:${TREE}`)).toMatchObject({ link: NAME, state: 'exited' })
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(w.files.has(key)).toBe(true)

  w.rmFails = false
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: MAIN })
  await clock.advance(1)

  expect(w.files.has(key)).toBe(false)
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(w.store.has(`wt:${TREE}`)).toBe(false)
})

test('a worktree left on a detached HEAD that main contains is removed with no branch to delete', async ($, on) => {
  const w = world({ head: 'def456', branch: 'HEAD' })

  w.sites.push({ name: NAME, path: TREE, secure: true })
  w.store.set(`wt:${TREE}`, exitedRecord({ branch: 'HEAD' }))
  stubWorld(on, w)
  await startSession($, on, w)

  expect(ran(w, 'git -C /m/acme merge-base --is-ancestor def456')).not.toEqual([])
  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
  expect(ran(w, `git -C ${MAIN} branch -d`)).toEqual([])
  expect(w.sites.some(site => site.name === NAME)).toBe(false)
  expect(w.toasts).toContain('Removed the finished worktree blue-heron')
})

test('a worktree left on a detached HEAD with commits main does not contain is kept', async ($, on) => {
  const w = world({ head: 'def456', branch: 'HEAD', merged: false })

  w.store.set(`wt:${TREE}`, exitedRecord({ branch: 'HEAD' }))
  stubWorld(on, w)
  await startSession($, on, w)

  expect(ran(w, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(ran(w, 'gh pr list')).toEqual([])
  expect(w.toasts.some(text => text.includes('not merged'))).toBe(true)
})

test('a session in one project sweeps the exited worktrees of another', async ($, on) => {
  const w = world({ head: 'def456' })
  const OTHER = '/m/other'
  const OTHER_TREE = `${OTHER}/.claude/worktrees/red-fox`

  w.files.add(OTHER_TREE)
  w.sites.push({ name: 'other-red-fox', path: OTHER_TREE, secure: true })
  w.store.set(`wt:${OTHER_TREE}`, exitedRecord({ path: OTHER_TREE, main: OTHER, project: 'other', branch: 'worktree-red-fox', link: 'other-red-fox' }))
  stubWorld(on, w)
  await startSession($, on, w)

  expect(w.sites.some(site => site.name === 'other-red-fox')).toBe(false)
  expect(ran(w, `git -C ${OTHER} worktree remove`)).toEqual([`git -C ${OTHER} worktree remove ${OTHER_TREE}`])
  expect(w.store.has(`wt:${OTHER_TREE}`)).toBe(false)
})

test('a worktree still marked active whose session died is cleaned up, and one whose session runs is left alone', async ($, on) => {
  const dead = world({ head: 'def456', lock: 'locked claude session blue-heron (pid 4242 start Mon Oct 19 19:58:21 2026)', lockHolderAlive: false })

  dead.sites.push({ name: NAME, path: TREE, secure: true })
  dead.store.set(`wt:${TREE}`, exitedRecord({ state: 'active' }))
  stubWorld(on, dead)
  await startSession($, on, dead)

  expect(dead.sites.some(site => site.name === NAME)).toBe(false)
  expect(ran(dead, `git -C ${MAIN} worktree remove`)).toEqual([`git -C ${MAIN} worktree remove ${TREE}`])
})

test('a worktree whose session is still running keeps its site and folder', async ($, on) => {
  const live = world({ head: 'def456', lock: 'locked claude session blue-heron (pid 4242 start Mon Oct 19 19:58:21 2026)', lockHolderAlive: true })

  live.sites.push({ name: NAME, path: TREE, secure: true })
  live.store.set(`wt:${TREE}`, exitedRecord({ state: 'active' }))
  stubWorld(on, live)
  await startSession($, on, live)

  expect(live.sites.some(site => site.name === NAME)).toBe(true)
  expect(ran(live, 'valet unlink')).toEqual([])
  expect(ran(live, `git -C ${MAIN} worktree remove`)).toEqual([])
  expect(live.store.get(`wt:${TREE}`)).toMatchObject({ state: 'active', link: NAME })
})

test('a worktree .env copied in earlier still gets main\'s sqlite file, and the path comes from the tool result not the session', async ($, on) => {
  const w = world()

  w.files.add(`${MAIN}/database/database.sqlite`)
  w.files.add(`${TREE}/.env`)
  w.texts.set(`${TREE}/.env`, 'DB_CONNECTION=sqlite\nAPP_URL=http://acme.test\n')
  stubWorld(on, w)
  on('tool.call', enter(w))
  await $.tool.call({ tool: 'EnterWorktree', name: 'blue-heron' })

  expect(w.cwd).toBe(MAIN)
  expect(w.texts.get(`${TREE}/.env`)).toBe(`DB_CONNECTION=sqlite\nAPP_URL=https://${NAME}.test\nDB_DATABASE=${MAIN}/database/database.sqlite\n`)
})
