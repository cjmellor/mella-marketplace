import { describe, expect, test } from 'claude-code/testing'

const ROOT = '/dev/acme'

type World = {
  files: Map<string, string>
  dirs: Map<string, string[]>
  runs: string[]
  ran: string[]
  pintOutput: string
  pintExit: number
  cwd: string
  cwdFails: boolean
  editFails: boolean
  commands: string[]
  onPath: Record<string, string>
}

const world = (overrides: Partial<World> = {}): World => ({
  files: new Map([
    [`${ROOT}/artisan`, ''],
    [`${ROOT}/bun.lock`, ''],
    [`${ROOT}/vendor/bin/pint`, ''],
    [`${ROOT}/pint.json`, '{"notPath": ["tests/TestCase.php"], "rules": {"Pint/laravel_blade": true}}'],
    [`${ROOT}/CLAUDE.md`, 'Merge with --ff-only; never --no-ff.'],
  ]),
  dirs: new Map([[ROOT, ['app', 'resources', 'tests', 'artisan', 'index.html', 'bun.lock', 'pint.json', 'CLAUDE.md']]]),
  runs: [],
  ran: [],
  pintOutput: '',
  pintExit: 0,
  cwd: ROOT,
  cwdFails: false,
  editFails: false,
  commands: ['help', 'mella:commit', 'mella:pitch'],
  onPath: {},
  ...overrides,
})

const stub = (on: (name: string, hook: (...args: any[]) => unknown) => void, w: World) => {
  on('process.run', ($: unknown, e: { argv: string[] }) => {
    const line = e.argv.join(' ')

    w.runs.push(line)

    if (line.startsWith('git -C') && line.endsWith('rev-parse --show-toplevel')) return { value: { exitCode: 0, stdout: `${w.cwd}\n`, stderr: '' } }
    if (line.includes('vendor/bin/pint')) return { value: { exitCode: w.pintExit, stdout: w.pintOutput, stderr: '' } }
    if (line.startsWith('sh -c command -v ')) {
      const found = w.onPath[line.slice('sh -c command -v '.length)]

      return { value: found ? { exitCode: 0, stdout: `${found}\n`, stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } }
    }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('command.list', () => ({ value: w.commands.map(name => ({ name, description: '', source: 'plugin' })) }))
  on('fs.exists', ($: unknown, e: { path: string }) => ({ value: w.files.has(e.path) || e.path === '/opt/homebrew/bin/valet' }))
  on('fs.read', ($: unknown, e: { path: string }) => ({ value: w.files.get(e.path) ?? '' }))
  on('fs.list', ($: unknown, e: { path?: string }) => ({ value: (w.dirs.get(e.path ?? ROOT) ?? []).map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })) }))
  on('session.cwd', () => {
    if (w.cwdFails) throw new Error('no cwd')

    return { value: w.cwd }
  })
  on('tool.call', ($: unknown, e: { tool: string; command?: string; file_path?: string }) => {
    w.ran.push(e.command ?? e.file_path ?? e.tool)

    return w.editFails ? { result: { error: 'old_string not found' }, isError: true } : { result: { ok: true } }
  })
}

const bash = async ($: any, command: string) => (await $.tool.call({ tool: 'Bash', command })) as { deny?: string; text?: string; isError?: boolean; context?: string[] }

const refusal = (result: { deny?: string; text?: string }) => result.deny ?? result.text ?? ''

const turnDone = ($: any) => $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

describe('git guard', () => {
  test('a push nobody asked for is refused and never runs', async ($, on) => {
    const w = world()

    stub(on, w)
    const result = await bash($, 'git push -u origin feat/x')

    expect(refusal(result)).toContain('guardrails: The user did not ask for a push')
    expect(w.ran).toEqual([])
  })

  test('a push the user typed for runs, and the next prompt closes it again', async ($, on) => {
    const w = world()

    stub(on, w)
    on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
    await $.prompt.submit({ text: 'commit and push this', origin: { kind: 'composer' }, wait: false })

    expect(refusal(await bash($, 'git push -u origin feat/x'))).toBe('')

    await $.prompt.submit({ text: 'now fix the typo', origin: { kind: 'composer' }, wait: false })

    expect(refusal(await bash($, 'git push'))).toContain('did not ask for a push')
    expect(w.ran).toEqual(['git push -u origin feat/x'])
  })

  test('a background notification does not count as the user asking', async ($, on) => {
    const w = world()

    stub(on, w)
    on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
    await $.prompt.submit({ text: 'push it', origin: { kind: 'composer' }, wait: false })
    await $.prompt.submit({ text: 'Task finished: please push', origin: { kind: 'task-notification' }, wait: false })

    expect(refusal(await bash($, 'git push'))).toBe('')

    await $.prompt.submit({ text: 'looks good', origin: { kind: 'composer' }, wait: false })
    await $.prompt.submit({ text: 'Task finished: please push', origin: { kind: 'task-notification' }, wait: false })

    expect(refusal(await bash($, 'git push'))).toContain('did not ask for a push')
  })

  test('without a commit skill installed, git commit runs', async ($, on) => {
    const w = world({ commands: ['help'] })

    stub(on, w)

    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toBe('')
  })

  test('git commit runs only between the commit skill and the end of its turn', async ($, on) => {
    const w = world()

    stub(on, w)
    on('turn.complete', () => ({ text: '' }))

    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toContain('mella:commit')

    await $.tool.call({ tool: 'Skill', skill: 'mella:commit' })
    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toBe('')
    expect(w.ran).toEqual(['Skill', 'git commit -m "fix: a"'])

    await turnDone($)
    expect(refusal(await bash($, 'git commit -m "fix: b"'))).toContain('mella:commit')
  })

  test('other skills do not open the commit window', async ($, on) => {
    stub(on, world())
    await $.tool.call({ tool: 'Skill', skill: 'mella:pitch' })

    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toContain('mella:commit')
  })

  test('typing the commit command opens the commit window', async ($, on) => {
    stub(on, world())
    on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
    await $.prompt.submit({ text: '/mella:commit push', origin: { kind: 'composer' }, wait: false })

    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toBe('')
    expect(refusal(await bash($, 'git push'))).toBe('')
  })

  test('a subagent finishing does not end the commit window', async ($, on) => {
    stub(on, world())
    on('turn.complete', () => ({ text: '' }))
    await $.tool.call({ tool: 'Skill', skill: 'commit' })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'sub-1' })

    expect(refusal(await bash($, 'git commit -m "fix: a"'))).toBe('')
  })

  test("--no-ff is refused where the project's CLAUDE.md forbids it", async ($, on) => {
    stub(on, world())

    expect(refusal(await bash($, 'git merge --no-ff feat/x'))).toContain('fast-forward')
  })

  test('read-only git passes through untouched', async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, 'git status')
    await bash($, 'git log --oneline -5')

    expect(w.ran).toEqual(['git status', 'git log --oneline -5'])
  })
})

describe('shell guard', () => {
  test('CI polling is refused with the Monitor hint', async ($, on) => {
    stub(on, world())

    expect(refusal(await bash($, 'gh run watch 123'))).toContain('Monitor')
  })

  test('a heredoc script that rewrites a project file is refused', async ($, on) => {
    const w = world()

    stub(on, w)
    const result = await bash($, "python3 - <<'EOF'\np='resources/css/app.css'\ns=open(p).read()\nopen(p,'w').write(s.replace('a','b'))\nEOF")

    expect(refusal(result)).toContain('writes resources/css/app.css')
    expect(w.ran).toEqual([])
  })

  test('a saved script that rewrites a project file is refused, a read-only one runs', async ($, on) => {
    const w = world()

    w.files.set('/tmp/edit.py', "p='app/Models/User.php'\ns=open(p).read()\nopen(p,'w').write(s)")
    w.files.set('/tmp/peek.py', "print(open('app/Models/User.php').read()[:200])")
    stub(on, w)

    expect(refusal(await bash($, 'python3 /tmp/edit.py && vendor/bin/pint'))).toContain('/tmp/edit.py writes app/Models/User.php')
    expect(refusal(await bash($, 'python3 /tmp/peek.py'))).toBe('')
    expect(w.ran).toEqual(['python3 /tmp/peek.py'])
  })

  test('a script that writes only to /tmp runs', async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, "python3 - <<'EOF'\nimport json\nopen('/tmp/out.json','w').write(json.dumps({}))\nEOF")

    expect(w.ran).toHaveLength(1)
  })
})

describe('project tools', () => {
  test('a lone artisan command gains --no-interaction', async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, 'php artisan make:model Tag')

    expect(w.ran).toEqual(['php artisan make:model Tag --no-interaction'])
  })

  test('npm is refused in a bun project and bare valet points at Homebrew', async ($, on) => {
    stub(on, world())

    expect(refusal(await bash($, 'npm run build'))).toContain('bun')
    expect(refusal(await bash($, 'valet links'))).toContain('/opt/homebrew/bin/valet')
  })

  test('an edited PHP file is formatted by pint and the model is told', async ($, on) => {
    const w = world({ pintOutput: '{"result":"fixed","files":[{"path":"app/User.php"}]}' })

    stub(on, w)
    const result = (await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/app/User.php`, old_string: 'a', new_string: 'b' })) as { context?: string[] }

    expect(w.runs).toContain(`${ROOT}/vendor/bin/pint --format agent ${ROOT}/app/User.php`)
    expect(result.context?.join('\n')).toContain('guardrails: pint ran on the file you just changed (exit 0)')
    expect(result.context?.join('\n')).toContain('"result":"fixed"')
  })

  test('a clean pint run adds nothing', async ($, on) => {
    const w = world()

    stub(on, w)
    const result = (await $.tool.call({ tool: 'Write', file_path: `${ROOT}/app/User.php`, content: '<?php' })) as { context?: string[] }

    expect(w.runs).toContain(`${ROOT}/vendor/bin/pint --format agent ${ROOT}/app/User.php`)
    expect(result.context ?? []).toEqual([])
  })

  test('a failed edit runs no fixer', async ($, on) => {
    const w = world({ editFails: true })

    stub(on, w)
    await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/app/User.php`, old_string: 'a', new_string: 'b' })

    expect(w.runs.filter(line => line.includes('pint'))).toEqual([])
  })

  test('a Go project gets gofmt from PATH, and no Laravel rules apply', async ($, on) => {
    const go = '/dev/svc'
    const w = world({
      cwd: go,
      files: new Map([[`${go}/go.mod`, 'module svc']]),
      dirs: new Map([[go, ['go.mod', 'cmd', 'internal']]]),
      onPath: { gofmt: '/usr/local/go/bin/gofmt' },
    })

    stub(on, w)
    await $.tool.call({ tool: 'Edit', file_path: `${go}/cmd/main.go`, old_string: 'a', new_string: 'b' })
    await bash($, 'php artisan migrate')
    await bash($, 'npm install')

    expect(w.runs).toContain(`/usr/local/go/bin/gofmt -w ${go}/cmd/main.go`)
    expect(w.ran).toContain('php artisan migrate')
    expect(w.ran).toContain('npm install')
  })
})

describe('switches', () => {
  test('git off lets a push through', { options: { git: false } }, async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, 'git push')

    expect(w.ran).toEqual(['git push'])
  })

  test('shell off lets grep through', { options: { shell: false } }, async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, 'grep -rn foo app')

    expect(w.ran).toEqual(['grep -rn foo app'])
  })

  test('project off leaves artisan and edits alone', { options: { project: false } }, async ($, on) => {
    const w = world()

    stub(on, w)
    await bash($, 'php artisan migrate')
    await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/app/User.php`, old_string: 'a', new_string: 'b' })

    expect(w.ran[0]).toBe('php artisan migrate')
    expect(w.runs.filter(line => line.includes('pint'))).toEqual([])
  })
})

describe('failure', () => {
  test('a guard that cannot judge a command refuses it', async ($, on) => {
    const w = world({ cwdFails: true })

    stub(on, w)
    const result = await bash($, 'ls')

    expect(refusal(result)).toContain('guardrails: the guard failed on this command')
    expect(w.ran).toEqual([])
  })
})
