import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

import {
  allowlistErrors,
  buildIndex,
  checkClaim,
  checkClaims,
  collectClaims,
  extractClaims,
  repoPath,
  type AllowEntry,
  type Claim,
  type Index,
} from './check_doc_claims';

const FENCE = '`'.repeat(3);
const index: Index = buildIndex();
const claim = (kind: Claim['kind'], token: string): Claim => ({ kind, token, page: 'p.md', line: 1 });

describe('doc claims: what a page says is read from its code spans and shell blocks (DOC-014)', () => {
  it('reads code spans, the lines of a shell block, and nothing from the front matter or other blocks', () => {
    const text = [
      '---',
      'description: "`zplc_front_matter`"',
      '---',
      '',
      'Call `zplc_sched_init()` and set `CONFIG_ZPLC_SCHEDULER=y`, then run `zplc dbg bp add <pc>`.',
      '',
      `${FENCE}bash`,
      '$ zplc status',
      'cd firmware/app',
      FENCE,
      '',
      `${FENCE}c`,
      'zplc_inside_c_block();',
      FENCE,
    ].join('\n');
    expect(extractClaims('p.md', text).map((found) => `${found.kind}:${found.token}@${found.line}`)).toEqual([
      'c-api:zplc_sched_init@5',
      'kconfig:ZPLC_SCHEDULER@5',
      'shell:zplc dbg bp add#1@5',
      'shell:zplc status@8',
      'path:firmware/app@9',
    ]);
  });

  it('takes a word as a path only when it starts at a folder of the repository and is not a placeholder, URL or absolute path', () => {
    expect(repoPath('firmware/app/Kconfig')).toBe('firmware/app/Kconfig');
    expect(repoPath('packages/zplc-ide/src/cli/index.ts:140-150')).toBe('packages/zplc-ide/src/cli/index.ts');
    for (const word of [
      'src/main.st',
      '/dev/ttyACM0',
      'https://zplc.dev/docs',
      'packages/*/README.md',
      'docs/<lang>/x.md',
      'build/zplc.zplc',
    ])
      expect([word, repoPath(word)]).toEqual([word, undefined]);
  });
});

describe('doc claims: a claim holds only when the source has the thing (DOC-014)', () => {
  it('holds a Kconfig symbol of the module, and not one that no Kconfig file defines', () => {
    expect(checkClaim(claim('kconfig', 'ZPLC_STACK_DEPTH'), index)).toBeUndefined();
    expect(checkClaim(claim('kconfig', 'ZPLC_CUSTOM_TASKS'), index)).toMatch(/not defined by any Kconfig file/);
  });

  it('holds a shell command of the table and fails on an unknown subcommand or a wrong number of arguments', () => {
    expect(checkClaim(claim('shell', 'zplc dbg bp add#1'), index)).toBeUndefined();
    expect(checkClaim(claim('shell', 'zplc dbg bp erase'), index)).toMatch(/no command `zplc dbg bp erase`/);
    expect(checkClaim(claim('shell', 'zplc dbg bp add#3'), index)).toMatch(/takes 1 required and 0 optional/);
    expect(checkClaim(claim('shell', 'zplc dbg'), index)).toBeUndefined();
  });

  it('holds a command of the command line, a C identifier, a registry call and a tracked path, and fails on the rest', () => {
    expect(checkClaim(claim('cli', 'scenario-run'), index)).toBeUndefined();
    expect(checkClaim(claim('cli', 'build'), index)).toMatch(/no command build/);
    expect(checkClaim(claim('c-api', 'zplc_sched_init'), index)).toBeUndefined();
    expect(checkClaim(claim('c-api', 'zplc_scheduler_init'), index)).toMatch(/not declared or used/);
    expect(checkClaim(claim('call', 'ton'), index)).toBeUndefined();
    expect(checkClaim(claim('call', 'ABS'), index)).toBeUndefined();
    expect(checkClaim(claim('call', 'FROBNICATE'), index)).toMatch(/not a function or function block/);
    expect(checkClaim(claim('path', 'firmware/app/Kconfig'), index)).toBeUndefined();
    expect(checkClaim(claim('path', 'firmware/app'), index)).toBeUndefined();
    expect(checkClaim(claim('path', 'firmware/app/include/zplc_azure_dps.h'), index)).toMatch(/not a tracked file/);
  });

  it('fails on the statements that the documentation made before it was corrected', () => {
    const baseline = [
      'Supply concrete C functions for `zplc_hal_io_read`, `zplc_hal_gpio_write` and the rest.',
      'Call `zplc_scheduler_init()` and then `zplc_sched_start()`.',
      'Guard the sources with `CONFIG_ZPLC_CUSTOM_TASKS`.',
    ].join('\n');
    const { findings } = checkClaims(extractClaims('integration/index.md', baseline), index, []);
    expect(findings.map((finding) => finding.token)).toEqual(['zplc_hal_io_read', 'zplc_scheduler_init', 'ZPLC_CUSTOM_TASKS']);
  });
});

describe('doc claims: the allow-list can only shrink (DOC-014)', () => {
  const entry: AllowEntry = {
    kind: 'path',
    token: 'docs/build',
    reason: 'The site output of the docs build; a build output is not tracked.',
  };

  it('lets a deliberately absent claim through and reports an entry that no page uses', () => {
    const claims = [claim('path', 'docs/build')];
    expect(checkClaims(claims, index, [entry])).toEqual({ findings: [], unused: [] });
    expect(checkClaims([], index, [entry]).unused).toEqual([entry]);
    expect(checkClaims(claims, index, []).findings).toHaveLength(1);
  });

  it('asks for a reason of some length and a known kind', () => {
    expect(allowlistErrors([entry])).toEqual([]);
    expect(
      allowlistErrors([
        { ...entry, reason: 'n/a' },
        { ...entry, kind: 'other' as never },
      ]),
    ).toHaveLength(2);
  });
});

describe('doc claims: the documents of the repository (DOC-014)', () => {
  it('make no claim that the source does not hold, except the listed ones', () => {
    const allowlist = JSON.parse(readFileSync(new URL('../../docs/doc-claims-allowlist.json', import.meta.url), 'utf8')) as AllowEntry[];
    const { findings, unused } = checkClaims(collectClaims(), index, allowlist);
    expect(findings.map((finding) => `${finding.page}:${finding.line}: ${finding.message}`)).toEqual([]);
    expect(unused).toEqual([]);
  });
});
