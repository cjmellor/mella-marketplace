import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { gitDenial } from './git'
import { cargoEdition, fixersFor, hasFmtBlock, packageManagerFrom, pintBlade, projectDenial, pythonFormatter, stringArray, withNoInteraction } from './project'
import type { Fixer, Project } from './project'
import { SCRIPT_EDIT_HINT, inProject, inlineScript, scriptFiles, shellDenial, writtenPaths } from './shell'

const PLUGIN = 'guardrails'
const FIXER_MS = 60_000
const REPORT_CHARS = 1_500
const SCRIPT_READ_LIMIT = 200_000
const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const COMMIT_SKILL = /(?:^|:)commit$/
const COMMIT_COMMAND = /^\s*\/(?:[\w-]+:)?commit(?:\s|$)/

const lastPrompt = atom({ plugin: 'guardrails', key: 'lastPrompt' } as const, '')
const committing = atom({ plugin: 'guardrails', key: 'committing' } as const, false)

type Outcome = { exitCode: number; stdout: string; stderr: string }

async function run($: EngineInterface, argv: string[], cwd?: string, timeoutMs?: number): Promise<Outcome> {
  try {
    return await $.process.run(argv, { ...(cwd ? { cwd } : {}), ...(timeoutMs ? { timeoutMs } : {}) })
  } catch (error) {
    return { exitCode: 127, stdout: '', stderr: String(error) }
  }
}

const dirname = (path: string) => path.replace(/\/[^/]*$/, '') || '/'

const readText = async ($: EngineInterface, path: string) => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : '')

async function firstExisting($: EngineInterface, paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (await $.fs.exists(path)) {
      return path
    }
  }

  return undefined
}

async function rootOf($: EngineInterface, dir: string): Promise<string> {
  const outcome = await run($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'])

  return outcome.exitCode === 0 && outcome.stdout.trim() !== '' ? outcome.stdout.trim() : dir
}

const onPath = new Map<string, string | null>()

async function which($: EngineInterface, name: string): Promise<string | null> {
  if (!onPath.has(name)) {
    const outcome = await run($, ['sh', '-c', `command -v ${name}`])

    onPath.set(name, outcome.exitCode === 0 && outcome.stdout.trim() !== '' ? outcome.stdout.trim() : null)
  }

  return onPath.get(name) ?? null
}

const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
]

async function inspect($: EngineInterface, dir: string): Promise<Project> {
  const root = await rootOf($, dir)
  const at = (rel: string) => `${root}/${rel}`
  const top = new Set((await $.fs.list(root).catch(() => [])).map(entry => entry.name))
  const text = (rel: string) => (top.has(rel) ? readText($, at(rel)) : Promise.resolve(''))
  const instructions = `${await text('CLAUDE.md')}\n${await text('AGENTS.md')}`
  const packageJson = await text('package.json')
  const pintJson = await text('pint.json')
  const viteFile = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].find(name => top.has(name))
  const viteConfig = viteFile ? await text(viteFile) : ''
  const local = async (bin: string) => ((await $.fs.exists(at(`node_modules/.bin/${bin}`))) ? at(`node_modules/.bin/${bin}`) : null)
  const pythonTool = pythonFormatter(await text('pyproject.toml'), top.has('ruff.toml') || top.has('.ruff.toml'))
  const pythonBin = pythonTool ? ((await firstExisting($, [at(`.venv/bin/${pythonTool}`), at(`venv/bin/${pythonTool}`)])) ?? (await which($, pythonTool))) : null
  const vpBin = viteFile && hasFmtBlock(viteConfig) ? await local('vp') : null
  const biomeBin = top.has('biome.json') || top.has('biome.jsonc') ? await local('biome') : null
  const prettierBin = PRETTIER_CONFIGS.some(name => top.has(name)) || /"prettier"\s*:\s*\{/.test(packageJson) ? await local('prettier') : null
  const gofmtBin = top.has('go.mod') ? await which($, 'gofmt') : null
  const rustfmtBin = top.has('Cargo.toml') ? await which($, 'rustfmt') : null
  const swiftFormatBin = top.has('.swift-format') ? await which($, 'swift-format') : null

  return {
    root,
    laravel: top.has('artisan'),
    packageManager: packageManagerFrom(top, packageJson),
    homebrewValet: await $.fs.exists('/opt/homebrew/bin/valet'),
    forbidsNoFf: /--no-ff\b/.test(instructions),
    pint: (await $.fs.exists(at('vendor/bin/pint'))) ? { notPaths: stringArray(pintJson, 'notPath'), blade: pintBlade(pintJson) } : null,
    sheath: top.has('artisan') && (await $.fs.exists(at('config/sheath.php'))),
    vp: vpBin ? { bin: vpBin, ignore: stringArray(viteConfig, 'ignorePatterns') } : null,
    biome: biomeBin ? { bin: biomeBin } : null,
    prettier: prettierBin ? { bin: prettierBin } : null,
    gofmt: gofmtBin ? { bin: gofmtBin } : null,
    rustfmt: rustfmtBin ? { bin: rustfmtBin, edition: cargoEdition(await text('Cargo.toml')) } : null,
    python: pythonTool && pythonBin ? { bin: pythonBin, tool: pythonTool } : null,
    swiftFormat: swiftFormatBin ? { bin: swiftFormatBin } : null,
  }
}

let commitSkill: string | null | undefined

async function findCommitSkill($: EngineInterface): Promise<string | null> {
  if (commitSkill === undefined) {
    const commands = await $.command.list().catch(() => [])

    commitSkill = commands.map(command => command.name).find(name => COMMIT_SKILL.test(name)) ?? null
  }

  return commitSkill
}

const deniedOrFailed = (result: unknown): boolean => {
  const shape = result as { deny?: unknown; isError?: unknown } | undefined

  return shape?.deny !== undefined || shape?.isError === true
}

const clip = (text: string) => (text.length > REPORT_CHARS ? `${text.slice(0, REPORT_CHARS)}…` : text)

async function applyFixer($: EngineInterface, fixer: Fixer, root: string): Promise<string | undefined> {
  const outcome = await run($, fixer.argv, root, FIXER_MS)
  const output = `${outcome.stdout}\n${outcome.stderr}`.trim()

  if (outcome.exitCode === 0 && output === '') {
    return undefined
  }

  return `${PLUGIN}: ${fixer.name} ran on the file you just changed (exit ${outcome.exitCode}). Re-read the file before you edit it again.\n${clip(output)}`
}

async function scriptDenial($: EngineInterface, command: string, cwd: string, root: string): Promise<string | undefined> {
  const sources: [string, string][] = []
  const inline = inlineScript(command)

  if (inline) {
    sources.push(['This script', inline])
  }

  for (const path of scriptFiles(command)) {
    const source = await readText($, path.startsWith('/') ? path : `${cwd}/${path}`)

    if (source.length <= SCRIPT_READ_LIMIT) {
      sources.push([path, source])
    }
  }

  const candidates = sources.map(([label, source]) => [label, writtenPaths(source)] as const).filter(([, paths]) => paths.length > 0)

  if (candidates.length === 0) {
    return undefined
  }

  const topLevel = new Set((await $.fs.list(cwd).catch(() => [])).map(entry => entry.name))

  for (const [label, paths] of candidates) {
    const target = paths.find(path => inProject(path, root, topLevel))

    if (target) {
      return `${label} writes ${target}. ${SCRIPT_EDIT_HINT}`
    }
  }

  return undefined
}

async function fix<T>($: EngineInterface, file: string, result: T): Promise<T> {
  if (deniedOrFailed(result)) {
    return result
  }

  const project = await inspect($, dirname(file))
  const reports: string[] = []

  for (const fixer of fixersFor(file, project)) {
    const report = await applyFixer($, fixer, project.root)

    if (report) {
      reports.push(report)
    }
  }

  if (reports.length === 0) {
    return result
  }

  return { ...result, context: [...((result as { context?: readonly string[] }).context ?? []), ...reports] }
}

export const register: Register = (on, options) => {
  const enabled = {
    git: options.git !== false,
    shell: options.shell !== false,
    project: options.project !== false,
  }

  on('prompt.submit', async ($, e, next) => {
    if (HUMAN_ORIGINS.has(e.origin.kind)) {
      await update($, lastPrompt, () => e.text)

      if (COMMIT_COMMAND.test(e.text)) {
        await update($, committing, () => true)
      }
    }

    return next(e)
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.tool === 'Skill' && COMMIT_SKILL.test(e.skill)) {
      await update($, committing, () => true)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, committing, () => false)
    }

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash') {
      return next(e)
    }

    const cwd = await $.session.cwd()
    const project = enabled.project || enabled.git ? await inspect($, cwd) : null

    const denial =
      (enabled.git && project
        ? gitDenial(e.command, {
            lastPrompt: await read($, lastPrompt),
            committing: await read($, committing),
            commitSkill: await findCommitSkill($),
            forbidsNoFf: project.forbidsNoFf,
          })
        : undefined) ??
      (enabled.shell ? (shellDenial(e.command) ?? (await scriptDenial($, e.command, cwd, project?.root ?? (await rootOf($, cwd))))) : undefined) ??
      (enabled.project && project ? projectDenial(e.command, project) : undefined)

    if (denial) {
      return { deny: `${PLUGIN}: ${denial}` }
    }

    const rewritten = enabled.project && project ? withNoInteraction(e.command, project) : undefined

    return next(rewritten ? { ...e, command: rewritten } : e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${PLUGIN}: the guard failed on this command, so it did not run. Ask the user.` }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)

    return enabled.project && e.tool === 'Edit' ? fix($, e.file_path, result) : result
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)

    return enabled.project && e.tool === 'Write' ? fix($, e.file_path, result) : result
  })
}
