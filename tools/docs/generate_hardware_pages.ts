// The hardware pages of the docs site, generated from the learner kit, the board I/O manifest and the lesson index
// (LRN-014, LRN-016, LRN-035).
//
//   bun tools/docs/generate_hardware_pages.ts           write the kit page of each learner board, a wiring page and
//                                                       a wiring diagram per hardware lesson and board, in both languages
//   bun tools/docs/generate_hardware_pages.ts --check   exit 1 when a page or a diagram is missing or stale
//
// Sources: packages/zplc-ide/lessons/kit.json (boards, voltage limit, bill of materials),
// firmware/app/boards/boards.json (the pins), packages/zplc-ide/src/generated/lessonIndex.ts (the wiring of each lesson).
// The kit pages are in the sidebar; the wiring pages are unlisted and linked from the kit pages and the lesson pages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex.ts';
import { channelIn } from '../../packages/zplc-ide/src/boards/boardIo.ts';
import { renderWiringSvg, wiringCard } from '../../packages/zplc-ide/src/boards/wiring/render.ts';
import type { WiringBoard } from '../../packages/zplc-ide/src/boards/wiring/wiring.ts';
import { loadLearnerBoards } from '../../packages/zplc-ide/src/learn/lessonPackageFiles.ts';
import { plannedFormats } from '../../scripts/release/firmware-images.ts';
import { ROOT, code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type Output, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_hardware_pages.ts';
type Lesson = (typeof LESSON_INDEX.lessons)[number];

const loaded = loadLearnerBoards();
if (loaded.problems.length > 0 || !loaded.kit) throw new Error(`learner kit: ${loaded.problems.join('; ')}`);
export const KIT = loaded.kit;
export const BOARDS: readonly WiringBoard[] = loaded.boards;
export const HARDWARE_LESSONS: readonly Lesson[] = LESSON_INDEX.lessons.filter((lesson) => lesson.hardware !== null);

const T = {
  limit: { en: 'Voltage limit', es: 'Límite de tensión' },
  pinMap: { en: 'Pin map', es: 'Mapa de pines' },
  bom: { en: 'Bill of materials', es: 'Lista de materiales' },
  firmware: { en: 'Firmware', es: 'Firmware' },
  lessons: { en: 'Lessons on the hardware track', es: 'Lecciones de la ruta de hardware' },
  diagram: { en: 'Diagram', es: 'Diagrama' },
  card: { en: 'Wiring card', es: 'Tarjeta de cableado' },
  wiring: { en: 'Wiring', es: 'Cableado' },
  channel: { en: 'Channel', es: 'Canal' },
  direction: { en: 'Direction', es: 'Dirección' },
  address: { en: 'Address', es: 'Dirección IEC' },
  pin: { en: 'Pin', es: 'Pin' },
  location: { en: 'Location', es: 'Ubicación' },
  notes: { en: 'Notes', es: 'Notas' },
  part: { en: 'Part', es: 'Pieza' },
  quantity: { en: 'Quantity', es: 'Cantidad' },
  lesson: { en: 'Lesson', es: 'Lección' },
  input: { en: 'input', es: 'entrada' },
  output: { en: 'output', es: 'salida' },
  digital: { en: 'digital', es: 'digital' },
  analog: { en: 'analog', es: 'analógica' },
  power: { en: 'Power', es: 'Alimentación' },
  version: { en: '<version>', es: '<versión>' },
} satisfies Record<string, L10n>;

const kitPath = (board: WiringBoard): string => `reference/learner-kits/${board.boardId}.md`;
const wiringPath = (board: WiringBoard, lesson: Lesson): string => `reference/learner-kits/${board.boardId}/${lesson.id}.md`;
export const svgFile = (board: WiringBoard, lesson: Lesson, lang: Lang): string => `docs/static/img/wiring/${board.boardId}/${lesson.id}.${lang}.svg`;
const svgUrl = (board: WiringBoard, lesson: Lesson, lang: Lang): string => `/img/wiring/${board.boardId}/${lesson.id}.${lang}.svg`;
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'firmware/app/boards/boards.json'), 'utf8')) as Array<{ board_id: string; zephyr_board: string }>;
const zephyrBoardOf = (boardId: string): string => MANIFEST.find((entry) => entry.board_id === boardId)!.zephyr_board;

/** The statement every wiring page carries (LRN-016), as a list. */
export const voltageLimit = (lang: Lang): string => KIT.voltageLimit[lang].map((sentence) => `- ${prose(sentence)}`).join('\n');

function kitBody(board: WiringBoard, lang: Lang): string {
  const intro: L10n = {
    en: `The kit of the course for the ${board.displayName}: its pin map, the parts, the firmware and the voltage limit. The pins come from \`firmware/app/boards/boards.json\` and the parts from \`packages/zplc-ide/lessons/kit.json\`. The [learner kits](./index.md) page explains how a lesson declares its wiring.`,
    es: `El kit del curso para la ${board.displayName}: su mapa de pines, las piezas, el firmware y el límite de tensión. Los pines provienen de \`firmware/app/boards/boards.json\` y las piezas de \`packages/zplc-ide/lessons/kit.json\`. La página [kits del estudiante](./index.md) explica cómo una lección declara su cableado.`,
  };
  const channels = board.io.channels.map((channel) => channelIn(channel, lang)).map((channel) => [
    code(channel.id), `${T[channel.direction][lang]}, ${T[channel.kind][lang]}`, code(channel.address), prose(channel.pin), prose(channel.location ?? ''), prose(channel.electrical),
  ]);
  const power: L10n = {
    en: `${T.power.en}: 3V3 on ${board.supply}, GND on ${board.ground}, the ground of a potentiometer on ${board.analogGround}.`,
    es: `${T.power.es}: 3V3 en ${board.supply}, GND en ${board.ground}, la tierra de un potenciómetro en ${board.analogGround}.`,
  };
  const bom = KIT.bom.map((item) => [prose(item.name[lang]), String(item.quantity), prose(item.note?.[lang] ?? '')]);
  const format = plannedFormats(zephyrBoardOf(board.boardId)).find((entry) => entry.role === 'flash')!.format;
  const image = `zplc-runtime-${T.version[lang]}-${board.boardId}.${format}`;
  const firmware: L10n = {
    en: `Each release has a prebuilt image for this board, ${code(image)}. Its SHA-256 is published in the \`SHA256SUMS\` file of the release, and the firmware card of the ZPLC application shows it next to the file. [Flash the firmware](../../guides/flash-firmware.md) gives the steps. You perform each of them: ZPLC never flashes a board.`,
    es: `Cada versión publicada tiene una imagen precompilada para esta placa, ${code(image)}. Su SHA-256 se publica en el archivo \`SHA256SUMS\` de la versión, y la tarjeta de firmware de la aplicación ZPLC lo muestra junto al archivo. [Grabar el firmware](../../guides/flash-firmware.md) da los pasos. Usted realiza cada uno: ZPLC nunca graba una placa.`,
  };
  const lessons = HARDWARE_LESSONS.map((lesson) => [`[${prose(lesson.text[lang].title)}](./${board.boardId}/${lesson.id}.md)`, code(lesson.id)]);
  return [
    intro[lang],
    `## ${T.limit[lang]}`, voltageLimit(lang),
    `## ${T.pinMap[lang]}`, table([T.channel[lang], T.direction[lang], T.address[lang], T.pin[lang], T.location[lang], T.notes[lang]], channels), power[lang],
    `## ${T.bom[lang]}`, table([T.part[lang], T.quantity[lang], T.notes[lang]], bom),
    `## ${T.firmware[lang]}`, firmware[lang],
    `## ${T.lessons[lang]}`, table([T.lesson[lang], 'Id'], lessons),
  ].join('\n\n');
}

function wiringBody(board: WiringBoard, lesson: Lesson, lang: Lang): string {
  const wiring = lesson.hardware!.wiring;
  const intro: L10n = {
    en: `The wiring of the lesson [${prose(lesson.text.en.title)}](../../../learn/lessons/${lesson.id}.md) on the [${board.displayName}](../${board.boardId}.md). Wire it with the USB cable unplugged.`,
    es: `El cableado de la lección [${prose(lesson.text.es.title)}](../../../learn/lessons/${lesson.id}.md) en la [${board.displayName}](../${board.boardId}.md). Haga el cableado con el cable USB desconectado.`,
  };
  const heading = { en: `Wiring of ${lesson.text.en.title} on ${board.displayName}`, es: `Cableado de ${lesson.text.es.title} en ${board.displayName}` };
  return [
    intro[lang],
    `## ${T.limit[lang]}`, voltageLimit(lang),
    `## ${T.diagram[lang]}`, `![${prose(heading[lang])}](${svgUrl(board, lesson, lang)})`,
    `## ${T.card[lang]}`, wiringCard(board, wiring, lang).map((line, index) => `${index + 1}. ${prose(line)}`).join('\n'),
  ].join('\n\n');
}

/** The section of a lesson page that links its wiring on each learner board; empty for a lesson without the hardware track. */
export function wiringSection(lesson: Lesson, lang: Lang): string[] {
  if (lesson.hardware === null) return [];
  return [`## ${T.wiring[lang]}`, BOARDS.map((board) => `- [${board.displayName}](../../reference/learner-kits/${board.boardId}/${lesson.id}.md)`).join('\n')];
}

export const KIT_PAGES: ReferencePage[] = BOARDS.map((board) => ({
  path: kitPath(board),
  title: { en: `Learner kit: ${board.displayName}`, es: `Kit del estudiante: ${board.displayName}` },
  label: { en: board.displayName, es: board.displayName },
  description: { en: `The pin map, parts, firmware and voltage limit of the ${board.displayName} for the course, generated from the board I/O manifest and the kit.`, es: `El mapa de pines, las piezas, el firmware y el límite de tensión de la ${board.displayName} para el curso, generados a partir del manifiesto de E/S de la placa y del kit.` },
  body: (lang) => kitBody(board, lang),
}));

export const WIRING_PAGES: ReferencePage[] = BOARDS.flatMap((board) => HARDWARE_LESSONS.map((lesson): ReferencePage => ({
  path: wiringPath(board, lesson),
  title: { en: `Wiring: ${lesson.text.en.title} on ${board.displayName}`, es: `Cableado: ${lesson.text.es.title} en ${board.displayName}` },
  label: { en: lesson.id, es: lesson.id },
  description: { en: `How to wire the lesson ${lesson.id} on the ${board.displayName}, generated from its wiring file.`, es: `Cómo cablear la lección ${lesson.id} en la ${board.displayName}, generado a partir de su archivo de cableado.` },
  body: (lang) => wiringBody(board, lesson, lang),
})));

/** The wiring diagrams, one per lesson, board and language. */
export const SVG_OUTPUTS: Output[] = BOARDS.flatMap((board) => HARDWARE_LESSONS.flatMap((lesson) => (['en', 'es'] as const).map((lang) => ({
  file: svgFile(board, lesson, lang),
  content: renderWiringSvg(board, lesson.hardware!.wiring, lang),
}))));

/** Every file the generator writes: the kit pages in the sidebar, the wiring pages unlisted, and the diagrams. */
export const outputs = (): Output[] => [
  ...outputsOf(GENERATOR, KIT_PAGES).map((output) => ({ ...output, content: output.content.replace('tags: [reference, generated]', 'tags: [learn, hardware, generated]') })),
  ...outputsOf(GENERATOR, WIRING_PAGES).map((output) => ({ ...output, content: output.content.replace('tags: [reference, generated]', 'tags: [learn, hardware, generated]\nunlisted: true') })),
  ...SVG_OUTPUTS,
];

if (import.meta.main) process.exit(runGenerator(GENERATOR, outputs(), process.argv.slice(2)));
