import { describe, expect, it } from 'bun:test';

import { checkRepository, isGuarded, violationsOf } from './learn-physical-guard';

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

  it('LRN-015 holds for every Learn source of the repository', () => {
    expect(checkRepository()).toEqual([]);
  });
});
