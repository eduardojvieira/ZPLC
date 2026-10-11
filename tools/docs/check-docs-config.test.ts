import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { addressesWithoutChannel, extractFragments, parityErrors, problemsOf, projectOf, schemaErrors, type Fragment } from './check-docs-config';
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

  it('holds for the pages of this repository: every fragment and scenario builds and passes', () => {
    const result = Bun.spawnSync(['bun', 'tools/docs/check-docs-config.ts'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });
});

describe('how-to guides: each task has a page in both languages with something that runs (DOC-009, stopgap: porting to a board, troubleshooting and the command line have no how-to page yet)', () => {
  const guides = ['map-io', 'modbus', 'mqtt-sparkplug', 'cloud-blocks', 'force-values', 'retained-variables', 'scenario-tests', 'project-archive'];
  const runnable = /^`{3,}(?:json zplc-(?:fragment|scenario)|st runnable|bash|ini)/m;

  it('has every guide in English and Spanish with a fragment, a runnable sample or a command, and says what is verified', () => {
    for (const guide of guides) {
      for (const base of ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current']) {
        const text = readFileSync(join(ROOT, base, 'guides', `${guide}.md`), 'utf8');
        expect({ guide, base, runnable: runnable.test(text) }).toEqual({ guide, base, runnable: true });
        expect({ guide, base, verified: /^## (?:What is verified|Qué está verificado)/m.test(text) }).toEqual({ guide, base, verified: true });
      }
    }
    expect(markdownFiles(ROOT, 'docs/docs').filter((page) => page.startsWith('docs/docs/guides/')).length).toBe(guides.length);
  });
});
