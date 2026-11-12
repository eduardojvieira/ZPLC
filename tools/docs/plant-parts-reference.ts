// The parts reference of the plant simulation, generated from the part definitions (PRT-002).
//
//   bun tools/docs/plant-parts-reference.ts [--write]   write docs/docs/plant/parts.md and the Spanish twin
//   bun tools/docs/plant-parts-reference.ts --check     exit 1 when a page is stale
//
// The source is the part arrays that plantCore registers. Names, configuration, signals, fault actions and the part text
// all come from the definition; nothing on the page is written by hand but the introduction and the headings.
import type { ConfigField, PartDefinition, ScenePart } from '../../packages/zplc-ide/src/plant/contracts.ts';
import { conveyorParts } from '../../packages/zplc-ide/src/plant/core/parts/conveyors.ts';
import { flowParts } from '../../packages/zplc-ide/src/plant/core/parts/flow.ts';
import { itemParts } from '../../packages/zplc-ide/src/plant/core/parts/items.ts';
import { panelParts } from '../../packages/zplc-ide/src/plant/core/parts/panel.ts';
import { sensorParts } from '../../packages/zplc-ide/src/plant/core/parts/sensors.ts';
import { sourceParts } from '../../packages/zplc-ide/src/plant/core/parts/sources.ts';
import { code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/plant-parts-reference.ts';

export const PARTS: readonly PartDefinition[] = [
  ...itemParts,
  ...conveyorParts,
  ...sourceParts,
  ...sensorParts,
  ...flowParts,
  ...panelParts,
];

const FAMILY: Record<PartDefinition['family'], L10n> = {
  items: { en: 'Items', es: 'Piezas' },
  sources: { en: 'Sources', es: 'Fuentes' },
  conveyors: { en: 'Conveyors', es: 'Transportadores' },
  flow: { en: 'Flow', es: 'Flujo' },
  sensors: { en: 'Sensors', es: 'Sensores' },
  panel: { en: 'Panel', es: 'Panel' },
};
const FAMILIES = Object.keys(FAMILY) as PartDefinition['family'][];

const HEAD = {
  config: {
    en: ['Setting', 'Kind', 'Range or values', 'Default', 'Unit'],
    es: ['Ajuste', 'Tipo', 'Rango o valores', 'Valor por defecto', 'Unidad'],
  },
  signals: { en: ['Signal', 'Direction', 'Type', 'Unit'], es: ['Señal', 'Dirección', 'Tipo', 'Unidad'] },
} as const;
const LABEL = {
  config: { en: 'Settings', es: 'Ajustes' },
  signals: { en: 'Signals', es: 'Señales' },
  actions: { en: 'Fault actions', es: 'Acciones de fallo' },
  none: { en: 'None.', es: 'Ninguna.' },
} satisfies Record<string, L10n>;
const INTRO: L10n = {
  en:
    'Every part of the plant catalogue, with its settings, signals and fault actions. A signal name on a plant is the name given to ' +
    'the part, a dot and the signal listed here.',
  es:
    'Cada pieza del catálogo de la planta, con sus ajustes, señales y acciones de fallo. El nombre de una señal en una planta es el ' +
    'nombre dado a la pieza, un punto y la señal que figura aquí.',
};

const range = (f: ConfigField): string =>
  f.kind === 'enum' ? (f.values ?? []).map((v) => code(v)).join(', ') : f.kind === 'number' ? `${f.min ?? ''} to ${f.max ?? ''}` : '';

function partSection(part: PartDefinition, lang: Lang): string {
  const fields = Object.entries(part.config);
  const sample: ScenePart = { id: 'sample', part: part.id, name: 'Name', position: [0, 0, 0], rotationYDeg: 0, config: {} };
  const signals = part.signals(sample);
  return [
    `### ${part.names[lang]}`,
    '',
    `${code(part.id)}`,
    '',
    prose(part.doc[lang]),
    '',
    `#### ${LABEL.config[lang]}`,
    '',
    fields.length === 0
      ? LABEL.none[lang]
      : table(
          [...HEAD.config[lang]],
          fields.map(([key, f]) => [
            code(key),
            f.kind,
            lang === 'es' ? range(f).replace(' to ', ' a ') : range(f),
            code(String(f.default)),
            f.unit ?? '',
          ]),
        ),
    '',
    `#### ${LABEL.signals[lang]}`,
    '',
    signals.length === 0
      ? LABEL.none[lang]
      : table(
          [...HEAD.signals[lang]],
          signals.map((s) => [code(s.name.replace(/^Name\./, '')), s.direction, s.type, s.unit ?? '']),
        ),
    '',
    `#### ${LABEL.actions[lang]}`,
    '',
    part.actions.length === 0 ? LABEL.none[lang] : part.actions.map((a) => code(a)).join(', '),
  ].join('\n');
}

export function partsBody(parts: readonly PartDefinition[], lang: Lang): string {
  const families = FAMILIES.flatMap((family) => {
    const own = parts.filter((p) => p.family === family);
    return own.length === 0 ? [] : [`## ${FAMILY[family][lang]}`, ...own.map((p) => partSection(p, lang))];
  });
  return [INTRO[lang], ...families].join('\n\n');
}

export const pagesFor = (parts: readonly PartDefinition[]): ReferencePage[] => [
  {
    path: 'plant/parts.md',
    title: { en: 'Plant parts reference', es: 'Referencia de piezas de la planta' },
    label: { en: 'Parts reference', es: 'Referencia de piezas' },
    description: {
      en: 'Every part of the plant catalogue with its settings, signals and fault actions, generated from the part definitions.',
      es: 'Cada pieza del catálogo de la planta con sus ajustes, señales y acciones de fallo, generada de las definiciones de pieza.',
    },
    body: (lang) => partsBody(parts, lang),
  },
];

export const outputsFor = (parts: readonly PartDefinition[]) => outputsOf(GENERATOR, pagesFor(parts));

if (import.meta.main) {
  process.exit(runGenerator(GENERATOR, outputsFor(PARTS), process.argv.slice(2)));
}
