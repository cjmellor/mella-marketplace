import { describe, expect, test } from 'claude-code/testing'

import { cargoEdition, fixersFor, hasFmtBlock, ignoredBy, packageManagerFrom, pintBlade, projectDenial, pythonFormatter, stringArray, withNoInteraction } from './project'
import type { Project } from './project'

const ROOT = '/dev/app'

const bare: Project = {
  root: ROOT,
  laravel: false,
  packageManager: null,
  homebrewValet: false,
  forbidsNoFf: false,
  pint: null,
  sheath: false,
  vp: null,
  biome: null,
  prettier: null,
  gofmt: null,
  rustfmt: null,
  python: null,
  swiftFormat: null,
}

const laravel: Project = {
  ...bare,
  laravel: true,
  packageManager: 'bun',
  homebrewValet: true,
  pint: { notPaths: ['tests/TestCase.php', 'tmp'], blade: true },
  sheath: true,
  vp: { bin: `${ROOT}/node_modules/.bin/vp`, ignore: ['/.ai', '/storage', 'dist'] },
}

const names = (file: string, project: Project) => fixersFor(file, project).map(fixer => fixer.name)

describe('command rules', () => {
  test('pint --test is refused wherever pint is installed', () => {
    expect(projectDenial('vendor/bin/pint --test', laravel)).toContain('--dirty')
    expect(projectDenial('vendor/bin/pint --parallel --test', laravel)).toContain('--dirty')
    expect(projectDenial('vendor/bin/pint --dirty --format agent', laravel)).toBeUndefined()
    expect(projectDenial('vendor/bin/pint --test', bare)).toBeUndefined()
  })

  test('--coverage with --tia is refused in either order', () => {
    expect(projectDenial('vendor/bin/pest --parallel --tia --coverage', bare)).toContain('--fresh')
    expect(projectDenial('vendor/bin/pest --coverage --tia', bare)).toContain('--fresh')
    expect(projectDenial('vendor/bin/pest --parallel --tia --fresh', bare)).toBeUndefined()
    expect(projectDenial('vendor/bin/pest --coverage --no-tia', bare)).toBeUndefined()
  })

  test('the lockfile picks the package manager and the others are refused', () => {
    expect(projectDenial('npm install', laravel)).toContain('uses bun')
    expect(projectDenial('npx prettier --check .', laravel)).toContain('uses bun')
    expect(projectDenial('composer install && npm run build', laravel)).toContain('uses bun')
    expect(projectDenial('yarn add x', laravel)).toContain('uses bun')
    expect(projectDenial('bun run build', laravel)).toBeUndefined()
    expect(projectDenial('npm view vite version', laravel)).toBeUndefined()

    const pnpm = { ...bare, packageManager: 'pnpm' as const }

    expect(projectDenial('npm install', pnpm)).toContain('uses pnpm')
    expect(projectDenial('bunx tsc', pnpm)).toContain('uses pnpm')
    expect(projectDenial('pnpm install', pnpm)).toBeUndefined()

    expect(projectDenial('npm install', bare)).toBeUndefined()
    expect(projectDenial('rg npm package.json', laravel)).toBeUndefined()
  })

  test('bare valet is refused when the Homebrew valet exists', () => {
    expect(projectDenial('valet links', laravel)).toContain('/opt/homebrew/bin/valet')
    expect(projectDenial('/opt/homebrew/bin/valet links', laravel)).toBeUndefined()
    expect(projectDenial('valet links', bare)).toBeUndefined()
  })
})

describe('--no-interaction', () => {
  test('is appended to a lone artisan command', () => {
    expect(withNoInteraction('php artisan make:model Tag', laravel)).toBe('php artisan make:model Tag --no-interaction')
    expect(withNoInteraction('php -d memory_limit=-1 artisan migrate', laravel)).toBe('php -d memory_limit=-1 artisan migrate --no-interaction')
    expect(withNoInteraction('./artisan migrate:fresh --seed  ', laravel)).toBe('./artisan migrate:fresh --seed --no-interaction')
  })

  test('is left alone when present, compound, or outside Laravel', () => {
    expect(withNoInteraction('php artisan migrate --no-interaction', laravel)).toBeUndefined()
    expect(withNoInteraction('php artisan migrate -n', laravel)).toBeUndefined()
    expect(withNoInteraction('php artisan test && vendor/bin/pint', laravel)).toBeUndefined()
    expect(withNoInteraction('php artisan test | tail -5', laravel)).toBeUndefined()
    expect(withNoInteraction('php artisan test > /tmp/t.log', laravel)).toBeUndefined()
    expect(withNoInteraction('php artisan migrate', bare)).toBeUndefined()
    expect(withNoInteraction('composer install', laravel)).toBeUndefined()
  })
})

describe('fixers in a Laravel project', () => {
  test('a PHP file gets pint', () => {
    expect(names(`${ROOT}/app/Models/User.php`, laravel)).toEqual(['pint'])
    expect(fixersFor(`${ROOT}/app/Models/User.php`, laravel)[0]?.argv).toEqual([`${ROOT}/vendor/bin/pint`, '--format', 'agent', `${ROOT}/app/Models/User.php`])
  })

  test('a Blade file gets pint (laravel_blade) and sheath, not vp', () => {
    expect(names(`${ROOT}/resources/views/welcome.blade.php`, laravel)).toEqual(['pint', 'sheath'])
    expect(names(`${ROOT}/resources/views/welcome.blade.php`, { ...laravel, pint: { notPaths: [], blade: false } })).toEqual(['sheath'])
  })

  test("pint's notPath is respected", () => {
    expect(names(`${ROOT}/tests/TestCase.php`, laravel)).toEqual([])
    expect(names(`${ROOT}/tmp/scratch.php`, laravel)).toEqual([])
  })

  test('JS, CSS, JSON and Markdown get vp fmt unless ignored', () => {
    expect(names(`${ROOT}/resources/js/app.ts`, laravel)).toEqual(['vp fmt'])
    expect(names(`${ROOT}/resources/css/app.css`, laravel)).toEqual(['vp fmt'])
    expect(names(`${ROOT}/README.md`, laravel)).toEqual(['vp fmt'])
    expect(names(`${ROOT}/.ai/rules/x.json`, laravel)).toEqual([])
    expect(names(`${ROOT}/storage/app/x.js`, laravel)).toEqual([])
  })
})

describe('fixers in other projects', () => {
  test('biome wins over prettier for JS, prettier covers the rest', () => {
    const both = { ...bare, biome: { bin: 'biome' }, prettier: { bin: 'prettier' } }

    expect(names(`${ROOT}/src/app.ts`, both)).toEqual(['biome'])
    expect(names(`${ROOT}/src/app.ts`, { ...bare, prettier: { bin: 'prettier' } })).toEqual(['prettier'])
    expect(names(`${ROOT}/resources/views/home.blade.php`, { ...bare, prettier: { bin: 'prettier' } })).toEqual(['prettier'])
    expect(fixersFor(`${ROOT}/src/app.ts`, both)[0]?.argv).toEqual(['biome', 'format', '--write', `${ROOT}/src/app.ts`])
  })

  test('go, rust, python and swift files get their formatter', () => {
    const polyglot: Project = {
      ...bare,
      gofmt: { bin: '/usr/local/go/bin/gofmt' },
      rustfmt: { bin: '/u/.cargo/bin/rustfmt', edition: '2021' },
      python: { bin: `${ROOT}/.venv/bin/ruff`, tool: 'ruff' },
      swiftFormat: { bin: '/usr/bin/swift-format' },
    }

    expect(fixersFor(`${ROOT}/cmd/main.go`, polyglot)[0]?.argv).toEqual(['/usr/local/go/bin/gofmt', '-w', `${ROOT}/cmd/main.go`])
    expect(fixersFor(`${ROOT}/src/lib.rs`, polyglot)[0]?.argv).toEqual(['/u/.cargo/bin/rustfmt', '--edition', '2021', `${ROOT}/src/lib.rs`])
    expect(fixersFor(`${ROOT}/app/main.py`, polyglot)[0]?.argv).toEqual([`${ROOT}/.venv/bin/ruff`, 'format', `${ROOT}/app/main.py`])
    expect(fixersFor(`${ROOT}/Sources/App.swift`, polyglot)[0]?.argv).toEqual(['/usr/bin/swift-format', 'format', '--in-place', `${ROOT}/Sources/App.swift`])
    expect(fixersFor(`${ROOT}/app/main.py`, { ...bare, python: { bin: 'black', tool: 'black' } })[0]?.argv).toEqual(['black', '--quiet', `${ROOT}/app/main.py`])
  })

  test('a project with no formatter set up runs nothing', () => {
    for (const file of ['app/User.php', 'src/app.ts', 'main.go', 'lib.rs', 'main.py', 'App.swift', 'README.md']) {
      expect(names(`${ROOT}/${file}`, bare)).toEqual([])
    }
  })

  test('dependency and build folders, and files outside the project, are skipped', () => {
    const all = { ...laravel, gofmt: { bin: 'gofmt' }, rustfmt: { bin: 'rustfmt', edition: null }, python: { bin: 'ruff', tool: 'ruff' as const } }

    expect(names(`${ROOT}/vendor/laravel/framework/src/x.php`, all)).toEqual([])
    expect(names(`${ROOT}/node_modules/x/index.js`, all)).toEqual([])
    expect(names(`${ROOT}/target/debug/build.rs`, all)).toEqual([])
    expect(names(`${ROOT}/.venv/lib/x.py`, all)).toEqual([])
    expect(names('/tmp/other/User.php', all)).toEqual([])
  })
})

describe('config parsing', () => {
  test('reads string arrays from JSON and JS', () => {
    expect(stringArray('{"notPath": ["a.php", "tmp"]}', 'notPath')).toEqual(['a.php', 'tmp'])
    expect(stringArray("fmt: { ignorePatterns: ['/.ai', '/.claude'] }", 'ignorePatterns')).toEqual(['/.ai', '/.claude'])
    expect(stringArray('{}', 'notPath')).toEqual([])
  })

  test('spots the fmt block and laravel_blade', () => {
    expect(hasFmtBlock('export default defineConfig({ fmt: { printWidth: 120 } })')).toBe(true)
    expect(hasFmtBlock('export default defineConfig({ lint: {} })')).toBe(false)
    expect(pintBlade('{"rules": {"Pint/laravel_blade": true}}')).toBe(true)
    expect(pintBlade('{"preset": "laravel"}')).toBe(false)
  })

  test('reads the package manager from packageManager, then the lockfile', () => {
    expect(packageManagerFrom(new Set(['bun.lock']), '')).toBe('bun')
    expect(packageManagerFrom(new Set(['pnpm-lock.yaml']), '')).toBe('pnpm')
    expect(packageManagerFrom(new Set(['yarn.lock']), '')).toBe('yarn')
    expect(packageManagerFrom(new Set(['package-lock.json']), '')).toBe('npm')
    expect(packageManagerFrom(new Set(['package-lock.json']), '{"packageManager": "pnpm@9.1.0"}')).toBe('pnpm')
    expect(packageManagerFrom(new Set(['composer.lock']), '')).toBeNull()
  })

  test('reads the Rust edition and the Python formatter', () => {
    expect(cargoEdition('[package]\nname = "x"\nedition = "2021"\n')).toBe('2021')
    expect(cargoEdition('[package]\nname = "x"\n')).toBeNull()
    expect(pythonFormatter('[tool.ruff]\nline-length = 100', false)).toBe('ruff')
    expect(pythonFormatter('', true)).toBe('ruff')
    expect(pythonFormatter('[tool.black]\nline-length = 100', false)).toBe('black')
    expect(pythonFormatter('[project]\nname = "x"', false)).toBeNull()
  })

  test('ignore patterns anchor with a leading slash', () => {
    expect(ignoredBy(['/storage'], 'storage/app/x.js')).toBe(true)
    expect(ignoredBy(['/storage'], 'app/storage/x.js')).toBe(false)
    expect(ignoredBy(['dist'], 'public/dist/x.js')).toBe(true)
  })
})
