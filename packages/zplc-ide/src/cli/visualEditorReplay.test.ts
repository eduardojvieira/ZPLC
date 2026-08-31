import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFBDModel, serializeFBDModel } from '../models/fbd';
import { parseLDModel, serializeLDModel } from '../models/ld';
import { parseSFCModel, serializeSFCModel } from '../models/sfc';
import { recordVisualSnapshot, redoVisualSnapshot, undoVisualSnapshot } from '../editors/visualHistory';
import { copyFBDFragment, pasteFBDFragment } from '../editors/fbd/graphModel';
import { copySFCFragment, pasteSFCFragment } from '../editors/sfc/graphModel';
import { copyLDRungFragment, pasteLDRungFragment } from '../editors/ld/graphModel';
import { compilerCompile } from './toolApi';

const blinky = fileURLToPath(new URL('../../projects/blinky', import.meta.url));
const manifestPath = 'zplc.json';

async function temporaryVisualWorkspace(sourcePath: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-visual-replay-'));
  await mkdir(join(root, 'src'));
  const manifest = JSON.parse(await readFile(join(blinky, manifestPath), 'utf8')) as { tasks: Array<{ programs: string[] }> };
  manifest.tasks[0]!.programs = [sourcePath.replace(/\.json$/, '')];
  await Promise.all([
    writeFile(join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(join(root, 'src', sourcePath), content),
  ]);
  return root;
}

function replaySnapshot(key: string, original: string, edited: string): void {
  const recorded = recordVisualSnapshot(new Map(), key, original, edited);
  const undo = undoVisualSnapshot(recorded.histories, key, edited);
  expect(undo.content).toBe(original);
  expect(redoVisualSnapshot(undo.histories, key, original).content).toBe(edited);
}

async function expectCompiles(root: string): Promise<void> {
  const result = await compilerCompile(root);
  expect(result).toMatchObject({ ok: true, evidence: { operation: 'compile', outcome: 'passed' } });
  expect(result.ok && result.bytes).toBeInstanceOf(Uint8Array);
  expect(result.ok && result.evidence.artifacts).toHaveLength(1);
  expect(result.ok && result.evidence.artifacts[0]).toMatchObject({ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
}

describe('Blinky visual editor replay', () => {
  it('replays an FBD edit without losing blocks or connections, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.fbd.json'), 'utf8');
    const original = serializeFBDModel(parseFBDModel(canonical));
    const model = parseFBDModel(original);
    const edited = serializeFBDModel({ ...model, blocks: model.blocks.map((block) => block.id === 'not_enable' ? { ...block, comment: 'Reviewed NOT feedback' } : block) });
    replaySnapshot('blinky:fbd', original, edited);

    const root = await temporaryVisualWorkspace('main.fbd.json', edited);
    try {
      const reopened = parseFBDModel(await readFile(join(root, 'src/main.fbd.json'), 'utf8'));
      expect(reopened.blocks).toHaveLength(model.blocks.length);
      expect(reopened.connections).toEqual(model.connections);
      expect(reopened.blocks.find((block) => block.id === 'not_enable')?.comment).toBe('Reviewed NOT feedback');
      await expectCompiles(root);
    }
    finally { await rm(root, { recursive: true, force: true }); }
    expect(await readFile(join(blinky, 'src/main.fbd.json'), 'utf8')).toBe(canonical);
  });

  it('replays a pasted FBD node as one undoable canonical snapshot, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.fbd.json'), 'utf8');
    const model = parseFBDModel(canonical);
    const fragment = copyFBDFragment(model.blocks.map((block) => ({ id: block.id, type: 'block', position: block.position, selected: block.id === 'not_enable', data: block })), model.connections.map((connection) => ({ id: connection.id, source: connection.from.block, sourceHandle: connection.from.port, target: connection.to.block, targetHandle: connection.to.port })))!;
    const edited = serializeFBDModel(pasteFBDFragment(model, fragment)!);
    replaySnapshot('blinky:fbd-paste', serializeFBDModel(model), edited);
    const root = await temporaryVisualWorkspace('main.fbd.json', edited);
    try {
      const reopened = parseFBDModel(await readFile(join(root, 'src/main.fbd.json'), 'utf8'));
      expect(reopened.blocks).toHaveLength(model.blocks.length + 1);
      expect(reopened.connections).toEqual(model.connections);
      await expectCompiles(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('replays an LD edit without losing rungs, grid cells, or function blocks, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.ld.json'), 'utf8');
    const original = serializeLDModel(parseLDModel(canonical));
    const model = parseLDModel(original);
    const edited = serializeLDModel({ ...model, rungs: model.rungs.map((rung) => rung.id === 'rung_1' ? { ...rung, comment: 'Reviewed oscillator rung' } : rung) });
    replaySnapshot('blinky:ld', original, edited);

    const root = await temporaryVisualWorkspace('main.ld.json', edited);
    try {
      const reopened = parseLDModel(await readFile(join(root, 'src/main.ld.json'), 'utf8'));
      expect(reopened.rungs).toHaveLength(model.rungs.length);
      expect(reopened.rungs[0]?.grid).toEqual(model.rungs[0]?.grid);
      expect(reopened.rungs[0]?.grid?.flat().map((cell) => cell.element?.fbType).filter(Boolean)).toContain('TON');
      expect(reopened.rungs[0]?.comment).toBe('Reviewed oscillator rung');
      await expectCompiles(root);
    }
    finally { await rm(root, { recursive: true, force: true }); }
    expect(await readFile(join(blinky, 'src/main.ld.json'), 'utf8')).toBe(canonical);
  });

  it('replays a pasted LD rung as one undoable canonical snapshot, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.ld.json'), 'utf8');
    const model = parseLDModel(canonical);
    const fragment = copyLDRungFragment(model, 'rung_1')!;
    const pasted = pasteLDRungFragment(model, fragment, 'rung_1')!;
    const edited = serializeLDModel(pasted);
    replaySnapshot('blinky:ld-paste', serializeLDModel(model), edited);
    const root = await temporaryVisualWorkspace('main.ld.json', edited);
    try {
      const reopened = parseLDModel(await readFile(join(root, 'src/main.ld.json'), 'utf8'));
      expect(reopened.rungs).toHaveLength(model.rungs.length + 1);
      expect(reopened.variables.local.map((variable) => variable.name)).toContain('BlinkTimer_copy');
      expect(reopened.rungs[1]?.grid?.flat().map((cell) => cell.element?.instance).filter(Boolean)).toContain('BlinkTimer_copy');
      await expectCompiles(root);
    } finally { await rm(root, { recursive: true, force: true }); }
    expect(await readFile(join(blinky, 'src/main.ld.json'), 'utf8')).toBe(canonical);
  });

  it('replays an SFC edit without losing its initial step, transitions, or actions, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.sfc.json'), 'utf8');
    const original = serializeSFCModel(parseSFCModel(canonical));
    const model = parseSFCModel(original);
    const edited = serializeSFCModel({ ...model, steps: model.steps.map((step) => step.id === 'step_led_on' ? { ...step, comment: 'Reviewed initial state' } : step) });
    replaySnapshot('blinky:sfc', original, edited);

    const root = await temporaryVisualWorkspace('main.sfc.json', edited);
    try {
      const reopened = parseSFCModel(await readFile(join(root, 'src/main.sfc.json'), 'utf8'));
      expect(reopened.steps.find((step) => step.isInitial)?.id).toBe('step_led_on');
      expect(reopened.transitions.map(({ fromStep, toStep }) => [fromStep, toStep])).toEqual([['step_led_on', 'step_led_off'], ['step_led_off', 'step_led_on']]);
      expect(reopened.steps.find((step) => step.id === 'step_led_on')?.actions).toEqual(model.steps.find((step) => step.id === 'step_led_on')?.actions);
      expect(reopened.actions).toEqual(model.actions);
      expect(reopened.steps.find((step) => step.id === 'step_led_on')?.comment).toBe('Reviewed initial state');
      await expectCompiles(root);
    }
    finally { await rm(root, { recursive: true, force: true }); }
    expect(await readFile(join(blinky, 'src/main.sfc.json'), 'utf8')).toBe(canonical);
  });

  it('replays a pasted SFC step as one undoable canonical snapshot, then reopens and compiles it', async () => {
    const canonical = await readFile(join(blinky, 'src/main.sfc.json'), 'utf8');
    const model = parseSFCModel(canonical);
    const fragment = copySFCFragment(model.steps.map((step) => ({ id: step.id, type: 'step', position: step.position, selected: step.id === 'step_led_on', data: step })), [])!;
    const pasted = pasteSFCFragment(model, fragment)!;
    const edited = serializeSFCModel(pasted.model);
    replaySnapshot('blinky:sfc-paste', serializeSFCModel(model), edited);
    const root = await temporaryVisualWorkspace('main.sfc.json', edited);
    try {
      const reopened = parseSFCModel(await readFile(join(root, 'src/main.sfc.json'), 'utf8'));
      expect(reopened.steps).toHaveLength(model.steps.length + 1);
      expect(reopened.transitions).toEqual(model.transitions);
      expect(reopened.steps.filter((step) => step.isInitial)).toHaveLength(1);
      await expectCompiles(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
