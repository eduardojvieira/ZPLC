/**
 * What a person can do to a running scene (VIS-010): press the panel's push buttons, see its indicator lights, trigger a part's
 * fault action, and add or remove an item. Every control is a native one, so the pointer and the keyboard both work; the push
 * button is held for as long as the pointer, Space or Enter is held.
 */
import { useState, type KeyboardEvent } from 'react';
import { useT, type MessageKey } from '../../i18n';
import { Button, Select } from '../../ui';
import type { PlantCore, PlantSceneFile, PlantSnapshot, ScenePart } from '../contracts';
import { catalogue } from '../core/catalogue';
import { cuesFor, type CueMarker } from '../view/cues';
import { EmergencyStopControl, PotentiometerControl, Readout, SelectorControl } from './NumericControls';

const MARKERS: Readonly<Record<CueMarker, string>> = { solid: '●', dashed: '○', dotted: '◌', outline: '▲' };
/** Where an added item appears: just above the scene's emitter. */
const DROP_HEIGHT_M = 0.35;

function HoldButton({ part, core }: { part: ScenePart; core: PlantCore }) {
  const { t } = useT();
  const [held, setHeld] = useState(false);
  const signal = `${part.name}.pressed`;
  const set = (value: boolean) => {
    if (value === held) return;
    setHeld(value);
    core.operate(signal, value);
  };
  const onKey = (event: KeyboardEvent, value: boolean) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    set(value);
  };
  return (
    <Button
      data-plant-press={part.name}
      aria-pressed={held}
      tooltip={t('plant.panel.pressHint')}
      onPointerDown={() => set(true)}
      onPointerUp={() => set(false)}
      onPointerLeave={() => set(false)}
      onKeyDown={(event) => onKey(event, true)}
      onKeyUp={(event) => onKey(event, false)}
      onBlur={() => set(false)}
    >
      {t('plant.panel.press', { name: part.name })}
    </Button>
  );
}

/** A select that only chooses and a button that acts, so arrowing through the list never fires a fault. */
function FaultControl({ part, run, act }: { part: ScenePart; run: (action: () => void) => void; act: (action: string) => void }) {
  const { t } = useT();
  const [chosen, setChosen] = useState('');
  return (
    <>
      <Select
        label={t('plant.panel.fault', { name: part.name })}
        data-plant-fault={part.name}
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
      >
        <option value="">{t('plant.panel.faultChoose')}</option>
        {catalogue.get(part.part)?.actions.map((action) => (
          <option key={action} value={action}>
            {t(`plant.fault.${action}` as MessageKey)}
          </option>
        ))}
      </Select>
      <Button
        data-plant-fault-trigger={part.name}
        disabled={chosen === ''}
        onClick={() => {
          run(() => act(chosen));
          setChosen('');
        }}
      >
        {t('plant.panel.triggerFault', { name: part.name })}
      </Button>
    </>
  );
}

/** The numeric sensors and the diverters of the sorting parts, listed by id: each gets a text readout. */
const READOUT_IDS = [
  'light-array',
  'scale',
  'vision-sensor',
  'pusher',
  'diverter-arm',
  'chain-transfer',
  'turntable',
  'lift',
  'stacker-crane',
  'machining-centre',
];

export function OperatePanel(props: { scene: PlantSceneFile; core: PlantCore; snapshot: PlantSnapshot | undefined; onChange: () => void }) {
  const { scene, core, snapshot, onChange } = props;
  const { t } = useT();
  const [message, setMessage] = useState<string | undefined>();
  const [removeId, setRemoveId] = useState('');
  const panelParts = scene.parts.filter((part) => catalogue.get(part.part)?.family === 'panel');
  const buttons = panelParts.filter((part) => part.part === 'push-button');
  const lights = panelParts.filter((part) => part.part === 'indicator-light');
  const viewOf = (part: ScenePart) => snapshot?.parts.find((candidate) => candidate.id === part.id);
  const numeric = scene.parts.filter(
    (part) =>
      ['potentiometer', 'selector-switch', 'emergency-stop', 'numeric-display', 'stack-light', 'tank', ...READOUT_IDS].includes(
        part.part,
      ) || ['manipulators', 'stations'].includes(catalogue.get(part.part)?.family ?? ''),
  );
  const faulty = scene.parts.filter((part) => (catalogue.get(part.part)?.actions.length ?? 0) > 0);
  const emitter = scene.parts.find((part) => part.part === 'emitter');
  const items = snapshot?.items ?? [];

  const attempt = (action: () => void) => {
    try {
      action();
      setMessage(undefined);
    } catch (error) {
      setMessage(t('plant.panel.refused', { detail: error instanceof Error ? error.message : String(error) }));
    }
    onChange();
  };
  const addItem = () => {
    if (!emitter) {
      setMessage(t('plant.panel.noEmitter'));
      return;
    }
    const [x, y, z] = emitter.position;
    attempt(() => void core.addItem('box', [x, y + DROP_HEIGHT_M, z]));
  };

  return (
    <section data-plant-operate aria-label={t('plant.panel.operate')} className="flex flex-wrap items-end gap-3 p-2">
      {buttons.map((part) => (
        <HoldButton key={part.id} part={part} core={core} />
      ))}
      {lights.map((part) => {
        const view = snapshot?.parts.find((candidate) => candidate.id === part.id);
        const cue = view ? cuesFor(view) : undefined;
        return (
          <span key={part.id} data-plant-light={part.name} data-state={cue?.state ?? 'unknown'} className="text-sm">
            {MARKERS[cue?.marker ?? 'dotted']}{' '}
            {t('plant.panel.lightOn', { name: part.name, state: t(cue?.stateKey ?? 'signal.cue.unknown') })}
          </span>
        );
      })}
      {numeric.map((part) => {
        const props = { part, view: viewOf(part), core, run: attempt };
        if (part.part === 'potentiometer') return <PotentiometerControl key={part.id} {...props} />;
        if (part.part === 'selector-switch') return <SelectorControl key={part.id} {...props} />;
        if (part.part === 'emergency-stop') return <EmergencyStopControl key={part.id} {...props} />;
        return <Readout key={part.id} part={part} view={props.view} />;
      })}
      {faulty.map((part) => (
        <FaultControl key={part.id} part={part} run={attempt} act={(action) => core.act(part.name, action)} />
      ))}
      <Button data-plant-add-item onClick={addItem}>
        {t('plant.panel.addItem')}
      </Button>
      <Select label={t('plant.panel.itemToRemove')} value={removeId} onChange={(event) => setRemoveId(event.target.value)}>
        <option value="">{items.length === 0 ? t('plant.panel.noItems') : ''}</option>
        {items.slice(0, 50).map((item) => (
          <option key={item.id} value={item.id}>
            {item.id}
          </option>
        ))}
      </Select>
      <Button
        data-plant-remove-item
        disabled={removeId === ''}
        onClick={() => {
          attempt(() => core.removeItem(removeId));
          setRemoveId('');
        }}
      >
        {t('plant.panel.removeItem')}
      </Button>
      {message && (
        <p role="alert" data-plant-message className="basis-full text-sm text-[var(--text-secondary)]">
          {message}
        </p>
      )}
    </section>
  );
}
