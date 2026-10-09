import { describe, expect, test } from 'claude-code/testing'

import { inProject, inlineScript, scriptFiles, shellDenial, writtenPaths } from './shell'

const ROOT = '/Users/me/Dev/acme'
const TOP = new Set(['app', 'resources', 'tests', 'index.html', 'vite.config.js'])

const editsProject = (source: string) => writtenPaths(source).some(path => inProject(path, ROOT, TOP))

describe('CLI rules', () => {
  const denied: [string, string][] = [
    ['gh run watch 1873420', 'Monitor'],
    ['gh run watch', 'Monitor'],
    ['gh pr checks 12 --watch', 'Monitor'],
    ['while ! gh run view 1 --json status | rg -q completed; do sleep 10; done', 'Monitor'],
    ['until curl -sf localhost:8000; do sleep 2; done', 'Monitor'],
    ["sed -i '' 's/a/b/' app/User.php", 'Edit tool'],
    ["sed -i.bak 's/a/b/' x", 'Edit tool'],
    ["sed -E -i 's/a/b/' x", 'Edit tool'],
    ['sed --in-place s/a/b/ x', 'Edit tool'],
    ["fd -e php | xargs sed -i 's/a/b/'", 'Edit tool'],
    ['grep -rn foo app', 'rg'],
    ['git diff | grep foo', 'rg'],
    ['find . -name "*.php"', 'fd'],
    ['ls && find app -type f', 'fd'],
    ['gh run view 123 --log-failed', 'file'],
  ]

  for (const [command, hint] of denied) {
    test(`denies ${JSON.stringify(command)}`, () => {
      expect(shellDenial(command)).toContain(hint)
    })
  }

  const allowed = [
    'rg -n foo app',
    'fd -e php . app',
    "sed -n '1,20p' app/User.php",
    'git commit -m "fix: refuse sed -i edits"',
    "rg -n 'sed -i' docs",
    'git grep -n foo',
    'pgrep -f php',
    'rg "find me" docs',
    'echo grep is old',
    'gh run view 123 --log-failed > /tmp/ci.log',
    'gh run view 123',
    'sleep 2 && curl -s localhost:8000',
  ]

  for (const command of allowed) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(shellDenial(command)).toBeUndefined()
    })
  }
})

describe('sd file edits', () => {
  const denied = [
    "sd 'a' 'b' app/User.php",
    "sd -F '[x]' 'y' app/User.php resources/js/app.js",
    'sd -n 1 foo bar app/User.php',
    "cd app && sd 'a' 'b' User.php",
    'rg -l foo | xargs sd foo bar',
  ]

  for (const command of denied) {
    test(`denies ${JSON.stringify(command)}`, () => {
      expect(shellDenial(command)).toContain('Edit tool')
    })
  }

  const allowed = [
    "echo foo | sd 'foo' 'bar'",
    "git log --oneline | sd -F '#' ''",
    "sd 'a' 'b' < app/User.php > /tmp/out",
    "sd -p 'a' 'b' app/User.php",
    "sd --preview 'a' 'b' app/User.php",
    "sd -Fp '[x]' 'y' app/User.php",
    'rg -n sd docs',
    'echo sd a b c',
  ]

  for (const command of allowed) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(shellDenial(command)).toBeUndefined()
    })
  }
})

describe('in-place and heredoc writes', () => {
  const denied = [
    "perl -0pi -e 's/a/b/' resources/js/app.js",
    "perl -pi -e 's/a/b/' x.php",
    'ruby -i -pe \'gsub(/a/, "b")\' x.rb',
    "cat > app/Thing.php <<'EOF'\n<?php\nEOF",
    "cat <<'EOF' > app/Thing.php\n<?php\nEOF",
    'cat >> notes.md <<EOF\nx\nEOF',
    "tee resources/js/x.js <<'EOF'\nx\nEOF",
  ]

  for (const command of denied) {
    test(`denies ${JSON.stringify(command.split('\n')[0])}`, () => {
      expect(shellDenial(command)).toContain('Edit or Write')
    })
  }

  const allowed = [
    'git commit -m "$(cat <<\'EOF\'\nfix: thing > other\nEOF\n)"',
    'gh pr create --body "$(cat <<\'EOF\'\n## Summary\nEOF\n)"',
    "perl -ne 'print if /foo/' app/User.php",
    'cat app/User.php',
  ]

  for (const command of allowed) {
    test(`allows ${JSON.stringify(command.split('\n')[0])}`, () => {
      expect(shellDenial(command)).toBeUndefined()
    })
  }
})

describe('scripts that edit project files', () => {
  test('a python heredoc that rewrites a project file', () => {
    const command = "python3 - <<'EOF'\np='resources/css/auth.css'\ns=open(p).read()\ns=s.replace('a','b')\nopen(p,'w').write(s)\nEOF"

    expect(inlineScript(command)).toBeDefined()
    expect(editsProject(command)).toBe(true)
  })

  test('an f-string path into a project folder', () => {
    expect(editsProject("for slug in s:\n    path = f'resources/guides/en/{slug}.md'\n    open(path, 'w').write(x)")).toBe(true)
  })

  test('a root file edited by name', () => {
    expect(editsProject("p='index.html'\ns=open(p).read()\nopen(p,'w').write(s)")).toBe(true)
  })

  test('an absolute path inside the project', () => {
    expect(editsProject(`import pathlib\npathlib.Path('${ROOT}/tests/Unit/X.php').write_text(new)`)).toBe(true)
  })

  test('node and php writers', () => {
    expect(editsProject("const fs = require('fs'); fs.writeFileSync('resources/js/app.js', s)")).toBe(true)
    expect(editsProject("<?php file_put_contents('app/Models/User.php', $s);")).toBe(true)
  })

  test('read-only scripts pass', () => {
    expect(editsProject("import json\nprint(json.load(open('composer.json'))['require'])")).toBe(false)
    expect(editsProject("p='resources/css/auth.css'\nprint(open(p).read().count('x'))")).toBe(false)
  })

  test('scripts that write only outside the project pass', () => {
    expect(editsProject("open('/tmp/out.json','w').write(data)")).toBe(false)
    expect(editsProject("open('/Users/me/.claude/jobs/abc/tmp/out.json','w').write(data)")).toBe(false)
    expect(editsProject("here = pathlib.Path(__file__).parent\n(here / f'card-{n}.html').write_text(html)\ntemplate = 'card.html'")).toBe(false)
    expect(editsProject(`open('${ROOT}/../other/x.php','w').write(s)`)).toBe(false)
  })

  test('finds the script files a command runs', () => {
    expect(scriptFiles('python3 /tmp/kandu_ed3.py && cd x && vendor/bin/pint')).toEqual(['/tmp/kandu_ed3.py'])
    expect(scriptFiles('node scripts/probe.mjs a b; php -d memory_limit=-1 tools/fix.php')).toEqual(['scripts/probe.mjs', 'tools/fix.php'])
    expect(scriptFiles('php artisan test && php vendor/bin/pest')).toEqual([])
  })
})
