// Rewrites the module sections of the hand-checked course outline pages (EN and ES) from the generated lesson index, from a
// module id on (default 12) to the hardware section: `bun tools/docs/generate_outline_sections.ts [fromModule]`.
// tools/ci/course-outline.test.ts checks the result against the index, so run this after adding or changing lessons, then
// the pinned formatter (`tools/ci/format.ts --write`), which aligns the tables it writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LESSON_INDEX as I } from '../../packages/zplc-ide/src/generated/lessonIndex';
const FROM = Number(process.argv[2] ?? 12);
const L = {
  en: {
    mod: 'Module',
    head: ['Lesson', 'Status', 'Languages', 'Tracks', 'Plant', 'Minutes', 'Requires'],
    avail: 'Available',
    lvl: { foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' },
    req: 'Requires module',
    none: 'none',
    tracks: 'Tracks',
    trk: { simulation: 'Simulation', hardware: 'Hardware' },
    obj: 'Objectives of the available lessons:',
    empty: 'No lesson of this module is available yet.',
    file: 'docs/docs/learn/course-outline.md',
    hw: '## Hardware wiring pages',
  },
  es: {
    mod: 'Módulo',
    head: ['Lección', 'Estado', 'Lenguajes', 'Rutas', 'Planta', 'Minutos', 'Requiere'],
    avail: 'Disponible',
    lvl: { foundation: 'Fundamentos', intermediate: 'Intermedio', advanced: 'Avanzado' },
    req: 'Requiere el módulo',
    none: 'ninguno',
    tracks: 'Rutas',
    trk: { simulation: 'Simulación', hardware: 'Hardware' },
    obj: 'Objetivos de las lecciones disponibles:',
    empty: 'Todavía no hay ninguna lección disponible en este módulo.',
    file: 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/course-outline.md',
    hw: '## Páginas de cableado por placa',
  },
} as const;
const order = [...I.lessons].sort((a, b) => a.order - b.order);
for (const loc of ['en', 'es'] as const) {
  const l = L[loc];
  let out = '';
  for (const m of I.course.modules.filter((x) => x.id >= FROM)) {
    out += `## ${l.mod} ${m.id}: ${m.title[loc]}\n\n${
      l.lvl[m.level as keyof typeof l.lvl]
    }. ${l.req}: ${m.requires ?? l.none}. ${l.tracks}: ${m.tracks.map((t) => l.trk[t as 'simulation']).join(', ')}.\n\n${m.why[loc]}\n\n`;
    const ls = order.filter((x) => x.module === m.id);
    if (!ls.length) {
      out += `${l.empty}\n\n`;
      continue;
    }
    out += `| ${l.head.join(' | ')} |\n|${l.head.map(() => ' --- |').join('')}\n`;
    for (const x of ls)
      out += `| \`${x.id}\` ${x.text[loc].title} | ${l.avail} | ${x.languages.join(', ')} | ${x.tracks
        .map((t) => l.trk[t as 'simulation'])
        .join(', ')} | ${x.plant ?? '-'} | ${x.estimatedMinutes} | ${
        x.prerequisites.length ? x.prerequisites.map((p) => `\`${p}\``).join(', ') : '-'
      } |\n`;
    out += `\n${l.obj}\n\n${ls.map((x) => `- **${x.text[loc].title}**: ${x.text[loc].objectives.join(' ')}`).join('\n')}\n\n`;
  }
  const p = join(import.meta.dir, '../..', l.file);
  const s = readFileSync(p, 'utf8');
  const a = s.search(new RegExp(`^## ${l.mod} ${FROM}: `, 'm'));
  const b = s.indexOf(l.hw);
  const start = a < 0 ? b : a;
  writeFileSync(p, s.slice(0, start) + out + s.slice(b));
}
