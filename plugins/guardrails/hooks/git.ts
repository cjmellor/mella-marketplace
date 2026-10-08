export type GitContext = {
  lastPrompt: string
  committing: boolean
  commitSkill: string | null
  forbidsNoFf: boolean
}

const STARTS = String.raw`(?:^|[|;&(\n]\s*)`
const GIT = String.raw`${STARTS}git(?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+`
const GH = String.raw`${STARTS}gh\s+pr\s+`

const PUSH = new RegExp(`${GIT}push\\b`)
const COMMIT = new RegExp(`${GIT}commit\\b`)
const NO_FF_MERGE = new RegExp(`${GIT}merge\\b[^|;&\\n]*--no-ff\\b`)
const PR_OPEN = new RegExp(`${GH}(?:create|ready)\\b`)
const PR_MERGE = new RegExp(`${GH}merge\\b`)
const PUBLISHES = /\bgit\b[^|;&\n]*\bcommit\b|\bgh\s+(?:pr|issue)\b/
const SESSION_LINK = /claude\.ai\/code\/session_|Claude-Session:/

const PUSH_WORDS = String.raw`push(?:es|ed|ing)?|ship(?:s|ped|ping)?`
const PR_WORDS = String.raw`prs?|pull[- ]requests?|ship(?:s|ped|ping)?`
const MERGE_WORDS = String.raw`merg(?:e|es|ed|ing)|ship(?:s|ped|ping)?`

const NEGATION = String.raw`\b(?:don'?t|do\s+not|never|no|not|stop|without|avoid|hold\s+off(?:\s+on)?)\b(?:\s+[\w'-]+){0,3}\s+`

export function asked(prompt: string, words: string): boolean {
  const mentions = prompt.match(new RegExp(`\\b(?:${words})\\b`, 'gi')) ?? []
  const negated = prompt.match(new RegExp(`${NEGATION}(?:${words})\\b`, 'gi')) ?? []

  return mentions.length > negated.length
}

export function gitDenial(command: string, context: GitContext): string | undefined {
  if (SESSION_LINK.test(command) && PUBLISHES.test(command)) {
    return 'Remove the Claude session link from the commit or PR text.'
  }

  if (PUSH.test(command) && !asked(context.lastPrompt, PUSH_WORDS)) {
    return 'The user did not ask for a push in their last message. Ask them first.'
  }

  if (PR_OPEN.test(command) && !asked(context.lastPrompt, PR_WORDS)) {
    return 'The user did not ask for a pull request in their last message. Ask them first.'
  }

  if (PR_MERGE.test(command) && !asked(context.lastPrompt, MERGE_WORDS)) {
    return 'The user did not ask for a merge in their last message. Ask them first.'
  }

  if (context.commitSkill && COMMIT.test(command) && !context.committing) {
    return `Commit through the ${context.commitSkill} skill, not a raw git commit.`
  }

  if (context.forbidsNoFf && NO_FF_MERGE.test(command)) {
    return 'This project merges fast-forward only. Drop --no-ff.'
  }

  return undefined
}
