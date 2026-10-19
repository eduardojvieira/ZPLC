import { describe, expect, it } from 'bun:test';

import { PLANT_KINDS, createPlantRun, traceHash, tracePlant } from './plantEngine';

describe('plant engine (LRN-018, LRN-019)', () => {
  it('knows the four plants and what each reads, drives and can fail', () => {
    expect(PLANT_KINDS).toEqual(['motor-v1', 'conveyor-v1', 'tank-v1', 'pedestrian-v1']);
    const run = createPlantRun('motor-v1');
    expect(run.model.reads).toEqual(['command']);
    expect(run.model.drives).toEqual(['atSpeed']);
    expect(run.model.actions).toEqual(['stall']);
  });

  it('spins the motor up while commanded, down when not, and reports at speed', () => {
    const run = createPlantRun('motor-v1');
    for (let i = 0; i < 9; i += 1) run.tick({ command: true });
    expect(run.state.speed).toBe(900);
    expect(run.sense().atSpeed).toBe(true);
    run.tick({ command: false });
    expect(run.state.speed).toBe(800);
    expect(run.sense().atSpeed).toBe(false);
  });

  it('a stalled motor never reaches speed, whatever the program commands', () => {
    const run = createPlantRun('motor-v1');
    run.act('stall');
    for (let i = 0; i < 20; i += 1) run.tick({ command: true });
    expect(run.state.speed).toBe(0);
    expect(run.sense().atSpeed).toBe(false);
  });

  it('pause freezes the plant, step advances exactly one scan, play resumes', () => {
    const run = createPlantRun('tank-v1');
    run.tick({ pump: true });
    const before = run.state.level;
    run.setPaused(true);
    run.tick({ pump: true });
    expect(run.state.level).toBe(before);
    run.step({ pump: true });
    expect(run.state.level).not.toBe(before);
    expect(run.tickCount).toBe(2);
    run.setPaused(false);
    run.tick({ pump: true });
    expect(run.tickCount).toBe(3);
  });

  it('the tank fills with the pump, drains without it, and a pump failure stops the flow and raises the input', () => {
    const run = createPlantRun('tank-v1');
    expect(run.state.level).toBe(500);
    run.tick({ pump: true });
    expect(run.state.level).toBe(512);
    run.act('pumpFault');
    run.tick({ pump: true });
    expect(run.state.level).toBe(504);
    expect(run.sense().pumpFault).toBe(true);
    for (let i = 0; i < 70; i += 1) run.tick({ pump: false });
    expect(run.state.level).toBe(0);
    expect(run.sense().levelLow).toBe(true);
  });

  it('the conveyor moves a part to the classifier and diverter sensors, counts it, and a jam stops it', () => {
    const run = createPlantRun('conveyor-v1');
    const seen = new Set<string>();
    for (let i = 0; i < 30; i += 1) { run.tick({ belt: true, diverter: false }); for (const [k, v] of Object.entries(run.sense())) if (v) seen.add(k); }
    expect([...seen].sort()).toEqual(['partAtClassifier', 'partAtDiverter']);
    expect(run.state.classified).toBe(1);
    run.act('jam');
    const position = run.state.position;
    run.tick({ belt: true, diverter: false });
    expect(run.state.position).toBe(position);
    expect(run.sense().jamDetected).toBe(true);
  });

  it('the pedestrian crossing waits for WALK, crosses, and a blocked vehicle holds the pedestrian back', () => {
    const run = createPlantRun('pedestrian-v1');
    const dark = { vehicleRed: false, vehicleYellow: false, vehicleGreen: true, pedWalk: false, pedStop: true };
    run.act('request');
    expect(run.state.phase).toBe('waiting');
    expect(run.sense().pedRequest).toBe(true);
    run.tick(dark);
    expect(run.state.phase).toBe('waiting');
    run.tick({ ...dark, vehicleRed: true, vehicleGreen: false, pedWalk: true, pedStop: false });
    expect(run.state.phase).toBe('crossing');
    for (let i = 0; i < 40; i += 1) run.tick({ ...dark, vehicleRed: true, vehicleGreen: false, pedWalk: true, pedStop: false });
    expect(run.state.phase).toBe('cleared');
    expect(run.sense().pedRequest).toBe(false);
  });

  it('gives the same trace on every run and matches the pinned golden hashes (LRN-019)', () => {
    const scripts = Object.fromEntries(PLANT_KINDS.map((kind) => [kind, tracePlant(kind, 120, motorProgramFor(kind), { 40: [createPlantRun(kind).model.actions[0]!] })]));
    for (const kind of PLANT_KINDS) {
      expect(traceHash(scripts[kind]!)).toBe(traceHash(tracePlant(kind, 120, motorProgramFor(kind), { 40: [createPlantRun(kind).model.actions[0]!] })));
    }
    expect(Object.fromEntries(PLANT_KINDS.map((kind) => [kind, traceHash(scripts[kind]!)]))).toEqual(GOLDEN);
  });
});

function motorProgramFor(kind: string) {
  if (kind === 'motor-v1') return (tick: number) => ({ command: tick % 50 < 30 });
  if (kind === 'conveyor-v1') return (tick: number) => ({ belt: tick % 60 < 45, diverter: tick % 17 < 4 });
  if (kind === 'tank-v1') return (tick: number, sensed: Record<string, boolean>) => ({ pump: sensed.levelLow ? true : tick % 7 < 3 });
  return (tick: number) => ({ vehicleRed: tick % 40 > 20, vehicleYellow: false, vehicleGreen: tick % 40 <= 20, pedWalk: tick % 40 > 24, pedStop: tick % 40 <= 24 });
}
const GOLDEN: Record<string, string> = { 'conveyor-v1': 'e50d12a6', 'motor-v1': '16e1f1ed', 'pedestrian-v1': '5faddcd8', 'tank-v1': '4a6a21be' };
