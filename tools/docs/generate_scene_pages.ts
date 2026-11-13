// The pages of the shipped scenes, generated from the scene directories (CRS-011, CRS-013).
//
//   bun tools/docs/generate_scene_pages.ts           write the scene index page and a page for every scene, in both languages
//   bun tools/docs/generate_scene_pages.ts --check   exit 1 when a page is missing or stale, or when a scene has no usable text.json
//
// The source is packages/zplc-ide/plant-scenes/<id>/: scene.json (the parts), plant-map.json (the signals), scenario.json (what is
// checked) and text.json (the name, the goal and what the scene teaches, in both languages), plus the lesson index for the lessons
// that use a scene. Nothing here states a frame rate, a latency or a board: no evidence file backs one for a scene (CRS-013).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex.ts';
import { SCENE_INDEX } from '../../packages/zplc-ide/src/generated/sceneIndex.ts';
import { PARTS } from './plant-parts-reference';
import { code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_scene_pages.ts';
const SCENES = new URL('../../packages/zplc-ide/plant-scenes/', import.meta.url).pathname;

export interface SceneText {
  name: string;
  goal: string;
  teaches: string;
}
interface Scene {
  id: string;
  text: Record<Lang, SceneText>;
  parts: { part: string }[];
  shortestPulseMs: number;
  signals: [string, { direction: string; type: string; point: string }][];
  scenario: { tickMs: number; durationMs: number; expectations: Expectation[] };
}
interface Expectation {
  kind: 'AT' | 'ALWAYS' | 'EVENTUALLY' | 'FOR';
  atMs?: number;
  fromMs?: number;
  withinMs?: number;
  forMs?: number;
  condition: Record<string, unknown>;
}

/** The scenes in the order of the scene index, with the problems found while reading them (a located message each). */
export function readScenes(
  dir = SCENES,
  ids: readonly string[] = SCENE_INDEX.map((entry) => entry.id),
): { scenes: Scene[]; problems: string[] } {
  const problems: string[] = [];
  const scenes: Scene[] = [];
  for (const id of ids) {
    const json = (file: string) => JSON.parse(readFileSync(join(dir, id, file), 'utf8'));
    if (!existsSync(join(dir, id, 'text.json'))) {
      problems.push(`plant-scenes/${id}: missing text.json`);
      continue;
    }
    const text = json('text.json') as Record<Lang, Partial<SceneText>>;
    const bad = (['en', 'es'] as const).filter((lang) => !(['name', 'goal', 'teaches'] as const).every((key) => text[lang]?.[key]));
    if (bad.length > 0) {
      problems.push(`plant-scenes/${id}/text.json: needs a name, a goal and teaches in ${bad.join(' and ')}`);
      continue;
    }
    const scene = json('scene.json');
    scenes.push({
      id,
      text: text as Record<Lang, SceneText>,
      parts: scene.parts,
      shortestPulseMs: scene.shortestPulseMs,
      signals: Object.entries(json('plant-map.json').signals),
      scenario: json('scenario.json'),
    });
  }
  return { scenes, problems };
}

const T = {
  parts: { en: 'Parts', es: 'Piezas' },
  part: { en: 'Part', es: 'Pieza' },
  count: { en: 'Count', es: 'Cantidad' },
  teaches: { en: 'What it teaches', es: 'Qué enseña' },
  signals: { en: 'Signals', es: 'Señales' },
  signalHead: { en: ['Signal', 'Direction', 'Type', 'Point'], es: ['Señal', 'Dirección', 'Tipo', 'Punto'] },
  scenario: { en: 'The scenario', es: 'El escenario' },
  checks: { en: 'What the scenario checks', es: 'Qué comprueba el escenario' },
  checkHead: { en: ['When', 'Condition'], es: ['Cuándo', 'Condición'] },
  lessons: { en: 'Lessons that use this scene', es: 'Lecciones que usan esta escena' },
  noLessons: { en: 'No lesson uses this scene.', es: 'Ninguna lección usa esta escena.' },
  notClaimed: { en: 'What is not claimed', es: 'Lo que no se afirma' },
  seeAlso: { en: 'See also', es: 'Consulte también' },
  scene: { en: 'Scene', es: 'Escena' },
  length: { en: 'Length of the scenario', es: 'Duración del escenario' },
} satisfies Record<string, unknown>;

const NOT_CLAIMED: L10n = {
  en:
    'The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the ' +
    'reference machines.',
  es:
    'La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han ' +
    'medido en las máquinas de referencia.',
};
const SEE_ALSO: { path: string; label: L10n }[] = [
  { path: 'clock', label: { en: 'The plant clock', es: 'El reloj de la planta' } },
  { path: 'scene-format', label: { en: 'Scene file format', es: 'Formato del archivo de escena' } },
  { path: 'parts', label: { en: 'Plant parts reference', es: 'Referencia de piezas de la planta' } },
];
const INTRO: L10n = {
  en:
    'These scenes ship with ZPLC, in order of difficulty. Each has a scene file, a plant map, a starter program, a scenario, a reference ' +
    'program that passes the scenario and a text in English and Spanish. The scenario runs on the native runtime and checks program ' +
    'outputs and facts of the plant. A fact name starts with `fact:`, such as `fact:count:EyeFar`. A check on a fact is a yes or no. ' +
    'Each scene has its own page, generated from its files.',
  es:
    'ZPLC incluye estas escenas, en orden de dificultad. Cada una tiene un archivo de escena, un mapa de la planta, un programa inicial, ' +
    'un escenario, un programa de referencia que pasa el escenario y un texto en inglés y en español. El escenario corre en el entorno ' +
    'de ejecución nativo y comprueba salidas del programa y hechos de la planta. El nombre de un hecho empieza con `fact:`, como ' +
    '`fact:count:EyeFar`. Una comprobación sobre un hecho es un sí o un no. Cada escena tiene su propia página, generada de sus archivos.',
};

const partName = (id: string, lang: Lang): string => {
  const definition = PARTS.find((part) => part.id === id);
  if (!definition) throw new Error(`scene part "${id}" is not in the catalogue`);
  return definition.names[lang];
};
function partCounts(scene: Scene, lang: Lang): [string, number][] {
  const counts = new Map<string, number>();
  for (const { part } of scene.parts) counts.set(part, (counts.get(part) ?? 0) + 1);
  return [...counts].map(([id, n]): [string, number] => [partName(id, lang), n]);
}

const seconds = (ms: number) => `${ms / 1000} s`;
function when(e: Expectation, lang: Lang): string {
  const es = lang === 'es';
  switch (e.kind) {
    case 'AT':
      return es ? `a los ${e.atMs} ms` : `at ${e.atMs} ms`;
    case 'ALWAYS':
      return es ? 'siempre' : 'always';
    case 'EVENTUALLY':
      return es ? `desde ${e.fromMs} ms, dentro de ${e.withinMs} ms` : `from ${e.fromMs} ms, within ${e.withinMs} ms`;
    case 'FOR':
      return es ? `desde ${e.fromMs} ms, durante ${e.forMs} ms` : `from ${e.fromMs} ms, for ${e.forMs} ms`;
  }
}
const condition = (e: Expectation) =>
  Object.entries(e.condition)
    .map(([key, value]) => code(`${key} = ${JSON.stringify(value)}`))
    .join(', ');

export function sceneBody(scene: Scene, lang: Lang): string {
  const lessons = LESSON_INDEX.lessons.filter((lesson) => lesson.scene === scene.id);
  const text = scene.text[lang];
  return [
    prose(text.goal),
    `## ${T.teaches[lang]}`,
    prose(text.teaches),
    `## ${T.parts[lang]}`,
    table(
      [T.part[lang], T.count[lang]],
      partCounts(scene, lang).map(([name, n]) => [prose(name), String(n)]),
    ),
    `## ${T.signals[lang]}`,
    table(
      [...T.signalHead[lang]],
      scene.signals.map(([name, s]) => [code(name), s.direction, s.type, code(s.point)]),
    ),
    `## ${T.scenario[lang]}`,
    [
      `- ${lang === 'es' ? 'Ciclo' : 'Scan'}: ${scene.scenario.tickMs} ms`,
      `- ${T.length[lang]}: ${seconds(scene.scenario.durationMs)}`,
      `- ${lang === 'es' ? 'Pulso más corto' : 'Shortest pulse'} (\`shortestPulseMs\`): ${scene.shortestPulseMs} ms`,
    ].join('\n'),
    `### ${T.checks[lang]}`,
    table(
      [...T.checkHead[lang]],
      scene.scenario.expectations.map((e) => [when(e, lang), condition(e)]),
    ),
    `## ${T.lessons[lang]}`,
    lessons.length === 0
      ? T.noLessons[lang]
      : lessons.map((lesson) => `- [${prose(lesson.text[lang].title)}](../../learn/lessons/${lesson.id}.md)`).join('\n'),
    `## ${T.notClaimed[lang]}`,
    NOT_CLAIMED[lang],
    `## ${T.seeAlso[lang]}`,
    SEE_ALSO.map((link) => `- [${link.label[lang]}](../${link.path}.md)`).join('\n'),
  ].join('\n\n');
}

function indexBody(scenes: Scene[], lang: Lang): string {
  return [
    INTRO[lang],
    table(
      [T.scene[lang], T.length[lang], T.parts[lang]],
      scenes.map((scene) => [
        `[${prose(scene.text[lang].name)}](./scenes/${scene.id}.md)`,
        seconds(scene.scenario.durationMs),
        partCounts(scene, lang)
          .map(([name, n]) => prose(n > 1 ? `${name} ×${n}` : name))
          .join(', '),
      ]),
    ),
    `## ${T.notClaimed[lang]}`,
    NOT_CLAIMED[lang],
    `## ${T.seeAlso[lang]}`,
    SEE_ALSO.map((link) => `- [${link.label[lang]}](./${link.path}.md)`).join('\n'),
  ].join('\n\n');
}

export function pagesFor(scenes: Scene[]): ReferencePage[] {
  return [
    {
      path: 'plant/scenes.md',
      title: { en: 'The shipped scenes', es: 'Las escenas incluidas' },
      label: { en: 'The shipped scenes', es: 'Las escenas incluidas' },
      description: {
        en: 'The scenes that ship with ZPLC, what the program has to do in each and what its scenario checks.',
        es: 'Las escenas que se incluyen con ZPLC, qué debe hacer el programa en cada una y qué comprueba su escenario.',
      },
      body: (lang) => indexBody(scenes, lang),
    },
    ...scenes.map((scene): ReferencePage => ({
      path: `plant/scenes/${scene.id}.md`,
      title: { en: scene.text.en.name, es: scene.text.es.name },
      label: { en: scene.text.en.name, es: scene.text.es.name },
      description: {
        en: `The scene ${scene.id}: its goal, parts, signals and what its scenario checks, generated from its files.`,
        es: `La escena ${scene.id}: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.`,
      },
      body: (lang) => sceneBody(scene, lang),
    })),
  ];
}

// The pinned formatter rewrites the front matter of a page that .prettierignore does not list (single quotes), so the generator writes
// it that way and the committed bytes equal the generated ones after the formatter.
const singleQuoted = (content: string) =>
  content.replace(
    /^(title|sidebar_label|description): "(.*)"$/gm,
    (_, key, value) => `${key}: '${JSON.parse(`"${value}"`).replace(/'/g, "''")}'`,
  );

export const outputsFor = (scenes: Scene[]) =>
  outputsOf(GENERATOR, pagesFor(scenes)).map((output) => ({
    ...output,
    // The scene pages are reached from the index page, like the course pages from the outline, so the sidebar does not list them.
    content: singleQuoted(
      output.content.replace(
        'tags: [reference, generated]',
        `tags: [plant, scenes, generated]${output.file.includes('/scenes/') ? '\nunlisted: true' : ''}`,
      ),
    ),
  }));

if (import.meta.main) {
  const { scenes, problems } = readScenes();
  process.exit(runGenerator(GENERATOR, outputsFor(scenes), process.argv.slice(2), problems));
}
