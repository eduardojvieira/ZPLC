/**
 * Two-dimensional schematics of the four plants (LRN-018). Presentational only: a plant state and the commands the program
 * wrote go in, an SVG comes out. Every lamp shows its state as a glyph and a word as well as a colour (UX-009, the shared
 * signal vocabulary), nothing animates or glows (the drawing is redrawn when the plant steps, so reduced motion has nothing
 * to turn off), and the whole drawing carries the sentence of `plantFacts` as its text equivalent (LRN-037).
 */
import { useT, type Translator } from '../i18n';
import { SIGNAL_CUES, SIGNAL_PAINT, signalMark, signalTone } from '../theme/signalTone';
import type { PlantKind, PlantState, Signals } from './plantEngine';
import { plantFacts } from './plantFacts';

type T = Translator['t'];
interface LampSpec { name: string; value: boolean; fault?: boolean }
type Sensed = Record<string, boolean>;

const num = (state: PlantState, key: string): number => state[key] as number;

/** The text of one lamp: glyph, name and state word. The same string is the SVG text and part of the accessible name. */
export function lampText(spec: LampSpec, t: T): string {
  const tone = signalTone({ forced: false, fault: spec.fault === true && spec.value, type: 'BOOL', value: spec.value });
  return `${signalMark(tone)} ${spec.name} ${tone === 'fault' ? SIGNAL_CUES.fault.label : spec.value ? t('plant.state.on') : t('plant.state.off')}`;
}

function lamps(kind: PlantKind, state: PlantState, reads: Signals, sensed: Sensed, t: T): LampSpec[] {
  switch (kind) {
    case 'motor-v1': return [
      { name: t('plant.name.command'), value: reads.command === true }, { name: t('plant.name.atSpeed'), value: sensed.atSpeed === true }, { name: t('plant.name.stall'), value: state.stall === true, fault: true }];
    case 'conveyor-v1': return [
      { name: t('plant.name.belt'), value: reads.belt === true }, { name: t('plant.name.diverter'), value: reads.diverter === true },
      { name: t('plant.name.classifier'), value: sensed.partAtClassifier === true }, { name: t('plant.name.metal'), value: sensed.metalDetected === true },
      { name: t('plant.name.divertSensor'), value: sensed.partAtDiverter === true }, { name: t('plant.name.jam'), value: sensed.jamDetected === true, fault: true }];
    case 'tank-v1': return [
      { name: t('plant.name.pump'), value: reads.pump === true }, { name: t('plant.name.low'), value: sensed.levelLow === true },
      { name: t('plant.name.high'), value: sensed.levelHigh === true }, { name: t('plant.name.pumpFault'), value: sensed.pumpFault === true, fault: true }];
    case 'pedestrian-v1': return [
      { name: t('plant.name.red'), value: reads.vehicleRed === true }, { name: t('plant.name.yellow'), value: reads.vehicleYellow === true },
      { name: t('plant.name.green'), value: reads.vehicleGreen === true }, { name: t('plant.name.walk'), value: reads.pedWalk === true },
      { name: t('plant.name.stop'), value: reads.pedStop === true }, { name: t('plant.name.request'), value: sensed.pedRequest === true }];
  }
}

const stroke = { stroke: 'currentColor', strokeWidth: 2, fill: 'none' } as const;

function Drawing({ kind, state }: { kind: PlantKind; state: PlantState }) {
  switch (kind) {
    case 'motor-v1': {
      const speed = num(state, 'speed');
      return <g><rect x="30" y="40" width="120" height="60" {...stroke} /><path d="M150 70h80" {...stroke} /><circle cx="250" cy="70" r="26" {...stroke} strokeDasharray={speed >= 900 ? undefined : '5 3'} />
        <rect x="30" y="118" width="240" height="12" {...stroke} /><rect x="30" y="118" width={Math.round(240 * speed / 1000)} height="12" fill="currentColor" /></g>;
    }
    case 'conveyor-v1': {
      const x = 20 + Math.round(236 * num(state, 'position') / 1000);
      return <g><rect x="20" y="90" width="260" height="20" {...stroke} /><rect x={x} y="64" width="24" height="24" fill="currentColor" stroke="currentColor" />
        <path d={`M${20 + 59 + 12} 40v60M${20 + 177 + 12} 40v60`} {...stroke} /><path d={`M${20 + 177 + 12} 112l26 24`} {...stroke} /></g>;
    }
    case 'tank-v1': {
      const height = Math.round(104 * num(state, 'level') / 1000);
      return <g><path d="M90 20h120v110H90z" {...stroke} /><rect x="92" y={128 - height} width="116" height={height} fill="currentColor" opacity="0.35" /><path d="M90 46h120M90 108h120" stroke="currentColor" strokeDasharray="4 3" />
        <circle cx="250" cy="100" r="22" {...stroke} /><path d="M210 100h18" {...stroke} /></g>;
    }
    case 'pedestrian-v1': {
      const phase = state.phase as string;
      const x = phase === 'approaching' ? 40 : phase === 'waiting' ? 100 : phase === 'crossing' ? 100 + Math.round(180 * num(state, 'scans') / 30) : 280;
      return <g><path d="M20 70h260M20 110h260" {...stroke} /><path d="M120 70v40M150 70v40M180 70v40" stroke="currentColor" strokeWidth="6" /><circle cx={x} cy="130" r="8" fill="currentColor" /></g>;
    }
  }
}

export function PlantView({ kind, state, reads, sensed }: { kind: PlantKind; state: PlantState; reads: Signals; sensed: Sensed }) {
  const { t } = useT();
  const fact = plantFacts(kind, state);
  const sentence = t(fact.key, fact.params);
  const items = lamps(kind, state, reads, sensed, t);
  const height = Math.max(150, 20 + items.length * 24);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 520 ${height}`} className="w-full max-w-[34rem] border border-[var(--border-color)] bg-[var(--color-surface-900)] text-[var(--text-primary)]" role="img" aria-label={`${t('plant.drawing')}: ${sentence} ${items.map((item) => lampText(item, t)).join(', ')}`} data-plant={kind}>
        <g transform="translate(0 0)"><Drawing kind={kind} state={state} /></g>
        {items.map((item, index) => {
          const tone = signalTone({ forced: false, fault: item.fault === true && item.value, type: 'BOOL', value: item.value });
          const paint = SIGNAL_PAINT[tone];
          return <g key={item.name} data-signal={tone}><rect x="310" y={12 + index * 24} width="196" height="20" fill={paint.bg} stroke={paint.border} /><text x="318" y={26 + index * 24} fontSize="12" fill={paint.fg}>{lampText(item, t)}</text></g>;
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-[var(--text-secondary)]" data-plant-fact={fact.key}>{sentence}</figcaption>
    </figure>
  );
}
