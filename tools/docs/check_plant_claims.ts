// Public text about the plant states only what recorded evidence supports (CRS-013, P6).
//
//   bun tools/docs/check_plant_claims.ts
//
// A paragraph that gives a frame rate, a latency, or names a board as supported fails unless the same paragraph cites a file
// of specs/012-zplc-2-1-plant-simulation/evidence/ that exists. It reads the plant and learn pages in English and Spanish.
// ponytail: the lesson texts of scene lessons are not read yet (none exist); add their directory to DIRS when they do.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const ES = 'docs/i18n/es/docusaurus-plugin-content-docs/current';
const DIRS = ['docs/docs/plant', 'docs/docs/learn', `${ES}/plant`, `${ES}/learn`];
const EVIDENCE = /specs\/012-zplc-2-1-plant-simulation\/evidence\/[\w./-]+/g;

const FRAME_RATE = /\d+(?:[.,]\d+)?\s*(?:fps|frames?\s+per\s+second|cuadros\s+por\s+segundo|fotogramas\s+por\s+segundo)/i;
const LATENCY_WORD = /\b(?:latency|latencia)\b/i;
const MILLISECONDS = /\d\s*ms\b/i;
const SUPPORTED = /\b(?:supported|compatible|soportad[oa]s?|compatibles)\b/i;

export interface Finding {
  file: string;
  line: number;
  rule: 'frame-rate' | 'latency' | 'board';
  paragraph: string;
}

/** The names a board goes by: its id, its display name, and the display name without its parenthesis. */
export function boardNames(root = ROOT): string[] {
  const boards = JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as Array<{
    board_id: string;
    display_name: string;
  }>;
  return boards.flatMap((board) => [board.board_id, board.display_name, board.display_name.replace(/\s*\(.*\)/, '')]);
}

const BOARDS = boardNames();

/** Paragraphs outside code fences and front matter, each with its first line. */
function paragraphs(text: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  let current: { line: number; text: string } | undefined;
  let fence = false;
  let front = false;
  const flush = () => {
    if (current) out.push(current);
    current = undefined;
  };
  text.split('\n').forEach((raw, index) => {
    if (index === 0 && raw.trim() === '---') front = true;
    else if (front) front = raw.trim() !== '---';
    else if (/^\s*(`{3,}|~{3,})/.test(raw)) {
      flush();
      fence = !fence;
    } else if (!fence) {
      if (raw.trim() === '') flush();
      else if (current) current.text += ` ${raw.trim()}`;
      else current = { line: index + 1, text: raw.trim() };
    }
  });
  flush();
  return out;
}

export function checkText(file: string, text: string, root = ROOT): Finding[] {
  const findings: Finding[] = [];
  for (const { line, text: paragraph } of paragraphs(text)) {
    const hit: Finding['rule'][] = [];
    if (FRAME_RATE.test(paragraph)) hit.push('frame-rate');
    if (LATENCY_WORD.test(paragraph) && MILLISECONDS.test(paragraph)) hit.push('latency');
    const lower = paragraph.toLowerCase();
    if (SUPPORTED.test(paragraph) && BOARDS.some((name) => lower.includes(name.toLowerCase()))) hit.push('board');
    if (hit.length === 0) continue;
    const cited = (paragraph.match(EVIDENCE) ?? []).some((path) => existsSync(join(root, path)));
    if (!cited) for (const rule of hit) findings.push({ file, line, rule, paragraph });
  }
  return findings;
}

export function check(root = ROOT): { findings: Finding[]; files: string[] } {
  const files = DIRS.filter((dir) => existsSync(join(root, dir))).flatMap((dir) => markdownFiles(root, dir));
  const findings = files.flatMap((file) => checkText(file, readFileSync(join(root, file), 'utf8'), root));
  return { findings, files };
}

if (import.meta.main) {
  const { findings, files } = check();
  if (findings.length > 0) {
    console.error(
      findings
        .map(
          (f) =>
            `plant-claims: ${f.file}:${f.line}: ${f.rule}: no evidence file of specs/012-zplc-2-1-plant-simulation/evidence/ is cited: ` +
            `"${f.paragraph.slice(0, 160)}"`,
        )
        .join('\n'),
    );
    process.exit(1);
  }
  console.log(`plant-claims: ${files.length} pages state no frame rate, latency or board support without an evidence file`);
}
