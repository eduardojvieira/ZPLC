/**
 * The signal table of each plant scene, for the machine page of a plant lesson (course review L8):
 *
 *   bun scripts/learn/signal-table.ts [--out <dir>] [--scenes a,b] [--check]
 *
 * Writes `<out>/<scene>/signals.en.md` and `signals.es.md` for each scene of plant-scenes/ (all of them by default), from its
 * scene.json and plant-map.json and the text of machineText.ts. `--check` writes nothing: it exits 1 when a table in `<out>` is
 * missing or differs from what the scene gives now, and lists them. Either way it exits 1 when a part kind or a mapped signal has
 * no text. The default `<out>` is the review folder .cache/claude-ux-review/course/machine-pages of the repository.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCALES, machineRows, readMachine, SCENES_DIR, signalTable } from './machinePage';

export interface TableFile {
  path: string;
  text: string;
}

/** The tables of the scenes, as files relative to the output folder, and the text the scenes lack. */
export function tablesOf(scenes: readonly string[]): { files: TableFile[]; problems: string[] } {
  const files: TableFile[] = [];
  const problems: string[] = [];
  for (const id of scenes) {
    const { rows, problems: missing } = machineRows(readMachine(id));
    problems.push(...missing);
    for (const locale of LOCALES) files.push({ path: join(id, `signals.${locale}.md`), text: signalTable(rows, locale) });
  }
  return { files, problems };
}

/** The tables of `files` that are missing from `out` or differ from it. */
export function staleTables(files: readonly TableFile[], out: string): string[] {
  return files
    .filter((file) => !existsSync(join(out, file.path)) || readFileSync(join(out, file.path), 'utf8') !== file.text)
    .map((f) => f.path);
}

if (import.meta.main) {
  const flag = (name: string): string | undefined => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const out = resolve(flag('out') ?? fileURLToPath(new URL('../../../../.cache/claude-ux-review/course/machine-pages', import.meta.url)));
  const scenes = flag('scenes')?.split(',') ?? readdirSync(SCENES_DIR).sort();
  const { files, problems } = tablesOf(scenes);
  for (const problem of problems) console.error(`missing text: ${problem}`);
  if (process.argv.includes('--check')) {
    const stale = staleTables(files, out);
    for (const path of stale) console.error(`stale or missing: ${join(out, path)}`);
    console.log(`${files.length - stale.length} of ${files.length} tables of ${scenes.length} scenes are current in ${out}`);
    process.exit(stale.length > 0 || problems.length > 0 ? 1 : 0);
  }
  for (const file of files) {
    mkdirSync(join(out, file.path, '..'), { recursive: true });
    writeFileSync(join(out, file.path), file.text);
  }
  console.log(`${files.length} tables of ${scenes.length} scenes written to ${out}`);
  process.exit(problems.length > 0 ? 1 : 0);
}
