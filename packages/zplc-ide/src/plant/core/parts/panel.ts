import type { FactValue, ScenePart } from '../../contracts';
import type { PartRuntime, RuntimePartDefinition } from './items';
import { marker } from './sensors';

/** A part a person can operate: the core routes `operate` to the one that owns the signal. */
export interface OperableRuntime extends PartRuntime {
  operate(signal: string, value: boolean | number): boolean;
}
export const isOperable = (rt: PartRuntime): rt is OperableRuntime => 'operate' in rt;

const noFacts = (): Record<string, FactValue> => ({});
const noAction = (part: ScenePart) => (action: string) => {
  throw new Error(`part "${part.name}" has no action "${action}"`);
};

function buttonRuntime(part: ScenePart): OperableRuntime {
  let pressed = false;
  return {
    build() {},
    beforeStep() {},
    afterStep() {},
    operate(signal, value) {
      if (signal !== `${part.name}.pressed`) return false;
      pressed = value === true || (typeof value === 'number' && value !== 0);
      return true;
    },
    sense: () => ({ [`${part.name}.pressed`]: pressed }),
    facts: noFacts,
    act: noAction(part),
    views: () => [
      {
        id: part.id,
        part: 'push-button',
        name: part.name,
        pose: marker(part, 'push-button', [0.06, 0.04, 0.06]),
        state: { pressed },
        signals: { pressed },
      },
    ],
  };
}

function lightRuntime(part: ScenePart): PartRuntime {
  let lit = false;
  return {
    build() {},
    beforeStep(commands) {
      lit = commands[`${part.name}.lit`] === true;
    },
    afterStep() {},
    sense: () => ({}),
    facts: noFacts,
    act: noAction(part),
    views: () => [
      {
        id: part.id,
        part: 'indicator-light',
        name: part.name,
        pose: marker(part, 'indicator-light', [0.06, 0.06, 0.06]),
        state: { lit },
        signals: { lit },
      },
    ],
  };
}

/** Push button and indicator light: what a person presses and what the program lights. */
export const panelParts: readonly RuntimePartDefinition[] = [
  {
    id: 'push-button',
    family: 'panel',
    names: { en: 'Push button', es: 'Pulsador' },
    config: {},
    signals: (part) => [{ name: `${part.name}.pressed`, direction: 'sensor', type: 'BOOL' }],
    actions: [],
    snapPoints: () => [],
    doc: {
      en: 'A button a person presses in the 3D view or by script. Signal: pressed.',
      es: 'Un pulsador que una persona pulsa en la vista 3D o por guion. Señal: pressed.',
    },
    runtime: buttonRuntime,
  },
  {
    id: 'indicator-light',
    family: 'panel',
    names: { en: 'Indicator light', es: 'Piloto luminoso' },
    config: {},
    signals: (part) => [{ name: `${part.name}.lit`, direction: 'command', type: 'BOOL' }],
    actions: [],
    snapPoints: () => [],
    doc: {
      en: 'A light the program switches on. Signal: lit.',
      es: 'Una luz que el programa enciende. Señal: lit.',
    },
    runtime: lightRuntime,
  },
];
