type Rule = { when: RegExp; hint: string }

const STARTS = String.raw`(?:^|[|;&(]\s*|\bxargs\s+(?:-\S+\s+)*)`

const SCRIPT = /\b(?:python3?|node|ruby|perl|php)\b[^\n]*(?:\s-\s|\s-\s*$|<<|\s-[cer]\s)/m
const SCRIPT_WRITES = /\.write(?:_text|_bytes)?\(|\bopen\([^)]*,\s*['"](?:w|a|x|r\+)b?['"]|(?:writeFileSync|appendFileSync|writeFile)\(|File\.write\(|file_put_contents\(/
const IN_PLACE = /(?:^|[|;&(]\s*)(?:perl|ruby)\b[^|;&\n]*\s-\w*i\w*\b/
const HEREDOC_TO_FILE = /\bcat\s*<<-?\s*['"]?\w+['"]?\s*>{1,2}\s*[^\s&]|\bcat\s*>{1,2}\s*\S+\s*<<|\btee\s+(?:-a\s+)?[^\s<|;&-]\S*\s*<</
const PATH_LITERAL = /['"`]((?:\.\/|\/)?[^\s'"`/()<>:;,=*?|\\]+(?:\/[^\s'"`()<>:;,=*?|\\]+)*\/?)['"`]/g
const LOOKS_LIKE_PATH = /\/|\.(?:php|[cm]?[jt]sx?|vue|css|scss|html?|md|json|ya?ml|py|rb|swift|txt|xml|neon|sql|env)$/
const SCRIPT_FILE = /(?:^|[|;&(]\s*)(?:python3?|node|ruby|perl|php)(?:\s+(?:-\S+|[\w.]+=\S*))*\s+([^\s|;&<>'"-][^\s|;&<>'"]*\.(?:py|[cm]?js|ts|rb|pl|php))(?=\s|$|[|;&)])/g

export const RULES: readonly Rule[] = [
  { when: /\bgh\s+run\s+watch\b/, hint: 'Do not poll CI from Bash. Use the Monitor tool (load it with ToolSearch).' },
  { when: /\bgh\s+pr\s+checks\b[^|;&\n]*--watch\b/, hint: 'Do not poll CI from Bash. Use the Monitor tool (load it with ToolSearch).' },
  { when: /\b(?:while|until)\b[\s\S]*\bsleep\b/, hint: 'Do not poll with sleep loops. Use the Monitor tool with an until-loop command.' },
  { when: /\bsed\b[^|;&\n]*\s(?:-[a-zA-Z]*i\S*|--in-place\S*)(?:\s|$)/, hint: 'Use sd for find/replace, or the Edit tool.' },
  { when: new RegExp(`${STARTS}grep\\b`), hint: 'Use rg instead of grep.' },
  { when: new RegExp(`${STARTS}find\\s`), hint: 'Use fd instead of find.' },
  { when: /\bgh\s+run\s+view\b(?![^|;&\n]*>)[^|;&\n]*--log-failed\b(?![^|;&\n]*>)/, hint: 'Write the failed log to a file and read the part you need.' },
]

export const SCRIPT_EDIT_HINT = 'Do not edit files from a Bash script or heredoc. Use the Edit or Write tool.'

export function writesInPlace(command: string): boolean {
  return IN_PLACE.test(command) || HEREDOC_TO_FILE.test(command)
}

export function inlineScript(command: string): string | undefined {
  return SCRIPT.test(command) ? command : undefined
}

export function scriptFiles(command: string): string[] {
  return [...command.matchAll(SCRIPT_FILE)].map(match => match[1] ?? '').filter(path => path !== '' && !/(?:^|\/)vendor\/bin\//.test(path))
}

export function writtenPaths(source: string): string[] {
  if (!SCRIPT_WRITES.test(source)) {
    return []
  }

  return [...new Set([...source.matchAll(PATH_LITERAL)].map(match => match[1] ?? '').filter(path => LOOKS_LIKE_PATH.test(path)))]
}

function normalise(path: string): string {
  const parts: string[] = []

  for (const part of path.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '.' && part !== '') {
      parts.push(part)
    }
  }

  return `/${parts.join('/')}`
}

export function inProject(path: string, root: string, topLevel: ReadonlySet<string>): boolean {
  if (path.startsWith('/')) {
    const resolved = normalise(path)

    return resolved.startsWith(`${root}/`)
  }

  const first = path.replace(/^\.\//, '').split('/')[0] ?? ''

  return topLevel.has(first)
}

export function shellDenial(command: string): string | undefined {
  if (writesInPlace(command)) {
    return SCRIPT_EDIT_HINT
  }

  return RULES.find(rule => rule.when.test(command))?.hint
}
