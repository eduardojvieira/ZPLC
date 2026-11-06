import { describe, expect, it } from 'bun:test';

import { checkRepository, isGuarded, seamViolationsOf, TRY_LAB, violationsOf } from './learn-physical-guard';

const LEARN = 'packages/zplc-ide/src/learn/sample.ts';
const rulesOf = (text: string): string[] => violationsOf({ path: LEARN, text }).map((violation) => violation.rule);

describe('Learn starts no physical operation by itself (LRN-015)', () => {
  it('LRN-015 finds an import of a module that reaches a device', () => {
    expect(rulesOf("import { connectionManager } from '../runtime/connectionManager';")).toEqual(['device-module']);
    expect(rulesOf("import { useDebugController } from '../hooks/useDebugController';")).toEqual(['device-module']);
    expect(rulesOf("import { performHardwareDeploy } from '../components/deployFlow';")).toEqual(['device-module']);
    expect(rulesOf("const uploader = await import('../uploader/webserial');")).toEqual(['device-module']);
    // The interface of a session is not a device: the recorder reads through it.
    expect(rulesOf("import type { IDebugAdapter } from '../runtime/debugAdapter';")).toEqual([]);
  });

  it('LRN-015 finds a call that connects, deploys, runs, stops, forces, writes, opens a port or flashes', () => {
    for (const call of [
      'adapter.connect()',
      'session.loadProgram(bytes)',
      'adapter.start()',
      'adapter.stop()',
      'adapter.forceValue(0, b)',
      'adapter.setValue(0, b)',
      'adapter.pokeN(0, b)',
      'link.sendRaw("x")',
      'navigator.serial.requestPort()',
      'tool.flashImage(i)',
    ]) {
      expect(rulesOf(`void ${call};`)).toEqual(['physical-call']);
    }
    expect(rulesOf('await useLearnUi.getState().startLesson(id); restoreLesson(id); session.readWatchVariables(v);')).toEqual([]);
  });

  it('LRN-015 guards the Learn modules and components, not their tests or other surfaces', () => {
    expect(isGuarded('packages/zplc-ide/src/learn/learnUi.ts')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/components/LearnPanel.tsx')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/components/learnLesson.ts')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/learn/hardwareRecorder.test.ts')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/components/Toolbar.tsx')).toBe(false);
  });

  it('LRN-015 LRN-041 lets the try-it lab seam use only its own WASM session', () => {
    const seamRules = (text: string): string[] => seamViolationsOf({ path: TRY_LAB, text }).map((violation) => violation.rule);
    expect(seamRules("import { createWASMAdapter } from './wasmAdapter';")).toEqual([]);
    expect(seamRules('await adapter.connect(); await adapter.loadProgram(bytes); await adapter.setValue(a, b);')).toEqual([]);
    expect(seamRules("import { NativeAdapter } from './nativeAdapter';")).toEqual(['device-module']);
    expect(seamRules("import { connectionManager } from './connectionManager';")).toEqual(['device-module']);
    expect(seamRules("import { SerialAdapter } from './serialAdapter';")).toEqual(['device-module']);
    expect(seamRules("import { useIDEStore } from '../store/useIDEStore';")).toEqual(['device-module']);
    expect(seamRules("import { useDebugController } from '../hooks/useDebugController';")).toEqual(['device-module']);
    for (const call of [
      'adapter.forceValue(0, b)',
      'adapter.setVirtualInput(0, 1)',
      'navigator.serial.requestPort()',
      'tool.flashImage(i)',
    ]) {
      expect(seamRules(`void ${call};`)).toEqual(['physical-call']);
    }
    // The Learn side reaches the lab only through the seam, whose verbs name the lab and not a device.
    expect(rulesOf("import { openTryLab } from '../../runtime/tryLab'; lab.run(); lab.press('Button', true); lab.close();")).toEqual([]);
  });

  it('LRN-015 closes the ways round the try-it lab seam', () => {
    const seamRules = (text: string): string[] => seamViolationsOf({ path: TRY_LAB, text }).map((violation) => violation.rule);
    // inside the seam: the factory that returns the native session under Electron, and the runtime barrel
    expect(seamRules("import { createSimulationAdapter as make } from './simulationAdapterFactory';")).toEqual(['device-module']);
    expect(seamRules("import { createSimulationAdapter } from '.';")).toEqual(['device-module']);
    expect(seamRules("import { createSerialAdapter } from './index';")).toEqual(['device-module']);
    expect(seamRules("import { createWASMAdapter } from './wasmAdapter';")).toEqual([]);
    // from Learn: the factory, the barrel, and the open call that takes an adapter of its own
    const evil = 'packages/zplc-ide/src/learn/reading/Evil.tsx';
    const learnRules = (text: string): string[] => violationsOf({ path: evil, text }).map((violation) => violation.rule);
    expect(learnRules("import { createSimulationAdapter } from '../../runtime/simulationAdapterFactory';")).toEqual(['device-module']);
    expect(learnRules("import { createSerialAdapter } from '../../runtime';")).toEqual(['device-module']);
    expect(learnRules("import { createSerialAdapter } from '../../runtime/index';")).toEqual(['device-module']);
    expect(learnRules("import { openTryLabWith } from '../../runtime/tryLab';")).toEqual(['physical-call']);
    expect(learnRules('const opened = openTryLabWith(text, spec, make);')).toEqual(['physical-call']);
    expect(learnRules("import { openTryLab } from '../../runtime/tryLab'; const o = openTryLab(text, spec);")).toEqual([]);
  });

  it('LRN-015 holds for every Learn source of the repository', () => {
    expect(checkRepository()).toEqual([]);
  });
});
