import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { labSampleIndex, labSceneFrame, nextLabPlayback, recordedLabScenes, type LabScene } from './labPlayback';

describe('Lab playback', () => {
  test('clamps a selected sample', () => {
    expect(labSampleIndex(-2, 3)).toBe(0);
    expect(labSampleIndex(8, 3)).toBe(2);
    expect(labSampleIndex(1.8, 3)).toBe(1);
  });

  test('fails closed when there is no validated preview', () => {
    expect(recordedLabScenes({ kind: 'passed', message: 'ok', diagnostics: [], artifacts: [], hasEvidence: true })).toEqual([]);
  });

  test('projects exact recorded motor samples rather than index-derived animation', () => {
    const scene: LabScene = { id: 'motor', label: 'Motor', kind: 'motor', passed: true, assertions: [], samples: [
      { atMs: 100, command: false, running: false, atSpeed: false, speedPermilleAfterTick: 0 },
      { atMs: 900, command: true, running: true, atSpeed: true, speedPermilleAfterTick: 1000 },
    ] };
    expect(labSceneFrame(scene, 0)).toEqual({ kind: 'motor', atMs: 100, command: false, running: false, atSpeed: false, speedPermille: 0 });
    expect(labSceneFrame(scene, 1)).toEqual({ kind: 'motor', atMs: 900, command: true, running: true, atSpeed: true, speedPermille: 1000 });
    expect(labSceneFrame(scene, 101)).toEqual(labSceneFrame(scene, 1));
  });

  test('projects exact recorded tank values for distinct samples', () => {
    const scene: LabScene = { id: 'tank', label: 'Tank', kind: 'tank', passed: false, assertions: [], samples: [
      { atMs: 0, pump: 'STOPPED', alarm: 'NORMAL', levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 120 },
      { atMs: 500, pump: 'RUNNING', alarm: 'ALARM', levelLowInput: false, levelHighInput: true, levelPermilleAfterTick: 870 },
    ] };
    expect(labSceneFrame(scene, 0)).toMatchObject({ atMs: 0, pump: 'STOPPED', alarm: 'NORMAL', low: true, high: false, levelPermille: 120 });
    expect(labSceneFrame(scene, 1)).toMatchObject({ atMs: 500, pump: 'RUNNING', alarm: 'ALARM', low: false, high: true, levelPermille: 870 });
  });

  test('stops playback on the final recorded sample', () => {
    expect(nextLabPlayback(0, 2)).toEqual({ index: 1, playing: true });
    expect(nextLabPlayback(1, 2)).toEqual({ index: 1, playing: false });
  });

  test('keeps the Lab view recorded, manually controllable, and explicitly non-HIL', () => {
    const source = readFileSync(join(import.meta.dir, 'LabPanel.tsx'), 'utf8');
    expect(source).toContain('Recorded native POSIX host scenario — not live runtime, hardware, or HIL evidence.');
    expect(source).toContain('Run host scenarios');
    expect(source).toContain('Play');
    expect(source).toContain('Pause');
    expect(source).toContain('Step');
    expect(source).toContain('Reset');
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain('Playback is disabled while reduced motion is enabled.');
    expect(source).not.toContain('index %');
    expect(source).toContain("d={frame.diverter ? 'M350 100l28 22' : 'M350 100l0 30'}");
    expect(source).not.toContain('d="M350 100l${');
  });
});
