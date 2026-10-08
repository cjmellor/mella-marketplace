export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'

export type Project = {
  root: string
  laravel: boolean
  packageManager: PackageManager | null
  homebrewValet: boolean
  forbidsNoFf: boolean
  pint: { notPaths: string[]; blade: boolean } | null
  sheath: boolean
  vp: { bin: string; ignore: string[] } | null
  biome: { bin: string } | null
  prettier: { bin: string } | null
  gofmt: { bin: string } | null
  rustfmt: { bin: string; edition: string | null } | null
  python: { bin: string; tool: 'ruff' | 'black' } | null
  swiftFormat: { bin: string } | null
}

export type Fixer = { name: string; argv: string[] }

export const LOCKFILES: readonly [string, PackageManager][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const RUNNERS: Record<PackageManager, RegExp> = {
  bun: /\bbunx?\b/,
  pnpm: /\bpnpx?\b/,
  yarn: /\byarn\b/,
  npm: /\bnp[mx]\b/,
}

const USE: Record<PackageManager, string> = {
  bun: 'bun / bun run / bunx',
  pnpm: 'pnpm / pnpm run / pnpm dlx',
  yarn: 'yarn / yarn run / yarn dlx',
  npm: 'npm / npm run / npx',
}

const STARTS = String.raw`(?:^|[|;&(]\s*)`

const PHP = /\.php$/
const BLADE = /\.blade\.php$/
const WEB_FILES = /\.(?:[cm]?[jt]sx?|css|scss|json|jsonc|vue|svelte|md|html?)$/
const BIOME_FILES = /\.(?:[cm]?[jt]sx?|css|json|jsonc)$/
const PRETTIER_FILES = /\.(?:blade\.php|[cm]?[jt]sx?|css|scss|json|vue|svelte|md|html?|ya?ml)$/

const COMPOUND = /&&|\|\||[;|\n`]|\$\(|<<|>/
const ARTISAN = /^\s*(?:\S*php\s+(?:-d\s+\S+\s+)*)?(?:\.\/)?artisan\s+\S+/

export function projectDenial(command: string, project: Project): string | undefined {
  if (/--tia\b[^|;&\n]*--coverage\b|--coverage\b[^|;&\n]*--tia\b/.test(command)) {
    return 'Never combine --coverage with --tia. Re-record with --parallel --tia --fresh.'
  }

  if (project.pint && /\bpint\b[^|;&\n]*\s--test\b/.test(command)) {
    return 'Do not run pint --test. Run vendor/bin/pint --dirty --format agent to fix the style.'
  }

  const manager = project.packageManager

  if (manager) {
    const other = (Object.keys(RUNNERS) as PackageManager[]).find(name => name !== manager && new RegExp(`${STARTS}${RUNNERS[name].source}`).test(command))

    if (other && !(manager === 'bun' && other === 'npm' && /^\s*npm\s+(?:view|info|search)\b/.test(command))) {
      return `This project uses ${manager} (its lockfile says so). Use ${USE[manager]} instead of ${other}.`
    }
  }

  if (project.homebrewValet && new RegExp(`${STARTS}valet\\b`).test(command)) {
    return 'Run Valet as /opt/homebrew/bin/valet. Bare valet resolves to the Composer copy and asks for a password.'
  }

  return undefined
}

export function withNoInteraction(command: string, project: Project): string | undefined {
  if (!project.laravel || COMPOUND.test(command) || !ARTISAN.test(command)) {
    return undefined
  }

  if (/(?:^|\s)(?:--no-interaction|-n)(?:\s|$)/.test(command)) {
    return undefined
  }

  return `${command.trimEnd()} --no-interaction`
}

const relative = (root: string, file: string) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file)

export function ignoredBy(patterns: string[], rel: string): boolean {
  return patterns.some(pattern => {
    const clean = pattern.replace(/\/+$/, '')

    if (clean.startsWith('/')) {
      const anchored = clean.slice(1)

      return rel === anchored || rel.startsWith(`${anchored}/`)
    }

    return rel === clean || rel.startsWith(`${clean}/`) || rel.includes(`/${clean}/`) || rel.endsWith(`/${clean}`)
  })
}

function webFormatter(file: string, project: Project): Fixer | undefined {
  const rel = relative(project.root, file)

  if (project.vp && WEB_FILES.test(file) && !BLADE.test(file)) {
    return ignoredBy(project.vp.ignore, rel) ? undefined : { name: 'vp fmt', argv: [project.vp.bin, 'fmt', file] }
  }

  if (project.biome && BIOME_FILES.test(file)) {
    return { name: 'biome', argv: [project.biome.bin, 'format', '--write', file] }
  }

  if (!project.vp && !project.biome && project.prettier && PRETTIER_FILES.test(file) && !(BLADE.test(file) && project.pint?.blade)) {
    return { name: 'prettier', argv: [project.prettier.bin, '--write', file] }
  }

  return undefined
}

export function fixersFor(file: string, project: Project): Fixer[] {
  const rel = relative(project.root, file)
  const fixers: Fixer[] = []

  if (rel === file || /^(?:vendor|node_modules|target|\.venv|venv|build|dist)\//.test(rel)) {
    return fixers
  }

  if (project.pint && PHP.test(file) && (!BLADE.test(file) || project.pint.blade) && !ignoredBy(project.pint.notPaths, rel)) {
    fixers.push({ name: 'pint', argv: [`${project.root}/vendor/bin/pint`, '--format', 'agent', file] })
  }

  if (project.sheath && BLADE.test(file)) {
    fixers.push({ name: 'sheath', argv: ['php', '-d', 'memory_limit=-1', 'artisan', 'sheath:lint', '--fix', file] })
  }

  const web = webFormatter(file, project)

  if (web) {
    fixers.push(web)
  }

  if (project.gofmt && file.endsWith('.go')) {
    fixers.push({ name: 'gofmt', argv: [project.gofmt.bin, '-w', file] })
  }

  if (project.rustfmt && file.endsWith('.rs')) {
    fixers.push({ name: 'rustfmt', argv: [project.rustfmt.bin, ...(project.rustfmt.edition ? ['--edition', project.rustfmt.edition] : []), file] })
  }

  if (project.python && /\.pyi?$/.test(file)) {
    fixers.push({ name: project.python.tool, argv: project.python.tool === 'ruff' ? [project.python.bin, 'format', file] : [project.python.bin, '--quiet', file] })
  }

  if (project.swiftFormat && file.endsWith('.swift')) {
    fixers.push({ name: 'swift-format', argv: [project.swiftFormat.bin, 'format', '--in-place', file] })
  }

  return fixers
}

export function stringArray(source: string, key: string): string[] {
  const list = source.match(new RegExp(`["']?${key}["']?\\s*:\\s*\\[([^\\]]*)\\]`))?.[1] ?? ''

  return [...list.matchAll(/["']([^"']+)["']/g)].map(match => match[1] ?? '').filter(Boolean)
}

export function hasFmtBlock(viteConfig: string): boolean {
  return /\bfmt\s*:\s*\{/.test(viteConfig)
}

export function pintBlade(pintJson: string): boolean {
  return /"Pint\/laravel_blade"\s*:\s*true/.test(pintJson)
}

export function cargoEdition(cargoToml: string): string | null {
  return cargoToml.match(/^\s*edition\s*=\s*["'](\d{4})["']/m)?.[1] ?? null
}

export function pythonFormatter(pyproject: string, hasRuffConfig: boolean): 'ruff' | 'black' | null {
  if (hasRuffConfig || /^\[tool\.ruff(?:\.format)?\]/m.test(pyproject)) {
    return 'ruff'
  }

  return /^\[tool\.black\]/m.test(pyproject) ? 'black' : null
}

export function packageManagerFrom(present: ReadonlySet<string>, packageJson: string): PackageManager | null {
  const declared = packageJson.match(/"packageManager"\s*:\s*"(bun|pnpm|yarn|npm)@/)?.[1] as PackageManager | undefined

  return declared ?? LOCKFILES.find(([file]) => present.has(file))?.[1] ?? null
}
