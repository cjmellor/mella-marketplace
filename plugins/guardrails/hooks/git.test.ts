import { describe, expect, test } from 'claude-code/testing'

import { asked, gitDenial } from './git'

const PUSH_WORDS = String.raw`push(?:es|ed|ing)?|ship(?:s|ped|ping)?`

const context = (lastPrompt: string, overrides: { committing?: boolean; commitSkill?: string | null; forbidsNoFf?: boolean } = {}) => ({
  lastPrompt,
  committing: false,
  commitSkill: 'mella:commit' as string | null,
  forbidsNoFf: false,
  ...overrides,
})

describe('asked', () => {
  const cases: [string, boolean][] = [
    ['push it', true],
    ['commit and push', true],
    ['/mella:commit push', true],
    ['ok ship it', true],
    ['Push the branch please', true],
    ["Don't push, let's get all the Phases done first.", false],
    ['Okay stop commiting and pushing until we are done and I say so', false],
    ['commit this but do not push yet', false],
    ['never push to main', false],
    ['hold off on pushing', false],
    ['fix the failing upload test', false],
    ['', false],
    ["don't push yet. actually, push it now", true],
  ]

  for (const [prompt, expected] of cases) {
    test(`${JSON.stringify(prompt)} → ${expected}`, () => {
      expect(asked(prompt, PUSH_WORDS)).toBe(expected)
    })
  }
})

describe('push and PR gate', () => {
  for (const command of ['git push', 'git push -u origin feat/x', 'git -C /tmp/repo push origin main', 'git --no-pager push', 'git add . && git commit -m wip && git push']) {
    test(`denies ${JSON.stringify(command)} when the last message did not ask`, () => {
      expect(gitDenial(command, context('fix the test', { committing: true }))).toContain('did not ask for a push')
    })
  }

  test('allows a push the user asked for', () => {
    expect(gitDenial('git push -u origin feat/x', context('commit and push this'))).toBeUndefined()
  })

  test('denies a push the user ruled out in the same message', () => {
    expect(gitDenial('git push', context("commit, but don't push"))).toContain('did not ask for a push')
  })

  test('denies gh pr create and gh pr ready unless a PR was asked for', () => {
    expect(gitDenial('gh pr create --fill', context('push it'))).toContain('pull request')
    expect(gitDenial('gh pr ready 12', context('push it'))).toContain('pull request')
    expect(gitDenial('gh pr create --fill', context('push and open a PR'))).toBeUndefined()
    expect(gitDenial('gh pr create --draft', context('open a pull request'))).toBeUndefined()
  })

  test('denies gh pr merge unless a merge was asked for', () => {
    expect(gitDenial('gh pr merge 12 --squash', context('open a PR'))).toContain('merge')
    expect(gitDenial('gh pr merge 12 --squash', context('merge it'))).toBeUndefined()
  })

  test('leaves read-only git and gh alone', () => {
    for (const command of ['git status', 'git log --oneline -5', 'gh pr view 12', 'gh pr list', 'git fetch origin', 'git pull']) {
      expect(gitDenial(command, context(''))).toBeUndefined()
    }
  })
})

describe('commit gate', () => {
  test('denies a raw git commit outside the commit skill', () => {
    expect(gitDenial('git commit -m "fix: thing"', context('commit this'))).toContain('mella:commit')
    expect(gitDenial('git -C /tmp/r commit --amend --no-edit', context(''))).toContain('mella:commit')
  })

  test('names whichever commit skill is installed', () => {
    expect(gitDenial('git commit -m x', context('', { commitSkill: 'commit' }))).toContain('the commit skill')
  })

  test('without a commit skill installed, git commit runs', () => {
    expect(gitDenial('git commit -m "fix: thing"', context('', { commitSkill: null }))).toBeUndefined()
  })

  test('allows git commit while the commit skill runs', () => {
    expect(gitDenial('git commit -m "fix: thing"', context('commit this', { committing: true }))).toBeUndefined()
  })

  test('does not mistake commit-ish words for a commit', () => {
    expect(gitDenial('git log --format=%H -1 HEAD', context(''))).toBeUndefined()
    expect(gitDenial('git show HEAD --stat', context(''))).toBeUndefined()
    expect(gitDenial('rg "git commit" docs', context(''))).toBeUndefined()
  })
})

describe('session links', () => {
  test('denies a commit or PR body with a Claude session link, even when asked', () => {
    const body = 'gh pr create --body "Done.\n\nhttps://claude.ai/code/session_01ABC"'

    expect(gitDenial(body, context('open a PR'))).toContain('session link')
    expect(gitDenial('git commit -m "x\n\nClaude-Session: abc"', context('commit', { committing: true }))).toContain('session link')
  })
})

describe('fast-forward only', () => {
  test('denies --no-ff only where the project forbids it', () => {
    expect(gitDenial('git merge --no-ff feat/x', context('', { forbidsNoFf: true }))).toContain('fast-forward')
    expect(gitDenial('git merge --no-ff feat/x', context(''))).toBeUndefined()
    expect(gitDenial('git merge --ff-only feat/x', context('', { forbidsNoFf: true }))).toBeUndefined()
  })
})
