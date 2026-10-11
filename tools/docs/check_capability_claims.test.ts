import { describe, expect, it } from 'bun:test';

import {
  applyAllowlist, checkSentence, loadRegistry, loadTruth, numberOf, registryErrors, sentencesOf, unreleasedSection,
  type Finding, type Registry, type Truth,
} from './check_capability_claims';

const FENCE = '`'.repeat(3);
const registry = loadRegistry();
const real = loadTruth();
const truth = (change: Partial<Truth> = {}): Truth => ({ ...real, ...change });
const findings = (sentence: string, using: Truth = real, rules: Registry = registry) => checkSentence('p.md', 1, sentence, rules, using);
const ids = (sentence: string, using: Truth = real) => findings(sentence, using).map((finding) => finding.rule);

describe('capability claims: what the public text says ZPLC can do is backed by a check (DOC-012)', () => {
  it('reads sentences across wrapped lines, and leaves out code, front matter and generated blocks', () => {
    const text = [
      '---', 'title: A page', '---', '',
      'ZPLC runs on every board', 'and it is certified.', '',
      `${FENCE}text`, 'certified in a code block', FENCE, '',
      '{/* >>> GENERATED (tool): x. Do not edit. >>> */}', 'certified in a generated block', '{/* <<< END GENERATED: x <<< */}', '',
      '- A list item that mentions `certified` as code.', '- A second item.',
    ].join('\n');
    expect(sentencesOf(text).map((found) => [found.line, found.sentence])).toEqual([
      [5, 'ZPLC runs on every board and it is certified.'],
      [16, 'A list item that mentions as code.'],
      [17, 'A second item.'],
    ]);
  });

  it('lets the header row of a table limit its rows, as "What it does not establish" does', () => {
    const table = ['| Level | What it establishes | What it does not establish |', '| --- | --- | --- |', '| Production-qualified | A package exists. | Safety certification. |'].join('\n');
    expect(ids(sentencesOf(table)[0]!.sentence)).toEqual([]);
    expect(ids('Production-qualified: safety certification.')).toEqual(['safety']);
  });

  it('flags a capability that no executed check shows, and not the sentence that limits it', () => {
    expect(ids('Full ST support: variables, arrays, structs.')).toEqual(['full-language']);
    expect(ids('ZPLC is a hard real-time PLC.')).toEqual(['timing']);
    expect(ids('The runtime is SIL 2 certified.').sort()).toEqual(['safety']);
    expect(ids('ZPLC is tested on real hardware.')).toEqual(['hardware-tested']);
    expect(ids('The Raspberry Pi Pico runs your program.')).toEqual(['board-capability']);
    expect(ids('Modbus TCP is supported on every network board.')).toEqual(['communication-protocols']);
    expect(ids('The browser simulator runs your program.')).toEqual(['browser-simulator']);
    // WORK is the memory region of the program and not the verb: a sentence that names it makes no claim
    expect(ids('The Modbus server serves every variable of WORK and RETAIN.')).toEqual([]);
    expect(ids('Modbus RTU works on every serial board.')).toEqual(['communication-protocols']);
    // the same words, as a limitation, are the honest text
    expect(ids('ZPLC is not SIL 2 certified.')).toEqual([]);
    expect(ids('No board has been tested on real hardware yet.')).toEqual([]);
    expect(ids('The Raspberry Pi Pico only cross-builds today.')).toEqual([]);
    expect(ids('The browser simulator is disabled until a verified artifact exists.')).toEqual([]);
  });

  it('flags a channel or a signature that does not exist, and not the sentence that limits it (REL-028, REL-003)', () => {
    expect(ids('Install ZPLC with Homebrew.')).toEqual(['distribution-channel']);
    expect(ids('ZPLC is on the Microsoft Store and in winget.')).toEqual(['distribution-channel']);
    expect(ids('The macOS app is notarized and opens on every Mac.')).toEqual(['notarized-or-developer-signed']);
    expect(ids('The installer is signed through SignPath.')).toEqual(['notarized-or-developer-signed']);
    // the honest text of the install page
    expect(ids('Homebrew cask, Arch User Repository: not set up.')).toEqual([]);
    expect(ids('The app is signed only ad hoc and is not notarized, because notarization needs a paid Apple account.')).toEqual([]);
    expect(ids('Never notarized: macOS treats it as an app from an unidentified developer.')).toEqual([]);
  });

  it('takes the state of a language element from the executed cases, so a row that works backs its claim', () => {
    const rule: Registry = { schemaVersion: 1, counts: [], rules: [{ id: 'structures', pattern: '\\bstructs?\\b', evidence: { rows: ['data-types.struct'] } }] };
    expect(findings('Structs are supported.', truth({ rows: new Map([['data-types.struct', 'works']]) }), rule)).toEqual([]);
    expect(findings('Structs are supported.', truth({ rows: new Map([['data-types.struct', 'broken']]) }), rule)[0]!.message).toContain('data-types.struct is broken');
    expect(registryErrors({ ...rule, rules: [{ id: 'x', pattern: 'x', evidence: { rows: ['no.such.row'] } }] }, new Set(real.rows.keys()))[0]).toContain('no.such.row');
  });

  it('backs a board claim only by a hardware record, and the browser simulator only by its capability profile', () => {
    expect(ids('The Raspberry Pi Pico runs your program.', truth({ hilBoards: ['rpi_pico'] }))).toEqual([]);
    expect(ids('The browser simulator runs your program.', truth({ wasmAvailable: true }))).toEqual([]);
    expect(real.hilBoards).toEqual([]);
    expect(real.wasmAvailable).toBe(false);
  });

  it('holds a number that counts a thing to what the repository has, and a sentence about a release to nothing', () => {
    expect(real.counts.boards).toBeGreaterThanOrEqual(7);
    // a wrong number is wrong in a sentence that limits a capability too
    expect(ids(`Only ${numberWord(real.counts.boards - 1)} boards cross-build.`)).toEqual(['count-boards']);
    expect(ids(`The runtime builds for all ${numberWord(real.counts.boards - 1)} Zephyr boards.`)).toEqual(['count-boards']);
    expect(ids(`The runtime builds for ${numberWord(real.counts.boards)} Zephyr boards.`)).toEqual([]);
    // a subset is not a total
    expect(ids('The two boards of the STM32 family use plain TCP.')).toEqual([]);
    expect(ids(`Seis placas tienen un perfil de compilación.`)).toEqual(real.counts.boards === 6 ? [] : ['count-boards']);
    expect(ids('Start from 16 example projects.')).toEqual(['count-examples']);
    expect(ids('Release 2.0.0-rc.3 cross-built the six board profiles.')).toEqual([]);
    expect(numberOf('Seis')).toBe(6);
    expect(numberOf('12')).toBe(12);
  });

  it('keeps only the unreleased part of a changelog', () => {
    const text = ['# Changelog', '', '## Unreleased', '', '- New.', '', '## 2.0.0-rc.3 - 2026-01-01', '', '- Old.'].join('\n');
    expect(unreleasedSection(text).split('\n').filter(Boolean)).toEqual(['## Unreleased', '- New.']);
  });

  it('can only shrink its allowlist: an entry that matches no finding is an error', () => {
    const finding: Finding = { file: 'a.md', line: 1, rule: 'board-capability', message: 'm', sentence: 'A plan for the Pico runs.' };
    expect(applyAllowlist([finding], [{ file: 'a.md', startsWith: 'A plan', reason: 'A plan, not a claim.' }])).toEqual({ kept: [], errors: [] });
    const unused = applyAllowlist([], [{ file: 'a.md', startsWith: 'A plan', reason: 'A plan, not a claim.' }]);
    expect(unused.errors[0]).toContain('matches no finding');
  });

  it('holds for the public text of this repository', () => {
    const result = Bun.spawnSync(['bun', 'tools/docs/check_capability_claims.ts'], { cwd: new URL('../../', import.meta.url).pathname, stdout: 'pipe', stderr: 'pipe' });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });
});

function numberWord(value: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][value] ?? String(value);
}
