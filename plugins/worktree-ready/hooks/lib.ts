export type Tool = 'valet'

export type Link = { name: string; secure: boolean; url: string; path: string }

export type WorktreeInfo = { top: string; gitDir: string; main: string }

export type WorktreeRecord = {
  path: string
  main: string
  project: string
  branch: string
  base?: string
  tool: Tool | null
  link: string | null
  state: 'active' | 'exited'
  notified: boolean
}

export type JsPlan = { lock: string | null; install: string[] | null; build: string[] | null }

// Never add public/hot or bootstrap/cache: they carry main's dev-server URL and its cached config.
export const CLONES = ['vendor', 'node_modules', 'public/build']

const ANSI = /\u001b\[[0-9;]*m/g

const JS_LOCKS: [string, string[], string[]][] = [
  ['bun.lock', ['bun', 'install', '--frozen-lockfile'], ['bun', 'run', 'build']],
  ['bun.lockb', ['bun', 'install', '--frozen-lockfile'], ['bun', 'run', 'build']],
  ['pnpm-lock.yaml', ['pnpm', 'install', '--frozen-lockfile'], ['pnpm', 'run', 'build']],
  ['yarn.lock', ['yarn', 'install', '--frozen-lockfile'], ['yarn', 'run', 'build']],
  ['package-lock.json', ['npm', 'ci'], ['npm', 'run', 'build']],
]

export const JS_LOCK_FILES = JS_LOCKS.map(([lock]) => lock)

export const ASSET_INPUTS = ['resources', 'package.json', ...JS_LOCK_FILES, 'vite.config.*', 'tailwind.config.*', 'postcss.config.*', 'tsconfig.json']

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const parts = (text: string): string[] => slug(text).replaceAll('worktree', '').split('-').filter(Boolean)

const hash = (text: string): string => {
  let value = 5381

  for (const char of text) {
    value = ((value * 33) ^ char.charCodeAt(0)) >>> 0
  }

  return value.toString(36).slice(0, 6)
}

export const linkName = (project: string, worktree: string, path: string): string => {
  const own = parts(worktree)
  const name = [...parts(project), ...(own.length > 0 ? own : [hash(path)])].join('-')

  return name.slice(0, 60).replace(/-+$/, '')
}

export const parseLinks = (stdout: string): Link[] =>
  stdout
    .replace(ANSI, '')
    .split('\n')
    .filter(line => line.trim().startsWith('|'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 4 && cells[0] !== 'Site')
    .map(([name = '', ssl = '', url = '', path = '']) => ({ name, secure: ssl !== '', url, path }))

export const parseWorktree = (revParse: string): WorktreeInfo | null => {
  const [top, gitDir, commonDir] = revParse.split('\n').map(line => line.trim())

  if (!top || !gitDir || !commonDir || gitDir === commonDir) {
    return null
  }

  return { top, gitDir, main: commonDir.replace(/\/\.git\/?$/, '') }
}

export const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

export type WorktreeLock = { kind: 'none' } | { kind: 'session'; pid: number } | { kind: 'other' }

export const lockOf = (porcelain: string, path: string): WorktreeLock => {
  const block = porcelain.split('\n\n').find(entry => entry.split('\n')[0] === `worktree ${path}`)
  const locked = block?.split('\n').find(line => line === 'locked' || line.startsWith('locked '))

  if (locked === undefined) {
    return { kind: 'none' }
  }

  const pid = /^locked claude session .*\(pid (\d+)\b/.exec(locked)?.[1]

  return pid ? { kind: 'session', pid: Number(pid) } : { kind: 'other' }
}

export const underWorktrees =(main: string, path: string): boolean => path.startsWith(`${main}/.claude/worktrees/`)

export const jsPlan = (files: string[], hasBuild: boolean): JsPlan => {
  const found = JS_LOCKS.find(([lock]) => files.includes(lock))

  if (!found) {
    return { lock: null, install: null, build: null }
  }

  return { lock: found[0], install: found[1], build: hasBuild ? found[2] : null }
}

export const sitesDir = (home: string): string => `${home}/.config/valet/Sites`

export const certBase = (home: string, host: string): string => `${home}/.config/valet/Certificates/${host}`

export const siteFiles = (home: string, host: string): { nginx: string; certs: string[] } => ({
  nginx: `${home}/.config/valet/Nginx/${host}`,
  certs: ['crt', 'key', 'csr', 'conf'].map(extension => `${certBase(home, host)}.${extension}`),
})

export const siteLink = (home: string, name: string): string => `${sitesDir(home)}/${name}`

export const SCAN_SITES = 'for l in "$1"/*; do [ -L "$l" ] && printf "%s\\t%s\\n" "${l##*/}" "$(readlink "$l")"; done; true'

export const parseSiteScan = (stdout: string): { name: string; path: string }[] =>
  stdout
    .split('\n')
    .filter(line => line.includes('\t'))
    .map(line => {
      const [name = '', path = ''] = line.split('\t')

      return { name, path }
    })

export const isProxy =(nginxConfig: string): boolean => nginxConfig.includes('proxy_pass')

export const inWorktrees = (path: string): boolean => path.includes('/.claude/worktrees/')

export const setEnv = (text: string, key: string, value: string): string => {
  const line = `${key}=${/\s/.test(value) ? `"${value}"` : value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  if (pattern.test(text)) {
    return text.replace(pattern, () => line)
  }

  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`
}

export const shareSqlite = (text: string, mainDatabase: string): string => {
  const sqlite = /^DB_CONNECTION=["']?sqlite/m.test(text)
  const absolute = /^DB_DATABASE=["']?\//m.test(text)

  return sqlite && !absolute ? setEnv(text, 'DB_DATABASE', mainDatabase) : text
}
