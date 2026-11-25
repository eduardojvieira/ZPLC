// AGENTS.md rule 8 is the physical-operations boundary; rule 7 is Style. Nothing may cite rule 7 for the boundary.
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..', '..')

// A line cites the wrong rule when it names AGENTS and rule 7 / regla 7 close together, in either order.
const WRONG = [
  /AGENTS(?:\.md)?\W{0,4}(?:\w+\s+){0,3}(?:rule|regla)\s+7\b/i,
  /\b(?:rule|regla)\s+7\b[^\n]{0,30}AGENTS/i,
  /\((?:rule|regla)\s+7\)/i,
]

export function citesWrongRule(line: string): boolean {
  return /AGENTS/i.test(line) && WRONG.some((re) => re.test(line))
}

// Allowed: spec 014 describes the defect; released CHANGELOG sections are history.
const allowed = (path: string) => path.startsWith('specs/014-zplc-2-1-release-quality/') || path === 'CHANGELOG.md'

function hits(): string[] {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0')
    .filter((p) => p && !allowed(p))
  const out: string[] = []
  for (const path of files) {
    let text: string
    try {
      const buf = readFileSync(join(root, path))
      if (buf.includes(0)) continue
      text = buf.toString('utf8')
    } catch {
      continue
    }
    text.split('\n').forEach((line, i) => {
      if (citesWrongRule(line)) out.push(`${path}:${i + 1}`)
    })
  }
  return out
}

describe('AGENTS.md rule citation', () => {
  test('no file cites rule 7 (Style) for the physical-operations boundary, which is rule 8', () => {
    expect(hits()).toEqual([])
  })

  test('the guard catches the wrong citation and accepts the right one', () => {
    expect(citesWrongRule('a person starts the flash (AGENTS.md rule 7)')).toBe(true)
    expect(citesWrongRule('(regla 7 de AGENTS.md)')).toBe(true)
    expect(citesWrongRule('`AGENTS.md` rule 7, HIL-003')).toBe(true)
    expect(citesWrongRule('a person starts the flash (AGENTS.md rule 8)')).toBe(false)
    expect(citesWrongRule('constitution, rule 7')).toBe(false)
  })
})
