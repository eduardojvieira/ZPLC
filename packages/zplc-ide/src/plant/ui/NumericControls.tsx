/**
 * The operator panel's numeric parts (VIS-010): a potentiometer slider, a selector list, an emergency-stop toggle, and the
 * readouts of a numeric display, a stack light and a tank. Every control is native, so the pointer and the keyboard both work,
 * and every readout carries text and a marker other than colour. They read a part's `PartView` (the view state keys of
 * `plan-m2.md`) and write through `core.operate`.
 */
import { useState } from 'react';
import { useT } from '../../i18n';
import { Button, RangeField, Select } from '../../ui';
import type { PartView, PlantCore, ScenePart } from '../contracts';
import { catalogue } from '../core/catalogue';

const num = (view: PartView, key: string, fallback = 0) => (typeof view.state[key] === 'number' ? (view.state[key] as number) : fallback);
const str = (view: PartView, key: string) => (typeof view.state[key] === 'string' ? (view.state[key] as string) : '');

export interface ControlProps {
  part: ScenePart;
  view: PartView | undefined;
  core: PlantCore;
  /** Runs an operation and shows a refusal as the panel's message. */
  run: (action: () => void) => void;
}

export function PotentiometerControl({ part, view, core, run }: ControlProps) {
  const { t } = useT();
  // The value being set, until the plant reports one: a controlled input is put back to its prop right after onChange, so
  // without it a drag snaps back and the next arrow press steps from the old value. `base` is the reported value it was set
  // against; once the plant reports another value the draft is dropped (derived, no effect), and so it is on blur.
  const [draft, setDraft] = useState<{ value: number; base: number } | undefined>();
  if (!view) return null;
  const [min, max, reported, unit] = [num(view, 'min'), num(view, 'max', 100), num(view, 'value'), str(view, 'unit')];
  const value = draft && draft.base === reported ? draft.value : reported;
  return (
    <RangeField
      label={part.name}
      data-plant-pot={part.name}
      min={min}
      max={max}
      step={(max - min) / 100 || 1}
      value={value}
      aria-valuetext={t('plant.panel.valueText', { value: String(Math.round(value * 10) / 10), unit })}
      onBlur={() => setDraft(undefined)}
      onChange={(event) => {
        const next = Number(event.target.value);
        setDraft({ value: next, base: reported });
        run(() => void core.operate(`${part.name}.value`, next));
      }}
    />
  );
}

export function SelectorControl({ part, view, core, run }: ControlProps) {
  const { t } = useT();
  if (!view) return null;
  const positions = Math.round(num(view, 'positions', 2));
  const integer = part.config.output === 'integer';
  return (
    <Select
      label={part.name}
      data-plant-selector={part.name}
      value={String(num(view, 'position'))}
      onChange={(event) => {
        const n = Number(event.target.value);
        run(() => void (integer ? core.operate(`${part.name}.position`, n) : core.operate(`${part.name}.pos${n}`, true)));
      }}
    >
      {Array.from({ length: positions }, (_, k) => (
        <option key={k} value={String(k)}>
          {t('plant.panel.position', { n: k })}
        </option>
      ))}
    </Select>
  );
}

export function EmergencyStopControl({ part, view, core, run }: ControlProps) {
  const { t } = useT();
  const pressed = view?.state.pressed === true;
  return (
    <Button
      data-plant-estop={part.name}
      aria-pressed={pressed}
      onClick={() => run(() => void core.operate(`${part.name}.pressed`, !pressed))}
    >
      {pressed ? '▲' : '○'} {t('plant.panel.estop', { name: part.name })}
      {': '}
      {t(pressed ? 'plant.panel.estopPressed' : 'plant.panel.estopReleased')}
    </Button>
  );
}

const LAMPS = [
  ['red', 'plant.panel.lampRed'],
  ['amber', 'plant.panel.lampAmber'],
  ['green', 'plant.panel.lampGreen'],
] as const;

// A diverter at rest reads one of these; any other text (extended, diverted, raised, left, right) is the active marker.
const HOME_TEXTS = ['retracted', 'home', 'lowered', 'centre'];

// The M5 stations read their own `text` (the crane and the machining centre are `stations`: matched before the manipulators).
const STATIONS: Record<string, 'plant.panel.lift' | 'plant.panel.crane' | 'plant.panel.machine'> = {
  lift: 'plant.panel.lift',
  'stacker-crane': 'plant.panel.crane',
  'machining-centre': 'plant.panel.machine',
} as const;

const isManipulator = (id: string) => ['manipulators', 'stations'].includes(catalogue.get(id)?.family ?? '');

/** A readout: a numeric display, a stack light or a tank, as text. */
export function Readout({ part, view }: Pick<ControlProps, 'part' | 'view'>) {
  const { t } = useT();
  if (!view) return null;
  if (part.part === 'numeric-display')
    return (
      <span data-plant-display={part.name} className="text-sm">
        {t('plant.panel.display', { name: part.name, text: str(view, 'text') })}
      </span>
    );
  if (['light-array', 'scale', 'vision-sensor'].includes(part.part))
    return (
      <span data-plant-reading={part.name} className="text-sm">
        {t('plant.panel.reading', { name: part.name, text: str(view, 'text') })}
      </span>
    );
  if (['pusher', 'diverter-arm', 'chain-transfer', 'turntable'].includes(part.part))
    return (
      <span data-plant-diverter={part.name} className="text-sm">
        {HOME_TEXTS.includes(str(view, 'text')) ? '○' : '▲'} {t('plant.panel.diverter', { name: part.name, text: str(view, 'text') })}
      </span>
    );
  const station = STATIONS[part.part];
  if (station)
    return (
      <span data-plant-station={part.name} className="text-sm">
        {t(station, { name: part.name, text: str(view, 'text') })}
      </span>
    );
  if (isManipulator(part.part))
    return (
      <span data-plant-manipulator={part.name} className="text-sm">
        {t('plant.panel.manipulator', {
          name: part.name,
          text: str(view, 'text'),
          state: t(view.state.holding === true ? 'plant.panel.holding' : 'plant.panel.empty'),
        })}
      </span>
    );
  if (part.part === 'tank')
    return (
      <span data-plant-tank={part.name} className="text-sm">
        {t('plant.panel.tankLevel', { name: part.name, percent: Math.round(num(view, 'fraction') * 100) })}
        {view.state.spilling === true ? ` ${t('plant.panel.tankSpilling')}` : ''}
      </span>
    );
  if (part.part !== 'stack-light') return null;
  return (
    <span data-plant-stack={part.name} className="text-sm">
      {LAMPS.map(([lamp, key]) => (
        <span key={lamp} data-lamp={lamp} className="mr-2">
          {view.signals[lamp] === true ? '●' : '○'} {t(key)}:{' '}
          {t(view.signals[lamp] === true ? 'plant.panel.lampOn' : 'plant.panel.lampOff')}
        </span>
      ))}
    </span>
  );
}
