import type { EngineInterface, Register } from 'claude-code'

import { ASSET_INPUTS, CLONES, JS_LOCK_FILES, TOOLS, basename, chooseTool, jsPlan, linkName, parseLinks, parseWorktree, setEnv, shareSqlite, underWorktrees } from './lib'
import type { Link, Tool, WorktreeInfo, WorktreeRecord } from './lib'

const PLUGIN = 'worktree-ready'
const PREFIX = 'wt:'
const LONG_MS = 600_000
const SITE_MS = 120_000
const STALE_LOCK_MS = 1_800_000
const NOT_LINKED = { url: null, linked: false }

let configured = 'auto'

type Outcome = { exitCode: number; stdout: string; stderr: string }

async function run($: EngineInterface, argv: string[], cwd?: string, timeoutMs?: number): Promise<Outcome> {
  try {
    return await $.process.run(argv, { ...(cwd ? { cwd } : {}), ...(timeoutMs ? { timeoutMs } : {}) })
  } catch (error) {
    return { exitCode: 127, stdout: '', stderr: String(error) }
  }
}

const passed = (outcome: Outcome): boolean => outcome.exitCode === 0

const deniedOrFailed = (result: unknown): boolean => {
  const shape = result as { deny?: unknown; isError?: unknown } | undefined

  return shape?.deny !== undefined || shape?.isError === true
}

const outcomeOf = (result: unknown): { worktreePath?: string; action?: string } | undefined => {
  const inner = (result as { result?: unknown } | undefined)?.result

  return typeof inner === 'object' && inner !== null ? (inner as { worktreePath?: string; action?: string }) : undefined
}

function must(outcome: Outcome, what: string) {
  if (!passed(outcome)) {
    throw new Error(`${what}: ${outcome.stderr.trim().slice(0, 160) || `exit ${outcome.exitCode}`}`)
  }
}

const say = ($: EngineInterface, text?: string) => $.ui.status(text)

const toast = ($: EngineInterface, text: string, timeoutMs = 6000) => $.ui.toast(text, { timeoutMs })

const has = ($: EngineInterface, root: string, rel: string) => $.fs.exists(`${root}/${rel}`)

const recordKey = (path: string) => `${PREFIX}${path}`

async function readRecord($: EngineInterface, path: string): Promise<WorktreeRecord | null> {
  return ((await $.store.get(recordKey(path))) as WorktreeRecord | undefined) ?? null
}

async function saveRecord($: EngineInterface, record: WorktreeRecord) {
  await $.store.set(recordKey(record.path), record)
}

async function worktreeAt($: EngineInterface, dir: string): Promise<WorktreeInfo | null> {
  const rev = await run($, ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], dir)

  return passed(rev) ? parseWorktree(rev.stdout) : null
}

async function findTool($: EngineInterface, notify: boolean): Promise<Tool | null> {
  const installed: Tool[] = []

  for (const tool of TOOLS) {
    if (passed(await run($, ['sh', '-c', `command -v ${tool}`]))) {
      installed.push(tool)
    }
  }

  const { tool, reason } = chooseTool(configured, installed)

  if (notify && reason === 'both') {
    toast($, 'Valet and Herd are both installed: set the "Site tool" option to choose one', 10_000)
  }

  if (notify && reason === 'missing') {
    toast($, `${configured} is not installed, so the site is not linked`, 10_000)
  }

  return tool
}

async function listLinks($: EngineInterface, tool: Tool): Promise<Link[] | null> {
  const listed = await run($, [tool, 'links'])

  return passed(listed) ? parseLinks(listed.stdout) : null
}

async function copyEnv($: EngineInterface, { main, top }: WorktreeInfo) {
  if ((await has($, top, '.env')) || !(await has($, main, '.env'))) {
    return
  }

  await $.fs.write(`${top}/.env`, String(await $.fs.read(`${main}/.env`)))
}

async function editEnv($: EngineInterface, top: string, change: (text: string) => string) {
  if (!(await has($, top, '.env'))) {
    return
  }

  const text = String(await $.fs.read(`${top}/.env`))
  const next = change(text)

  if (next !== text) {
    await $.fs.write(`${top}/.env`, next)
  }
}

async function shareDatabase($: EngineInterface, { main, top }: WorktreeInfo) {
  const database = `${main}/database/database.sqlite`

  if (await $.fs.exists(database)) {
    await editEnv($, top, text => shareSqlite(text, database))
  }
}

const setAppUrl = ($: EngineInterface, top: string, url: string) => editEnv($, top, text => setEnv(text, 'APP_URL', url))

async function lockDiffers($: EngineInterface, { main, top }: WorktreeInfo, file: string): Promise<boolean> {
  return !passed(await run($, ['cmp', '-s', `${main}/${file}`, `${top}/${file}`]))
}

async function hasBuildScript($: EngineInterface, top: string): Promise<boolean> {
  if (!(await has($, top, 'package.json'))) {
    return false
  }

  try {
    const scripts = (JSON.parse(String(await $.fs.read(`${top}/package.json`))) as { scripts?: Record<string, unknown> }).scripts

    return typeof scripts?.build === 'string'
  } catch {
    return false
  }
}

async function needsBuild($: EngineInterface, { main, top }: WorktreeInfo): Promise<boolean> {
  if (!(await has($, top, 'public/build'))) {
    return true
  }

  const head = await run($, ['git', 'rev-parse', 'HEAD'], top)

  if (!passed(head)) {
    return true
  }

  // Main's working tree is what its public/build was built from, so that is what the worktree's commit is compared with.
  return !passed(await run($, ['git', '-C', main, 'diff', '--quiet', head.stdout.trim(), '--', ...ASSET_INPUTS]))
}

async function link($: EngineInterface, tool: Tool, name: string, top: string): Promise<{ url: string | null; linked: boolean }> {
  const clash = (await listLinks($, tool))?.find(site => site.name === name)

  if (clash && clash.path !== top) {
    toast($, `${name} already points at ${clash.path}, so it was not linked`, 10_000)

    return NOT_LINKED
  }

  if (!clash && !passed(await run($, [tool, 'link', name], top, SITE_MS))) {
    toast($, `${tool} link ${name} failed`, 10_000)

    return NOT_LINKED
  }

  await run($, [tool, 'secure', name], top, SITE_MS)

  const site = (await listLinks($, tool))?.find(entry => entry.name === name && entry.path === top)

  if (!site?.secure) {
    toast($, `${name} is linked but not secure`, 10_000)
  }

  return { url: site?.url ?? null, linked: true }
}

async function setUp($: EngineInterface, info: WorktreeInfo): Promise<string | null> {
  const { top, main } = info
  const earlier = await readRecord($, top)

  say($, 'cloning dependencies')

  for (const dir of CLONES) {
    if ((await has($, main, dir)) && !(await has($, top, dir))) {
      await run($, ['cp', '-c', '-R', `${main}/${dir}`, `${top}/${dir}`], undefined, LONG_MS)
    }
  }

  await copyEnv($, info)
  await shareDatabase($, info)

  if ((await has($, top, 'composer.lock')) && ((await lockDiffers($, info, 'composer.lock')) || !(await has($, top, 'vendor')))) {
    say($, 'composer install')
    must(await run($, ['composer', 'install', '--no-interaction'], top, LONG_MS), 'composer install failed')
  }

  if ((await has($, main, 'public/storage')) && !(await has($, top, 'public/storage'))) {
    await run($, ['php', 'artisan', 'storage:link'], top)
  }

  const locks: string[] = []

  for (const file of JS_LOCK_FILES) {
    if (await has($, top, file)) {
      locks.push(file)
    }
  }

  const plan = jsPlan(locks, await hasBuildScript($, top))

  if (plan.install && plan.lock && ((await lockDiffers($, info, plan.lock)) || !(await has($, top, 'node_modules')))) {
    say($, `${plan.install[0]} install`)
    must(await run($, plan.install, top, LONG_MS), `${plan.install[0]} install failed`)
  }

  if (plan.build && (await needsBuild($, info))) {
    say($, 'building assets')
    must(await run($, plan.build, top, LONG_MS), 'asset build failed')
  }

  const project = basename(main)
  const name = linkName(project, basename(top), top)
  const tool = await findTool($, true)
  const site = tool ? await link($, tool, name, top) : NOT_LINKED

  if (site.url) {
    await setAppUrl($, top, site.url)
  }

  const branch = (await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], top)).stdout.trim()
  const head = (await run($, ['git', 'rev-parse', 'HEAD'], top)).stdout.trim()

  await saveRecord($, { path: top, main, project, branch, base: earlier?.base ?? head, tool, link: site.linked ? name : null, state: 'active', notified: false })
  toast($, site.url ? `Worktree ready at ${site.url}` : 'Worktree ready', 15_000)

  if (site.url) {
    $.ui.log(`${basename(top)} is served at ${site.url}`)
  }

  return site.url
}

async function claimLock($: EngineInterface, lock: string): Promise<boolean> {
  if (passed(await run($, ['mkdir', lock]))) {
    return true
  }

  const made = Number((await run($, ['stat', '-f', '%m', lock])).stdout.trim())

  if (!(made > 0) || (await $.clock.now()) - made * 1000 < STALE_LOCK_MS) {
    return false
  }

  await run($, ['rmdir', lock])

  return passed(await run($, ['mkdir', lock]))
}

async function provision($: EngineInterface, dir: string): Promise<string | null> {
  const info = await worktreeAt($, dir)

  if (!info || !(await has($, info.top, 'artisan'))) {
    return null
  }

  const lock = `${info.gitDir}/${PLUGIN}.lock`

  if (!(await claimLock($, lock))) {
    toast($, `another setup is running at ${lock}`, 10_000)

    return null
  }

  try {
    return await setUp($, info)
  } catch (error) {
    toast($, String(error instanceof Error ? error.message : error), 12_000)

    return null
  } finally {
    say($)
    await run($, ['rmdir', lock])
  }
}

async function dropSite($: EngineInterface, tool: Tool, name: string) {
  await run($, [tool, 'unsecure', name], undefined, SITE_MS)
  await run($, [tool, 'unlink', name], undefined, SITE_MS)
}

async function unlink($: EngineInterface, record: WorktreeRecord): Promise<WorktreeRecord> {
  if (!record.link || !record.tool) {
    return record
  }

  await dropSite($, record.tool, record.link)

  if ((await listLinks($, record.tool))?.some(site => site.name === record.link)) {
    toast($, `${record.link} is still linked after unlink`, 10_000)

    return record
  }

  return { ...record, link: null }
}

async function isMerged($: EngineInterface, record: WorktreeRecord): Promise<boolean> {
  if (!record.branch || record.branch === 'HEAD') {
    return false
  }

  const head = await run($, ['git', 'rev-parse', 'HEAD'], record.path)

  if (!passed(head) || (record.base !== undefined && head.stdout.trim() === record.base)) {
    return false
  }

  const origin = await run($, ['git', '-C', record.main, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])

  for (const ref of [...(passed(origin) ? [origin.stdout.trim()] : []), 'main', 'master']) {
    if (passed(await run($, ['git', '-C', record.main, 'merge-base', '--is-ancestor', record.branch, ref]))) {
      return true
    }
  }

  return false
}

async function tryRemove($: EngineInterface, record: WorktreeRecord) {
  const forget = () => $.store.delete(recordKey(record.path))

  if (!underWorktrees(record.main, record.path)) {
    await forget()

    return
  }

  if (!(await $.fs.exists(record.path))) {
    await forget()

    return
  }

  const status = await run($, ['git', 'status', '--porcelain'], record.path)
  const dirty = !passed(status) || status.stdout.trim() !== ''

  if (dirty || !(await isMerged($, record))) {
    if (!record.notified) {
      toast($, `${basename(record.path)} was kept: ${dirty ? 'it has uncommitted changes' : 'its work is not merged into the default branch'}`, 10_000)
      await saveRecord($, { ...record, notified: true })
    }

    return
  }

  if (!passed(await run($, ['git', '-C', record.main, 'worktree', 'remove', record.path]))) {
    toast($, `${basename(record.path)} could not be removed`, 10_000)

    return
  }

  const branchDropped = passed(await run($, ['git', '-C', record.main, 'branch', '-d', record.branch]))

  await forget()
  toast($, branchDropped ? `Removed the finished worktree ${basename(record.path)}` : `Removed ${basename(record.path)}, but its branch ${record.branch} was kept`, 10_000)
}

async function retire($: EngineInterface, top: string, removedByTool: boolean) {
  const record = await readRecord($, top)

  if (!record) {
    return
  }

  // Unlinking goes by site name, so it works after the tool has deleted the directory.
  const unlinked = await unlink($, record)

  if (removedByTool) {
    await $.store.delete(recordKey(top))

    return
  }

  const exited: WorktreeRecord = { ...unlinked, state: 'exited' }

  await saveRecord($, exited)
  await tryRemove($, exited)
}

async function sweep($: EngineInterface) {
  const main = (await $.session.repo().catch(() => null))?.root
  const here = await $.session.cwd()

  if (!main) {
    return
  }

  for (const key of (await $.store.keys()).filter(key => key.startsWith(PREFIX))) {
    const record = (await $.store.get(key)) as WorktreeRecord | undefined

    if (!record || record.main !== main || record.path === here) {
      continue
    }

    if (record.state === 'exited' || !(await $.fs.exists(record.path))) {
      await tryRemove($, await unlink($, record))
    }
  }
}

export const register: Register = (on, options) => {
  configured = String(options.tool ?? 'auto')

  on('session.start', async ($, e, next) => {
    await provision($, await $.session.cwd()).catch(() => undefined)

    $.clock.after(0, () => {
      void sweep($).catch(() => undefined)
    })

    return next(e)
  })

  on('tool.call', { tool: 'EnterWorktree' }, async ($, e, next) => {
    const result = await next(e)
    const entered = outcomeOf(result)?.worktreePath

    if (!entered || deniedOrFailed(result)) {
      return result
    }

    const url = await provision($, entered).catch(() => null)

    if (!url) {
      return result
    }

    return { ...result, context: [...((result as { context?: readonly string[] }).context ?? []), `This worktree is served at ${url}. Tell the user this URL.`] }
  })

  on('tool.call', { tool: 'ExitWorktree' }, async ($, e, next) => {
    const result = await next(e)
    const left = outcomeOf(result)

    if (left?.worktreePath) {
      await retire($, left.worktreePath, (left.action ?? (e as { action?: string }).action) === 'remove').catch(error => toast($, String(error), 10_000))
    }

    return result
  })
}
