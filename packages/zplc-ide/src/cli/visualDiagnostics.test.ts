import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilerCompile } from './toolApi';

const projects = fileURLToPath(new URL('../../projects', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Build a one-program project whose program is `main<extension>` with `content`; the diagnostics of the build. */
async function diagnosticsOf(extension: string, content: string): Promise<Array<{ code: string; message: string; path?: string; line?: number; element?: string }>> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-visual-diagnostics-'));
  roots.push(root);
  await mkdir(join(root, 'src'));
  const manifest = JSON.parse(await readFile(join(projects, 'blinky', 'zplc.json'), 'utf8')) as { tasks: Array<{ programs: string[] }> };
  manifest.tasks[0]!.programs = [`main${extension.replace(/\.json$/, '')}`];
  await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'src', `main${extension}`), content);
  const result = await compilerCompile(root);
  expect(result.ok).toBe(false);
  return result.evidence.diagnostics;
}

const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(projects, path), 'utf8')) as T;

interface LdCell { element: { id: string; type: string; variable?: string } | null }
interface LdDocument { rungs: Array<{ id: string; grid: LdCell[][] }> }
interface FbdDocument { blocks: Array<{ id: string; type: string; variableName?: string }>; connections: Array<{ id: string; from: { block: string; port: string }; to: { block: string; port: string } }> }
interface SfcDocument {
  steps: Array<{ id: string; actions?: Array<{ qualifier: string; actionName: string }> }>;
  transitions: Array<{ id: string; condition: string }>;
  actions: Array<{ id: string; name: string; body: string }>;
}

describe('LNG-003 a Ladder diagnostic names the rung and the cell', () => {
  it('names the cell of a contact that reads a variable the diagram does not declare', async () => {
    const model = await read<LdDocument>('blinky/src/main.ld.json');
    const rung = model.rungs[0]!;
    const col = rung.grid[0]!.findIndex((cell) => cell.element?.type === 'contact_nc' || cell.element?.type === 'contact_no');
    expect(col).toBeGreaterThanOrEqual(0);
    rung.grid[0]![col]!.element!.variable = 'Missing';

    const diagnostics = await diagnosticsOf('.ld.json', JSON.stringify(model));
    expect(diagnostics).toEqual([expect.objectContaining({
      code: 'COMPILATION_FAILED', path: 'src/main.ld.json', element: `rung:${rung.id}/cell:0,${col}`,
      message: expect.stringContaining("'Missing'"),
    })]);
  });

  it('names the element of a rung that is a list of elements', async () => {
    const legacy = await readFile(join(import.meta.dir, '../../../../conformance/lng/cmp-001-ld-contact-undeclared-variable.ld.json'), 'utf8');
    const diagnostics = await diagnosticsOf('.ld.json', legacy);
    expect(diagnostics).toEqual([expect.objectContaining({ path: 'src/main.ld.json', element: 'rung:rung1/element:c1' })]);
  });

  it('gives each rung its own diagnostic', async () => {
    const model = await read<LdDocument>('blinky/src/main.ld.json');
    const wrong = model.rungs.map((rung) => {
      const col = rung.grid[0]!.findIndex((cell) => cell.element?.variable !== undefined && cell.element.type.startsWith('contact'));
      if (col >= 0) rung.grid[0]![col]!.element!.variable = 'Missing';
      return col >= 0 ? `rung:${rung.id}/cell:0,${col}` : undefined;
    }).filter((element): element is string => element !== undefined);
    expect(wrong.length).toBeGreaterThanOrEqual(1);

    const diagnostics = await diagnosticsOf('.ld.json', JSON.stringify(model));
    expect(diagnostics.map((diagnostic) => diagnostic.element)).toEqual(wrong);
  });
});

describe('LNG-003 an FBD diagnostic names the block or the wire', () => {
  it('names each block whose statement the compiler refuses in the generated source', async () => {
    const model = await read<FbdDocument>('blinky_fbd/src/main.fbd.json');
    // a block that reads a variable has no statement of its own: the blocks it feeds are the ones written with the name
    const reader = model.blocks.find((block) => block.type === 'variable' && model.connections.some((wire) => wire.from.block === block.id))!;
    const consumers = model.connections.filter((wire) => wire.from.block === reader.id).map((wire) => `block:${wire.to.block}`).sort();
    reader.variableName = 'Undeclared';

    const diagnostics = await diagnosticsOf('.fbd.json', JSON.stringify(model));
    expect(diagnostics.map((diagnostic) => diagnostic.element).sort()).toEqual(consumers);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.path).toBe('src/main.fbd.json');
      expect(diagnostic.message).toContain(`FBD block '${diagnostic.element!.slice('block:'.length)}'`);
      expect(diagnostic.message).toContain("'Undeclared'");
    }
  });

  it('names a block whose input is not wired, once for each such block', async () => {
    const model = await read<FbdDocument>('blinky_fbd/src/main.fbd.json');
    const gates = model.blocks.filter((block) => block.type === 'NOT' || block.type === 'output').slice(0, 2);
    expect(gates).toHaveLength(2);
    model.connections = model.connections.filter((connection) => !gates.some((gate) => gate.id === connection.to.block));

    const diagnostics = await diagnosticsOf('.fbd.json', JSON.stringify(model));
    expect(diagnostics.map((diagnostic) => diagnostic.element).sort()).toEqual(gates.map((gate) => `block:${gate.id}`).sort());
    for (const diagnostic of diagnostics) expect(diagnostic.message).toContain('is not wired');
  });

  it('names the wire that leaves a block that is not on the diagram', async () => {
    const model = await read<FbdDocument>('blinky_fbd/src/main.fbd.json');
    model.connections[0]!.from.block = 'ghost';

    const diagnostics = await diagnosticsOf('.fbd.json', JSON.stringify(model));
    expect(diagnostics).toEqual([expect.objectContaining({ element: `connection:${model.connections[0]!.id}`, message: expect.stringContaining('unknown source block') })]);
  });
});

describe('LNG-003 and LNG-026 an SFC diagnostic names the step, the transition or the action', () => {
  it('names the action whose body the compiler refuses', async () => {
    const model = await read<SfcDocument>('blinky_sfc/src/main.sfc.json');
    const action = model.actions[0]!;
    action.body = `Undeclared := TRUE;\n${action.body}`;

    const diagnostics = await diagnosticsOf('.sfc.json', JSON.stringify(model));
    expect(diagnostics).toEqual([expect.objectContaining({
      path: 'src/main.sfc.json', element: `action:${action.id}`,
      message: expect.stringContaining(`SFC action '${action.id}' body:`),
    })]);
    expect(diagnostics[0]!.message).toContain("'Undeclared'");
  });

  it('names the transition whose condition the compiler refuses', async () => {
    const model = await read<SfcDocument>('blinky_sfc/src/main.sfc.json');
    const transition = model.transitions[0]!;
    transition.condition = 'Undeclared';

    const diagnostics = await diagnosticsOf('.sfc.json', JSON.stringify(model));
    expect(diagnostics).toEqual([expect.objectContaining({
      path: 'src/main.sfc.json', element: `transition:${transition.id}`,
      message: expect.stringContaining(`SFC transition '${transition.id}' condition:`),
    })]);
  });

  it('names the action and the transition when each has an error, in the order of the generated source', async () => {
    const model = await read<SfcDocument>('blinky_sfc/src/main.sfc.json');
    model.actions[0]!.body = 'Undeclared := TRUE;';
    model.transitions[0]!.condition = 'AlsoUndeclared';

    const diagnostics = await diagnosticsOf('.sfc.json', JSON.stringify(model));
    expect(diagnostics.map((diagnostic) => diagnostic.element)).toEqual([`action:${model.actions[0]!.id}`, `transition:${model.transitions[0]!.id}`]);
  });

  it('names the step whose action qualifier the transpiler does not translate', async () => {
    const model = await read<SfcDocument>('blinky_sfc/src/main.sfc.json');
    const step = model.steps.find((candidate) => (candidate.actions?.length ?? 0) > 0)!;
    step.actions![0]!.qualifier = 'SD';

    const diagnostics = await diagnosticsOf('.sfc.json', JSON.stringify(model));
    expect(diagnostics).toEqual([expect.objectContaining({ element: `step:${step.id}`, message: expect.stringContaining('qualifier') })]);
  });
});

describe('LNG-003 an IL diagnostic names its line', () => {
  const program = (body: string) => `PROGRAM Main\nVAR\n  Lamp AT %QX0.0 : BOOL;\n  Sw AT %IX0.0 : BOOL;\nEND_VAR\n${body}\nEND_PROGRAM\n`;

  it('names the line of each instruction that does not translate, not only the first', async () => {
    const diagnostics = await diagnosticsOf('.il', program('  LD Sw\n  ST Nope\n  LD Sw\n  ST Missing\n'));
    expect(diagnostics.map((diagnostic) => [diagnostic.element, diagnostic.line])).toEqual([['line:7', 7], ['line:9', 9]]);
  });

  it('names the IL line of an error the compiler finds in the generated source', async () => {
    const diagnostics = await diagnosticsOf('.il', program('  LD Sw\n  CAL Lamp()\n'));
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0]!.element).toMatch(/^line:\d+$/);
    expect(diagnostics[0]!.line).toBe(Number(diagnostics[0]!.element!.slice(5)));
  });
});
