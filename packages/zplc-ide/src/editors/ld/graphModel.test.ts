import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseLDModel, serializeLDModel, type LDModel } from '../../models/ld';
import { transpileLDToST } from '../../transpiler/ldToST';
import { copyLDRungFragment, pasteLDRungFragment } from './graphModel';

const blinkyPath = fileURLToPath(new URL('../../../projects/blinky/src/main.ld.json', import.meta.url));

async function blinky(): Promise<LDModel> {
  return parseLDModel(await readFile(blinkyPath, 'utf8'));
}

function elementIds(model: LDModel): string[] {
  return model.rungs.flatMap((rung) => rung.grid?.flatMap((row) => row.flatMap((cell) => cell.element ? [cell.element.id] : [])) ?? rung.elements?.map((element) => element.id) ?? []);
}

describe('LD whole-rung clipboard', () => {
  it('clones Blinky rung_1 with an independent timer declaration and canonical output', async () => {
    const model = await blinky();
    const original = serializeLDModel(model);
    const fragment = copyLDRungFragment(model, 'rung_1');
    const pasted = fragment && pasteLDRungFragment(model, fragment, 'rung_1');

    expect(pasted).toBeDefined();
    expect(pasted?.rungs).toHaveLength(3);
    expect(pasted?.rungs.map((rung) => rung.number)).toEqual([1, 2, 3]);
    expect(pasted?.variables.local.map((variable) => variable.name)).toEqual(['BlinkTimer', 'BlinkTimer_copy']);
    expect(new Set(elementIds(pasted!)).size).toBe(elementIds(pasted!).length);
    expect(pasted?.rungs[1]?.grid?.flat().map((cell) => cell.element?.instance).filter(Boolean)).toContain('BlinkTimer_copy');
    expect(transpileLDToST(pasted).success).toBe(true);
    expect(serializeLDModel(model)).toBe(original);
  });

  it('uses the last candidate for deterministic repeated paste names', async () => {
    const model = await blinky();
    const fragment = copyLDRungFragment(model, 'rung_1')!;
    const once = pasteLDRungFragment(model, fragment, 'rung_1')!;
    const twice = pasteLDRungFragment(once, fragment, once.rungs[1]!.id)!;

    expect(twice.variables.local.map((variable) => variable.name)).toEqual(['BlinkTimer', 'BlinkTimer_copy', 'BlinkTimer_copy_2']);
    expect(twice.rungs.map((rung) => rung.number)).toEqual([1, 2, 3, 4]);
    expect(transpileLDToST(twice).success).toBe(true);
  });

  it('clones every function-block local, including BLINK, instead of sharing state', () => {
    const model: LDModel = {
      name: 'BlinkCopy',
      variables: { local: [{ name: 'PulseGen', type: 'BLINK' }], outputs: [] },
      rungs: [{
        id: 'rung_1', number: 1, gridConfig: { rows: 1, cols: 2, cellWidth: 80, cellHeight: 60 }, branches: [], grid: [[
          { element: { id: 'pulse_contact', type: 'contact_no', variable: 'PulseGen.Q', row: 0, col: 0 }, hasWire: true },
          { element: { id: 'pulse_block', type: 'function_block', fbType: 'BLINK', instance: 'PulseGen', parameters: {}, row: 0, col: 1 }, hasWire: true },
        ]],
      }],
    };
    expect(transpileLDToST(model).success).toBe(true);
    const fragment = copyLDRungFragment(model, 'rung_1');
    const pasted = fragment && pasteLDRungFragment(model, fragment, 'rung_1');

    expect(fragment?.localVariables.map((variable) => variable.name)).toEqual(['PulseGen']);
    expect(pasted?.variables.local.map((variable) => variable.name)).toEqual(['PulseGen', 'PulseGen_copy']);
    expect(pasted?.rungs[1]?.grid?.flat().map((cell) => cell.element?.instance).filter(Boolean)).toEqual(['PulseGen_copy']);
    expect(pasted?.rungs[1]?.grid?.[0]?.[0]?.element?.variable).toBe('PulseGen_copy.Q');
    expect(transpileLDToST(pasted).success).toBe(true);
  });

  it('selects an FB clone name that cannot collide with inputs or outputs', async () => {
    const model = await blinky();
    const guarded: LDModel = {
      ...model,
      variables: { ...model.variables, inputs: [{ name: 'BlinkTimer_copy', type: 'BOOL' }] },
    };
    const pasted = pasteLDRungFragment(guarded, copyLDRungFragment(guarded, 'rung_1')!, 'rung_1');

    expect(pasted?.variables.local.map((variable) => variable.name)).toContain('BlinkTimer_copy_2');
    expect(transpileLDToST(pasted).success).toBe(true);
  });

  it('deep-clones grid branches and rewrites only copied FB member contacts', async () => {
    const model = await blinky();
    const rung = structuredClone(model.rungs[0]!);
    rung.gridConfig = { ...rung.gridConfig!, rows: 2 };
    rung.grid![0]![1] = { element: { id: 'timer_contact', type: 'contact_no', variable: 'BlinkTimer.Q', row: 0, col: 1 }, hasWire: true };
    rung.grid!.push(Array.from({ length: 8 }, (_, col) => ({ element: col === 0 ? { id: 'parallel_contact', type: 'contact_no' as const, variable: 'LED_Output', row: 1, col } : null, hasWire: col === 0 })));
    rung.branches = [{ id: 'parallel_path', startCol: 0, endCol: 0, rows: [0, 1] }];
    const branched = { ...model, rungs: [rung, model.rungs[1]!] };
    const pasted = pasteLDRungFragment(branched, copyLDRungFragment(branched, 'rung_1')!, 'rung_1')!;
    const clone = pasted.rungs[1]!;

    expect(clone.gridConfig).toEqual(rung.gridConfig);
    expect(clone.branches?.[0]).toMatchObject({ id: 'parallel_path_copy', startCol: 0, endCol: 0, rows: [0, 1] });
    expect(clone.grid?.[0]?.[1]?.element?.variable).toBe('BlinkTimer_copy.Q');
    expect(clone.grid?.[1]?.[0]?.element?.variable).toBe('LED_Output');
    expect(transpileLDToST(pasted).success).toBe(true);

    const fragment = copyLDRungFragment(branched, 'rung_1')!;
    expect(pasteLDRungFragment(branched, { ...fragment, rung: { ...fragment.rung, branches: [...fragment.rung.branches!, { id: 'nested_path', startCol: 1, endCol: 2, rows: [0, 1], parentBranchId: 'parallel_path' }] } }, 'rung_1')).toBeUndefined();
    expect(pasteLDRungFragment(branched, { ...fragment, rung: { ...fragment.rung, branches: [...fragment.rung.branches!, { id: 'overlap_path', startCol: 0, endCol: 1, rows: [0, 1] }] } }, 'rung_1')).toBeUndefined();
  });

  it('fails closed for duplicate writers, malformed topology, and missing or mismatched FB locals', async () => {
    const model = await blinky();
    const original = serializeLDModel(model);
    const outputWriter = copyLDRungFragment(model, 'rung_2')!;
    expect(pasteLDRungFragment(model, outputWriter, 'rung_2')).toBeUndefined();

    const timer = copyLDRungFragment(model, 'rung_1')!;
    expect(copyLDRungFragment({ ...model, variables: { ...model.variables, local: [] } }, 'rung_1')).toBeUndefined();
    expect(pasteLDRungFragment(model, { ...timer, localVariables: [] }, 'rung_1')).toBeUndefined();
    expect(pasteLDRungFragment(model, { ...timer, localVariables: [{ ...timer.localVariables[0]!, type: 'TOF' }] }, 'rung_1')).toBeUndefined();
    expect(pasteLDRungFragment(model, { ...timer, rung: { ...timer.rung, grid: [[{ element: null, hasWire: false }]] } }, 'rung_1')).toBeUndefined();
    expect(serializeLDModel(model)).toBe(original);
  });
});
