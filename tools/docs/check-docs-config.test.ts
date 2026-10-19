import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { addressesWithoutChannel, boardProblems, extractFragments, parityErrors, problemsOf, projectOf, schemaErrors, type Fragment } from './check-docs-config';
import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const FENCE = '`'.repeat(3);
const schema = JSON.parse(readFileSync(join(ROOT, 'packages/zplc-ide/zplc.schema.json'), 'utf8'));
const base = { schemaVersion: 2, name: 'x', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }] };
const fragment = (source: object, board = 'posix', kind: Fragment['kind'] = 'fragment'): Fragment => ({ page: 'p.md', line: 1, board, source: JSON.stringify(source), kind });

describe('docs configuration fragments: a fragment is a piece of a project file that builds (DOC-009)', () => {
  it('finds the fragments and scenarios of a page, with their board, and a program for a scenario', () => {
    const text = [
      `${FENCE}st runnable`, 'PROGRAM Main', 'END_PROGRAM', FENCE, '',
      `${FENCE}json zplc-fragment board=rpi_pico`, '{ "io": {} }', FENCE, '',
      `${FENCE}json`, '{ "not": "a fragment" }', FENCE, '',
      `${FENCE}json zplc-scenario`, '{ "id": "S" }', FENCE,
    ].join('\n');
    const { fragments, errors } = extractFragments('p.md', text);
    expect(errors).toEqual([]);
    expect(fragments.map((found) => [found.kind, found.board, found.line])).toEqual([['fragment', 'rpi_pico', 7], ['scenario', 'posix', 15]]);
    expect(fragments[1]!.program).toBe('PROGRAM Main\nEND_PROGRAM');
    expect(extractFragments('p.md', `${FENCE}json zplc-scenario\n{}\n${FENCE}`).errors[0]).toContain('needs a runnable Structured Text program');
  });

  it('follows the schema of the project file and rejects a key that it does not have, a value out of range and a bad enum', () => {
    expect(schemaErrors({ ...base, communication: { modbus: { enabled: true, unitId: 1, tcpEnabled: true, tcpPort: 502, rtuEnabled: false, rtuBaud: 9600, rtuParity: 'none', pollIntervalMs: 100 } } }, schema, schema)).toEqual([]);
    expect(schemaErrors({ ...base, comunication: {} }, schema, schema)).toEqual(['$: comunication is not a key of the project file']);
    const modbus = (change: object) => ({ ...base, communication: { modbus: { enabled: true, unitId: 1, tcpEnabled: true, tcpPort: 502, rtuEnabled: false, rtuBaud: 9600, rtuParity: 'none', pollIntervalMs: 100, ...change } } });
    expect(schemaErrors(modbus({ tcpPort: 70000 }), schema, schema)).toEqual(['$.communication.modbus.tcpPort: 70000 is above 65535']);
    expect(schemaErrors(modbus({ rtuParity: 'mark' }), schema, schema)[0]).toContain('"mark" is not one of');
    const withoutUnit = modbus({});
    delete (withoutUnit.communication.modbus as Record<string, unknown>).unitId;
    expect(schemaErrors(withoutUnit, schema, schema)).toEqual(['$.communication.modbus: lacks the required key unitId']);
  });

  it('holds the addresses of a mapping to the channels of its board unless they are virtual', () => {
    expect(addressesWithoutChannel({ io: { outputs: [{ address: '%QX0.0' }, { address: '%Q0.1' }] } }, 'rpi_pico')).toEqual([]);
    expect(addressesWithoutChannel({ io: { outputs: [{ address: '%QX0.6' }] } }, 'rpi_pico')).toEqual(['%QX0.6']);
    expect(addressesWithoutChannel({ io: { outputs: [{ address: '%QX0.6' }], virtual: [{ address: '%QX0.6' }] } }, 'rpi_pico')).toEqual([]);
    expect(addressesWithoutChannel({ io: { outputs: [{ address: '%QX0.6' }] } }, 'posix')).toEqual([]);
  });

  it('builds the project that holds a fragment, and reports a fragment that the build or the schema refuses', async () => {
    const good = fragment({ communication: { bindings: [{ name: 'Pressure', symbol: 'Pressure', type: 'REAL', mode: 'modbus', modbusAddress: 40001 }] } });
    expect(projectOf(good).program).toContain('Pressure : BOOL;');
    expect(await problemsOf(good)).toEqual([]);
    expect((await problemsOf(fragment({ tasks: [] })))[0]).toContain('does not follow packages/zplc-ide/zplc.schema.json');
    expect((await problemsOf(fragment({ io: { outputs: [{ name: 'Q', address: '%QX0.6', type: 'BOOL' }] } }, 'rpi_pico')))[0]).toContain('has no channel for');
  });

  it('wants the Spanish page to show the same fragments as the English page', () => {
    const one = fragment({ io: {} });
    const other = fragment({ io: { virtual: [] } });
    expect(parityErrors(new Map([['a.md', [one]]]), new Map([['a.md', [one]]]))).toEqual([]);
    expect(parityErrors(new Map([['a.md', [one]]]), new Map([['a.md', [other]]]))[0]).toContain('show different fragments');
    expect(parityErrors(new Map([['a.md', [one]]]), new Map())[0]).toContain('its Spanish page has 0');
  });

  it('finds a board entry of a page by its fence and checks it against the validator of the board manifest (DOC-009)', () => {
    const entry = (change: (value: Record<string, any>) => void) => {
      const value = JSON.parse(readFileSync(join(ROOT, 'firmware/app/boards/boards.json'), 'utf8'))[0] as Record<string, any>;
      value.board_id = 'example-board'; value.ide_id = 'example_board'; value.zephyr_board = 'example_board/example_soc';
      change(value);
      return JSON.stringify(value);
    };
    const found = extractFragments('p.md', `${FENCE}json zplc-board\n{}\n${FENCE}`);
    expect(found.errors).toEqual([]);
    expect(found.fragments.map((one) => [one.kind, one.board])).toEqual([['board', 'posix']]);
    expect(boardProblems(entry(() => {}))).toEqual([]);
    expect(boardProblems(entry((value) => { value.zephyr_board = 'rpi_pico/rp2040'; }))[0]).toContain('duplicate zephyr_board: rpi_pico/rp2040');
    expect(boardProblems(entry((value) => { value.validation_level = 'human-hil'; }))[0]).toContain('validation_level is derived from the evidence records');
    expect(boardProblems(entry((value) => { delete value.evidence_refs; }))[0]).toContain('is missing keys: evidence_refs');
    expect(boardProblems(entry((value) => { value.io.channels[0].address = '%IX0.0'; }))[0]).toContain('cannot sit on the %IX0.0 address');
    expect(boardProblems(entry((value) => { value.io.channels[0].safe = 2; }))[0]).toContain('needs its safe value');
    expect(boardProblems(entry((value) => { value.io.channels.push({ ...value.io.channels[0], id: 'AO0', kind: 'analog', address: '%QW0', dt: { controller: 'dac', channel: 0 } }); }))[0]).toContain('analog output is not supported');
  });

  it('holds for the pages of this repository: every fragment and scenario builds and passes', () => {
    const result = Bun.spawnSync(['bun', 'tools/docs/check-docs-config.ts'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });
});

describe('how-to guides: each task has a page in both languages with something that runs (DOC-009)', () => {
  // The tasks of DOC-009: Modbus, MQTT and Sparkplug B, the cloud blocks, mapping I/O, simulating and debugging, scenario
  // tests, the command line, AI and MCP, migrating a version 1 project, porting to a board and troubleshooting.
  const guides = [
    'map-io', 'modbus', 'mqtt-sparkplug', 'cloud-blocks', 'force-values', 'retained-variables', 'scenario-tests',
    'project-archive', 'simulate-and-debug', 'command-line', 'ai-and-mcp', 'port-to-a-board', 'troubleshooting',
  ];
  const pages = [...guides.map((guide) => `guides/${guide}.md`), 'ide/migration-v1-to-v2.md'];
  const runnable = /^`{3,}(?:json zplc-(?:fragment|scenario|board)|st runnable|bash|ini)/m;

  it('has every guide in English and Spanish with a fragment, a runnable sample or a command, and says what is verified', () => {
    for (const page of pages) {
      for (const base of ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current']) {
        const text = readFileSync(join(ROOT, base, page), 'utf8');
        expect({ page, base, runnable: runnable.test(text) }).toEqual({ page, base, runnable: true });
        expect({ page, base, verified: /^## (?:What is verified|Qué está verificado)/m.test(text) }).toEqual({ page, base, verified: true });
      }
    }
    expect(markdownFiles(ROOT, 'docs/docs').filter((page) => page.startsWith('docs/docs/guides/')).length).toBe(guides.length);
  });

  it('quotes the draft counter of the contract that the compiler writes, and calls no handshake unstable now that it is one', () => {
    const contract = JSON.parse(readFileSync(join(ROOT, 'tools/contract/contract.json'), 'utf8')) as { abi: { draftCounter: number } };
    for (const base of ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current']) {
      const commandLine = readFileSync(join(ROOT, base, 'guides/command-line.md'), 'utf8');
      expect({ base, quoted: commandLine.includes(`(contract draft ${contract.abi.draftCounter})`) }).toEqual({ base, quoted: true });
      for (const guide of ['modbus', 'mqtt-sparkplug', 'cloud-blocks']) {
        const text = readFileSync(join(ROOT, base, 'guides', `${guide}.md`), 'utf8');
        expect({ base, guide, unstable: /unstable|inestable|being reworked|being fixed|se están (?:reelaborando|fijando)/i.test(text) }).toEqual({ base, guide, unstable: false });
      }
    }
  });

  it('lists every guide in the how-to category of the sidebar', async () => {
    const { default: sidebars } = await import(join(ROOT, 'docs/sidebars.js')) as { default: { docsSidebar: Array<{ label: string; items: unknown[] }> } };
    const howTo = sidebars.docsSidebar.find((category) => category.label === 'How-to guides')!.items;
    for (const page of pages) expect({ page, listed: howTo.includes(page.replace(/\.md$/, '')) }).toEqual({ page, listed: true });
  });
});

describe('the site footer names the latest release', () => {
  const footer = async (tag: string | undefined) => {
    const previous = process.env.ZPLC_RELEASE_TAG;
    if (tag === undefined) delete process.env.ZPLC_RELEASE_TAG; else process.env.ZPLC_RELEASE_TAG = tag;
    try {
      // a fresh query string loads the configuration again with the environment of this moment
      const config = (await import(`../../docs/docusaurus.config.js?release=${tag ?? 'none'}`)).default as { themeConfig: { footer: { copyright: string } } };
      return config.themeConfig.footer.copyright;
    } finally {
      if (previous === undefined) delete process.env.ZPLC_RELEASE_TAG; else process.env.ZPLC_RELEASE_TAG = previous;
    }
  };

  it('shows the tag that the deploy workflow passes', async () => {
    expect(await footer('v9.9.9-rc.1')).toContain('ZPLC v9.9.9-rc.1.');
  });

  it('shows the version of the tree when no tag is passed', async () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(await footer(undefined)).toContain(`ZPLC v${version}.`);
  });
});
