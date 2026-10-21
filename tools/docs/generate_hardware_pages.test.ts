import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { checkManifest, JOURNEY, type Manifest } from './capture-screenshots';
import { PAGES as COURSE_PAGES } from './generate_course_pages';
import { BOARDS, HARDWARE_LESSONS, KIT, KIT_PAGES, WIRING_PAGES, outputs } from './generate_hardware_pages';
import { ROOT } from './reference-lib';

describe('LRN-035 the kit page of each learner board, generated from boards.json and kit.json', () => {
  it('has a kit page for each learner board, in the sidebar, and a wiring page per hardware lesson and board, unlisted', () => {
    expect(KIT_PAGES.map((page) => page.path)).toEqual([
      'reference/learner-kits/rpi-pico-rp2040.md',
      'reference/learner-kits/esp32-s3-devkitc.md',
    ]);
    expect(WIRING_PAGES).toHaveLength(BOARDS.length * HARDWARE_LESSONS.length);
    expect(HARDWARE_LESSONS.length).toBeGreaterThanOrEqual(17);
    const sidebar = readFileSync(`${ROOT}docs/sidebars.js`, 'utf8');
    for (const page of KIT_PAGES) expect(sidebar).toContain(`'${page.path.replace(/\.md$/, '')}'`);
    for (const output of outputs().filter((entry) => entry.file.includes('/learner-kits/') && entry.file.endsWith('.md'))) {
      expect({ file: output.file, unlisted: output.content.includes('unlisted: true') }).toEqual({
        file: output.file,
        unlisted: /learner-kits\/[^/]+\/[^/]+\.md$/.test(output.file),
      });
    }
  });

  it(
    'gives the pin map of every channel, the bill of materials, the firmware file with where its SHA-256 is published, and the flashing ' +
      'steps',
    () => {
      for (const [index, board] of BOARDS.entries()) {
        for (const lang of ['en', 'es'] as const) {
          const body = KIT_PAGES[index]!.body(lang);
          for (const channel of board.io.channels) expect(body).toContain(`\`${channel.id}\``);
          for (const item of KIT.bom) expect(body).toContain(item.name[lang]);
          expect(body).toContain(`-${board.boardId}.`);
          expect(body).toContain('SHA256SUMS');
          expect(body).toContain('(../../guides/flash-firmware.md)');
          expect(body).toContain(board.supply);
        }
      }
    },
  );
});

describe('LRN-016 every wiring page states the voltage limit, in English and in Spanish', () => {
  it('carries each sentence of the voltage-limit statement of the kit on every wiring page and kit page', () => {
    for (const page of [...KIT_PAGES, ...WIRING_PAGES]) {
      for (const lang of ['en', 'es'] as const) {
        const body = page.body(lang);
        for (const sentence of KIT.voltageLimit[lang])
          expect({ page: page.path, lang, has: body.includes(sentence) }).toEqual({ page: page.path, lang, has: true });
      }
    }
  });
});

describe('LRN-014 the lesson pages link the wiring of their lesson on each board', () => {
  it('has a wiring section on the page of every hardware lesson, and none on the others', () => {
    for (const page of COURSE_PAGES.filter((entry) => entry.path.startsWith('learn/lessons/'))) {
      const id = page.path.replace('learn/lessons/', '').replace(/\.md$/, '');
      const hardware = HARDWARE_LESSONS.some((lesson) => lesson.id === id);
      for (const board of BOARDS)
        expect({ id, linked: page.body('en').includes(`(../../reference/learner-kits/${board.boardId}/${id}.md)`) }).toEqual({
          id,
          linked: hardware,
        });
    }
  });
});

describe('the hardware pages and diagrams are in step with their sources (drift check)', () => {
  it('matches every committed page and diagram', () => {
    for (const { file, content } of outputs()) expect([file, readFileSync(`${ROOT}${file}`, 'utf8')]).toEqual([file, content]);
  });
});

describe('DOC-013 the wiring diagrams are generated drawings, not pictures of the product', () => {
  const manifest: Manifest = {
    schemaVersion: 1,
    command: 'bun run docs:screenshots',
    journey: JOURNEY,
    commit: 'a'.repeat(40),
    worktreeClean: true,
    productVersion: '2.0.0',
    images: [],
  };
  const page = (reference: string) => [{ page: 'p.md', text: `![a diagram](${reference})` }];
  const exists = (path: string) => (path.endsWith('/lesson.en.svg') ? new Uint8Array([60]) : undefined);

  it('lets a page show a wiring diagram the generator wrote, and nothing else outside the manifest', () => {
    expect(checkManifest(manifest, page('/img/wiring/board/lesson.en.svg'), exists, [])).toEqual([]);
    expect(checkManifest(manifest, page('/img/wiring/board/missing.en.svg'), exists, [])).toEqual([
      {
        where: 'p.md',
        message:
          'shows /img/wiring/board/missing.en.svg, a wiring diagram that is not in docs/static/img/wiring: run ' +
          'bun tools/docs/generate_hardware_pages.ts',
      },
    ]);
    expect(checkManifest(manifest, page('/img/screen.png'), exists, [])).toEqual([
      { where: 'p.md', message: 'shows /img/screen.png, which the manifest does not list' },
    ]);
  });
});
