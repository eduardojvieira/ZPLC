import {
  presentRecordedConveyorPlant,
  presentRecordedMotorPlant,
  presentRecordedPedestrianCrossing,
  presentRecordedTankLevel,
  type WorkspaceTestPresentation,
  type RecordedMotorPlant,
  type RecordedConveyorPlant,
  type RecordedTankLevel,
  type RecordedPedestrianCrossing,
} from './workspaceTestPresentation';

export type LabSceneKind = 'motor' | 'conveyor' | 'tank' | 'pedestrian';

interface LabSceneBase {
  id: string;
  label: string;
  passed: boolean;
  assertions: Array<{ kind: string; passed: boolean; atMs?: number }>;
}

export type LabScene =
  | (LabSceneBase & { kind: 'motor'; samples: RecordedMotorPlant['samples'] })
  | (LabSceneBase & { kind: 'conveyor'; samples: RecordedConveyorPlant['samples'] })
  | (LabSceneBase & { kind: 'tank'; samples: RecordedTankLevel['samples'] })
  | (LabSceneBase & { kind: 'pedestrian'; samples: RecordedPedestrianCrossing['samples'] });

export type LabSceneFrame =
  | { kind: 'motor'; atMs: number; command: boolean; running: boolean; atSpeed: boolean; speedPermille: number }
  | { kind: 'conveyor'; atMs: number; belt: boolean; diverter: boolean; fault: boolean; classifier: boolean; metal: boolean; diverterSensor: boolean; jam: boolean; classifiedCount: number }
  | { kind: 'tank'; atMs: number; pump: 'RUNNING' | 'STOPPED'; alarm: 'ALARM' | 'NORMAL'; low: boolean; high: boolean; levelPermille: number }
  | { kind: 'pedestrian'; atMs: number; vehicle: 'RED' | 'YELLOW' | 'GREEN' | 'CLEAR'; pedestrian: 'WALK' | 'STOP'; request: 'ACTIVE' | 'CLEAR'; phase: 'APPROACHING' | 'WAITING' | 'CROSSING' | 'CLEARED' };

/** Only exposes complete, validated test previews; Lab never fabricates live state. */
export function recordedLabScenes(presentation: WorkspaceTestPresentation | null): LabScene[] {
  if (!presentation?.preview) return [];
  const scenes: LabScene[] = [];
  for (const scenario of presentation.preview.scenarios) {
    const motor = presentRecordedMotorPlant(scenario);
    if (motor) { scenes.push({ id: scenario.id, label: 'Motor start / stop', kind: 'motor', samples: motor.samples, passed: scenario.passed, assertions: scenario.assertions }); continue; }
    const conveyor = presentRecordedConveyorPlant(scenario);
    if (conveyor) { scenes.push({ id: scenario.id, label: 'Conveyor classification', kind: 'conveyor', samples: conveyor.samples, passed: scenario.passed, assertions: scenario.assertions }); continue; }
    const tank = presentRecordedTankLevel(scenario);
    if (tank) { scenes.push({ id: scenario.id, label: 'Tank level', kind: 'tank', samples: tank.samples, passed: scenario.passed, assertions: scenario.assertions }); continue; }
    const pedestrian = presentRecordedPedestrianCrossing(scenario);
    if (pedestrian) scenes.push({ id: scenario.id, label: 'Pedestrian crossing', kind: 'pedestrian', samples: pedestrian.samples, passed: scenario.passed, assertions: scenario.assertions });
  }
  return scenes;
}

export function labSampleIndex(index: number, sampleCount: number): number {
  return sampleCount > 0 ? Math.max(0, Math.min(sampleCount - 1, Math.trunc(index))) : 0;
}

export function nextLabPlayback(index: number, sampleCount: number): { index: number; playing: boolean } {
  const current = labSampleIndex(index, sampleCount);
  return current >= sampleCount - 1 ? { index: current, playing: false } : { index: current + 1, playing: true };
}

/** Maps a validated sample exactly once for a renderer; no elapsed-time interpolation exists. */
export function labSceneFrame(scene: LabScene, index: number): LabSceneFrame {
  switch (scene.kind) {
    case 'motor': { const sample = scene.samples[labSampleIndex(index, scene.samples.length)]!; return { kind: 'motor', atMs: sample.atMs, command: sample.command, running: sample.running, atSpeed: sample.atSpeed, speedPermille: sample.speedPermilleAfterTick }; }
    case 'conveyor': { const sample = scene.samples[labSampleIndex(index, scene.samples.length)]!; return { kind: 'conveyor', atMs: sample.atMs, belt: sample.beltCommand, diverter: sample.diverterCommand, fault: sample.faultLamp, classifier: sample.partAtClassifierInput, metal: sample.metalDetectedInput, diverterSensor: sample.partAtDiverterInput, jam: sample.jamDetectedInput, classifiedCount: sample.classifiedCountAfterTick }; }
    case 'tank': { const sample = scene.samples[labSampleIndex(index, scene.samples.length)]!; return { kind: 'tank', atMs: sample.atMs, pump: sample.pump, alarm: sample.alarm, low: sample.levelLowInput, high: sample.levelHighInput, levelPermille: sample.levelPermilleAfterTick }; }
    case 'pedestrian': { const sample = scene.samples[labSampleIndex(index, scene.samples.length)]!; return { kind: 'pedestrian', atMs: sample.atMs, vehicle: sample.vehicle, pedestrian: sample.pedestrian, request: sample.request, phase: sample.phase }; }
  }
}
