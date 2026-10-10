import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { ROOT, renderPage } from './reference-lib';
import { GENERATOR, PAGES, SOURCES, schemaRows, sourceErrors } from './generate_source_references';
import { parseKconfig, parseShellCommands } from './source-parsers';

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const headingLevels = (text: string) => [...text.matchAll(/^(#{1,6}) /gm)].map((match) => match[1]!.length);

describe('source references: every source is understood (DOC-008)', () => {
  it('has a description for every command, scenario field and protocol parameter that its source holds', () => {
    expect(sourceErrors()).toEqual([]);
  });

  it('lists every Kconfig symbol of the module and every command of the shell', () => {
    const kconfig = PAGES.find((page) => page.path === 'reference/kconfig.md')!.body('en');
    for (const symbol of parseKconfig(read(SOURCES.kconfig))) expect([symbol.name, kconfig.includes(`\`CONFIG_${symbol.name}\``)]).toEqual([symbol.name, true]);
    const shell = PAGES.find((page) => page.path === 'reference/shell-commands.md')!.body('en');
    for (const command of parseShellCommands(read(SOURCES.shell))) expect([command.path.join(' '), shell.includes(`\`${command.path.join(' ')}\``)]).toEqual([command.path.join(' '), true]);
  });
});

describe('source references: the two languages say the same thing (DOC-008)', () => {
  it('gives each page the same headings and the same table rows in English and in Spanish', () => {
    for (const page of PAGES) {
      const english = page.body('en');
      const spanish = page.body('es');
      expect([page.path, headingLevels(spanish)]).toEqual([page.path, headingLevels(english)]);
      // the first cell of each row names the thing that the row is about; it is the same in both languages
      const subjects = (text: string) => text.split('\n').filter((line, index, lines) => line.startsWith('| ') && !line.startsWith('| ---') && lines[index - 1]?.startsWith('| ')).map((line) => line.split(' | ')[0]);
      expect([page.path, subjects(spanish)]).toEqual([page.path, subjects(english)]);
    }
  });

  it('renders each page with its markers, title and a closing sentence', () => {
    for (const page of PAGES) {
      for (const lang of ['en', 'es'] as const) {
        const text = renderPage(GENERATOR, page, lang);
        expect(text.startsWith('---\ntitle: ')).toBe(true);
        expect(text).toContain(`# ${page.title[lang]}`);
        expect(text.trimEnd().endsWith('.')).toBe(true);
      }
    }
  });
});

describe('source references: the project file schema is flattened to its fields (DOC-008)', () => {
  it('follows a reference, marks what an object requires and writes an array element as []', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, description: 'The name.' },
        io: { type: 'object', properties: { inputs: { type: 'array', items: { $ref: '#/definitions/point' } } } },
      },
      definitions: { point: { type: 'object', required: ['address'], properties: { address: { type: 'string' }, bits: { type: 'integer', default: 12, minimum: 1, maximum: 16 } } } },
    };
    expect(schemaRows(schema)).toEqual([
      { path: 'name', type: 'string (length >= 1)', required: true, default: '', description: 'The name.' },
      { path: 'io', type: 'object', required: false, default: '', description: '' },
      { path: 'io.inputs', type: 'array of object', required: false, default: '', description: '' },
      { path: 'io.inputs[].address', type: 'string', required: true, default: '', description: '' },
      { path: 'io.inputs[].bits', type: 'integer (1 to 16)', required: false, default: '12', description: '' },
    ]);
  });
});
