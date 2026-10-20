// The course pages of the docs site, generated from the lesson packages (LRN-035).
//
//   bun tools/docs/generate_course_pages.ts           write a page for every module and lesson, and the plants page, in both languages
//   bun tools/docs/generate_course_pages.ts --check   exit 1 when a page is missing or stale
//
// The source is packages/zplc-ide/src/generated/lessonIndex.ts, itself generated from the packages under
// packages/zplc-ide/lessons (tools/ci/generate-lesson-index.ts --check holds it fresh). The pages are unlisted from the
// sidebar (there are 40 of them) and reached from the course outline, which links the module index.
import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex.ts';
import { code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';
import { wiringSection } from './generate_hardware_pages';

export const GENERATOR = 'tools/docs/generate_course_pages.ts';
type Lesson = (typeof LESSON_INDEX.lessons)[number];
type Module = (typeof LESSON_INDEX.course.modules)[number];

const LEVEL: Record<string, L10n> = {
  foundation: { en: 'Foundation', es: 'Fundamentos' },
  intermediate: { en: 'Intermediate', es: 'Intermedio' },
  advanced: { en: 'Advanced', es: 'Avanzado' },
};
const TRACK: Record<string, L10n> = { simulation: { en: 'Simulation', es: 'Simulación' }, hardware: { en: 'Hardware', es: 'Hardware' } };
const level = (id: string, lang: Lang) => LEVEL[id]?.[lang] ?? id;
const lessonsOf = (module: Module): Lesson[] => LESSON_INDEX.lessons.filter((lesson) => lesson.module === module.id).sort((a, b) => a.order - b.order);
const titleOf = (lesson: Lesson, lang: Lang) => lesson.text[lang].title;
const trackNames = (tracks: readonly string[], lang: Lang) => tracks.map((track) => TRACK[track]?.[lang] ?? track).join(', ');

const T = {
  facts: { en: 'Facts', es: 'Datos' },
  module: { en: 'Module', es: 'Módulo' },
  level: { en: 'Level', es: 'Nivel' },
  time: { en: 'Estimated time', es: 'Tiempo estimado' },
  minutes: { en: 'minutes', es: 'minutos' },
  languages: { en: 'Languages', es: 'Lenguajes' },
  tracks: { en: 'Tracks', es: 'Rutas' },
  plant: { en: 'Plant', es: 'Planta' },
  none: { en: 'none', es: 'ninguna' },
  prerequisites: { en: 'Prerequisites', es: 'Requisitos previos' },
  objectives: { en: 'Objectives', es: 'Objetivos' },
  stages: { en: 'Stages', es: 'Etapas' },
  scope: { en: 'What the evidence covers', es: 'Qué cubre la evidencia' },
  hardware: { en: 'On a board', es: 'En una placa' },
  lessons: { en: 'Lessons', es: 'Lecciones' },
  requires: { en: 'Requires module', es: 'Requiere el módulo' },
  lesson: { en: 'Lesson', es: 'Lección' },
  modules: { en: 'Modules', es: 'Módulos' },
  used: { en: 'Used by', es: 'La usan' },
} satisfies Record<string, L10n>;

function lessonBody(lesson: Lesson, lang: Lang): string {
  const text = lesson.text[lang];
  const facts = [
    `- ${T.module[lang]}: [${lesson.module}](../modules/module-${lesson.module}.md)`,
    `- ${T.level[lang]}: ${level(lesson.level, lang)}`,
    `- ${T.time[lang]}: ${lesson.estimatedMinutes} ${T.minutes[lang]}`,
    `- ${T.languages[lang]}: ${lesson.languages.join(', ')}`,
    `- ${T.tracks[lang]}: ${trackNames(lesson.tracks, lang)}`,
    `- ${T.plant[lang]}: ${lesson.plant ? `[${code(lesson.plant)}](../plants.md)` : T.none[lang]}`,
    ...(lesson.prerequisites.length > 0 ? [`- ${T.prerequisites[lang]}: ${lesson.prerequisites.map((id) => `[${id}](./${id}.md)`).join(', ')}`] : []),
  ];
  const hardware = lesson.unsupported.hardware;
  return [
    prose(text.summary),
    `## ${T.facts[lang]}`, facts.join('\n'),
    `## ${T.objectives[lang]}`, text.objectives.map((objective: string) => `- ${prose(objective)}`).join('\n'),
    `## ${T.stages[lang]}`, text.stages.map((stage: { title: string; checkpoint: string }, index: number) => `${index + 1}. **${prose(stage.title)}**`).join('\n'),
    `## ${T.scope[lang]}`, prose(text.scope),
    ...(hardware ? [`## ${T.hardware[lang]}`, `${prose(hardware.reason[lang])} ${prose(hardware.instead[lang])}`] : wiringSection(lesson, lang)),
  ].join('\n\n');
}

function moduleBody(module: Module, lang: Lang): string {
  const rows = lessonsOf(module).map((lesson) => [`[${prose(titleOf(lesson, lang))}](../lessons/${lesson.id}.md)`, code(lesson.id), lesson.languages.join(', '), String(lesson.estimatedMinutes)]);
  return [
    [`- ${T.level[lang]}: ${level(module.level, lang)}`, `- ${T.tracks[lang]}: ${trackNames(module.tracks, lang)}`,
      ...(module.requires === null ? [] : [`- ${T.requires[lang]}: [${module.requires}](./module-${module.requires}.md)`])].join('\n'),
    `## ${T.lessons[lang]}`,
    rows.length > 0 ? table([T.lesson[lang], 'Id', T.languages[lang], T.minutes[lang]], rows) : T.none[lang],
  ].join('\n\n');
}

function moduleIndexBody(lang: Lang): string {
  return table([T.module[lang], T.level[lang], T.lessons[lang]], LESSON_INDEX.course.modules.map((module) => [
    `[${module.id}: ${prose(module.title[lang])}](./module-${module.id}.md)`, level(module.level, lang), String(lessonsOf(module).length),
  ]));
}

function plantsBody(lang: Lang): string {
  const plants = [...new Set(LESSON_INDEX.lessons.flatMap((lesson) => (lesson.plant ? [lesson.plant] : [])))].sort();
  const intro: L10n = {
    en: 'A plant is a simulated machine that a lesson connects to your program: the lesson maps the signals of the plant to the inputs and outputs of its starter project. This list is generated from the lesson packages.',
    es: 'Una planta es una máquina simulada que una lección conecta a su programa: la lección asigna las señales de la planta a las entradas y salidas de su proyecto inicial. Esta lista se genera de los paquetes de lecciones.',
  };
  return [intro[lang], table([T.plant[lang], T.used[lang]], plants.map((plant) => [code(plant), LESSON_INDEX.lessons.filter((lesson) => lesson.plant === plant).map((lesson) => `[${prose(titleOf(lesson, lang))}](./lessons/${lesson.id}.md)`).join(', ')]))].join('\n\n');
}

export const PAGES: ReferencePage[] = [
  ...LESSON_INDEX.course.modules.map((module): ReferencePage => ({
    path: `learn/modules/module-${module.id}.md`,
    title: { en: `Module ${module.id}: ${module.title.en}`, es: `Módulo ${module.id}: ${module.title.es}` },
    label: { en: `Module ${module.id}`, es: `Módulo ${module.id}` },
    description: { en: `The lessons of module ${module.id} of the course, generated from the lesson packages.`, es: `Las lecciones del módulo ${module.id} del curso, generadas de los paquetes de lecciones.` },
    body: (lang) => moduleBody(module, lang),
  })),
  {
    path: 'learn/modules/index.md',
    title: { en: 'Course modules', es: 'Módulos del curso' },
    label: { en: 'Course modules', es: 'Módulos del curso' },
    description: { en: 'Every module of the course, generated from the lesson packages.', es: 'Todos los módulos del curso, generados de los paquetes de lecciones.' },
    body: moduleIndexBody,
  },
  ...LESSON_INDEX.lessons.map((lesson): ReferencePage => ({
    path: `learn/lessons/${lesson.id}.md`,
    title: { en: lesson.text.en.title, es: lesson.text.es.title },
    label: { en: lesson.id, es: lesson.id },
    description: { en: `The lesson ${lesson.id}: level, time, languages and objectives, generated from its package.`, es: `La lección ${lesson.id}: nivel, tiempo, lenguajes y objetivos, generados de su paquete.` },
    body: (lang) => lessonBody(lesson, lang),
  })),
  {
    path: 'learn/plants.md',
    title: { en: 'Lesson plants', es: 'Plantas de las lecciones' },
    label: { en: 'Lesson plants', es: 'Plantas de las lecciones' },
    description: { en: 'The simulated plants that lessons connect to your program, generated from the lesson packages.', es: 'Las plantas simuladas que las lecciones conectan a su programa, generadas de los paquetes de lecciones.' },
    body: plantsBody,
  },
];

/** The pages as they must be on disk: unlisted, because the sidebar holds the outline and the outline links them. */
export const outputs = () => outputsOf(GENERATOR, PAGES).map((output) => ({ ...output, content: output.content.replace('tags: [reference, generated]', 'tags: [learn, generated]\nunlisted: true') }));

if (import.meta.main) process.exit(runGenerator(GENERATOR, outputs(), process.argv.slice(2)));
