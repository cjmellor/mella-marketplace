type Rule = { when: RegExp; hint: string }

const STARTS = String.raw`(?:^|[|;&(]\s*|\bxargs\s+(?:-\S+\s+)*)`

const SCRIPT = /\b(?:python3?|node|ruby|perl|php)\b[^\n]*(?:\s-\s|\s-\s*$|<<|\s-[cer]\s)/m
const SCRIPT_WRITES = /\.write(?:_text|_bytes)?\(|\bopen\([^)]*,\s*['"](?:w|a|x|r\+)b?['"]|(?:writeFileSync|appendFileSync|writeFile)\(|File\.write\(|file_put_contents\(/
const IN_PLACE = /(?:^|[|;&(]\s*)(?:perl|ruby)\b[^|;&\n]*\s-\w*i\w*\b/
const HEREDOC_TO_FILE = /\bcat\s*<<-?\s*['"]?\w+['"]?\s*>{1,2}\s*[^\s&]|\bcat\s*>{1,2}\s*\S+\s*<<|\btee\s+(?:-a\s+)?[^\s<|;&-]\S*\s*<</
const PATH_LITERAL = /['"`]((?:\.\/|\/)?[^\s'"`/()<>:;,=*?|\\]+(?:\/[^\s'"`()<>:;,=*?|\\]+)*\/?)['"`]/g
const LOOKS_LIKE_PATH = /\/|\.(?:php|[cm]?[jt]sx?|vue|css|scss|html?|md|json|ya?ml|py|rb|swift|txt|xml|neon|sql|env)$/
const SCRIPT_FILE = /(?:^|[|;&(]\s*)(?:python3?|node|ruby|perl|php)(?:\s+(?:-\S+|[\w.]+=\S*))*\s+([^\s|;&<>'"-][^\s|;&<>'"]*\.(?:py|[cm]?js|ts|rb|pl|php))(?=\s|$|[|;&)])/g
const SD_COMMAND = new RegExp(`(${STARTS})sd(?=\\s)`, 'g')
const SD_VALUE_OPTIONS = new Set(['-n', '--max-replacements', '-f', '--flags'])
const SD_PREVIEW = /^(?:--preview|-[a-zA-Z]*p[a-zA-Z]*)$/

export const RULES: readonly Rule[] = [
  { when: /\bgh\s+run\s+watch\b/, hint: 'Do not poll CI from Bash. Use the Monitor tool (load it with ToolSearch).' },
  { when: /\bgh\s+pr\s+checks\b[^|;&\n]*--watch\b/, hint: 'Do not poll CI from Bash. Use the Monitor tool (load it with ToolSearch).' },
  { when: /\b(?:while|until)\b[\s\S]*\bsleep\b/, hint: 'Do not poll with sleep loops. Use the Monitor tool with an until-loop command.' },
  { when: /\bsed\b[^|;&\n]*\s(?:-[a-zA-Z]*i\S*|--in-place\S*)(?:\s|$)/, hint: 'Edit files with the Edit tool.' },
  { when: new RegExp(`${STARTS}grep\\b`), hint: 'Use rg instead of grep.' },
  { when: new RegExp(`${STARTS}find\\s`), hint: 'Use fd instead of find.' },
  { when: /\bgh\s+run\s+view\b(?![^|;&\n]*>)[^|;&\n]*--log-failed\b(?![^|;&\n]*>)/, hint: 'Write the failed log to a file and read the part you need.' },
]

export const SCRIPT_EDIT_HINT = 'Do not edit files from a Bash script or heredoc. Use the Edit or Write tool.'

export const SD_EDIT_HINT = 'Edit files with the Edit tool. sd is for piped text only.'

function shellWords(text: string): string[] {
  const words: string[] = []
  let word = ''
  let started = false
  let quote: string | null = null

  for (const char of text) {
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        word += char
      }
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (/[|;&()<>\n]/.test(char)) {
      break
    } else if (/\s/.test(char)) {
      if (started) {
        words.push(word)
        word = ''
        started = false
      }
    } else {
      word += char
      started = true
    }
  }

  if (started) {
    words.push(word)
  }

  return words
}

export function sdEditsFiles(command: string): boolean {
  for (const match of command.matchAll(SD_COMMAND)) {
    const args = shellWords(command.slice((match.index ?? 0) + match[0].length))
    const positional: string[] = []
    let preview = false
    let optionsEnded = false

    for (let index = 0; index < args.length; index++) {
      const arg = args[index] ?? ''

      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-')) {
        preview ||= SD_PREVIEW.test(arg)
        index += SD_VALUE_OPTIONS.has(arg) ? 1 : 0
      } else {
        positional.push(arg)
      }
    }

    const filesFromXargs = /\bxargs\b/.test(match[1] ?? '') ? 1 : 0

    if (!preview && positional.length + filesFromXargs > 2) {
      return true
    }
  }

  return false
}

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

  if (sdEditsFiles(command)) {
    return SD_EDIT_HINT
  }

  return RULES.find(rule => rule.when.test(command))?.hint
}
