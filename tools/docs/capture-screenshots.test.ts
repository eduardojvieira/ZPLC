import { createHash } from 'node:crypto';
import { describe, expect, it } from 'bun:test';

import {
  checkManifest,
  imagesOf,
  JOURNEY,
  pngSize,
  RECORDED_DIR,
  staticPathOf,
  type Manifest,
  type RecordedImage,
} from './capture-screenshots';

/** A PNG that is only its signature and a header: enough to carry a size. */
function png(width: number, height: number, tag = 0): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[32] = tag;
  return bytes;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const first = png(1440, 900, 1);
const manifest = (
  images = [{ file: 'tutorials/a.png', step: 'A', sha256: digest(first), bytes: first.length, width: 1440, height: 900 }],
): Manifest => ({
  schemaVersion: 1,
  command: 'bun run docs:screenshots',
  journey: JOURNEY,
  commit: 'a'.repeat(40),
  worktreeClean: true,
  productVersion: '2.0.0',
  images,
});
const files = new Map<string, Uint8Array>([['docs/static/img/tutorials/a.png', first]]);
const read = (path: string) => files.get(path);

describe('documentation screenshots: a page shows only captured pictures (DOC-013)', () => {
  it('reads the size of a PNG from its header and refuses a file that is not one', () => {
    expect(pngSize(png(1440, 900))).toEqual({ width: 1440, height: 900 });
    expect(() => pngSize(new Uint8Array([1, 2, 3]))).toThrow('not a PNG');
  });

  it('finds the images a page shows, and none that a code block only quotes', () => {
    const text = [
      '![One](/img/tutorials/a.png)',
      '',
      '```md',
      '![Quoted](/img/tutorials/quoted.png)',
      '```',
      '',
      'Text ![Two](/img/b.svg "title") and [a link](/img/c.png) and `![code](/img/d.png)`.',
    ].join('\n');
    expect(imagesOf(text)).toEqual(['/img/tutorials/a.png', '/img/b.svg']);
    expect(staticPathOf('/img/tutorials/a.png')).toBe('docs/static/img/tutorials/a.png');
    expect(staticPathOf('https://example.org/x.png')).toBeUndefined();
  });

  it('accepts a page whose images are all listed, with the bytes and the size the manifest recorded', () => {
    const pages = [{ page: 'docs/docs/p.md', text: '![A](/img/tutorials/a.png)\n' }];
    expect(checkManifest(manifest(), pages, read, ['docs/static/img/tutorials/a.png'])).toEqual([]);
  });

  it('fails a page that shows an image outside the manifest, whatever it shows', () => {
    const pages = [{ page: 'docs/docs/p.md', text: '![Mock](/img/hero.png)\n![Remote](https://example.org/screen.png)\n' }];
    const problems = checkManifest(manifest(), pages, read, []);
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringContaining('/img/hero.png, which the manifest does not list'),
      expect.stringContaining('https://example.org/screen.png, which is not an image of docs/static/img'),
    ]);
  });

  it('fails a picture that was edited or replaced after it was captured', () => {
    const changed = new Map(files).set('docs/static/img/tutorials/a.png', png(1440, 900, 2));
    expect(
      checkManifest(manifest(), [], (path) => changed.get(path), ['docs/static/img/tutorials/a.png']).map((problem) => problem.message),
    ).toEqual([expect.stringContaining('differs from the one the manifest recorded')]);
    const resized = png(800, 600, 1);
    const entry = manifest([
      { file: 'tutorials/a.png', step: 'A', sha256: digest(resized), bytes: resized.length, width: 1440, height: 900 },
    ]);
    expect(checkManifest(entry, [], () => resized, ['docs/static/img/tutorials/a.png'])[0]!.message).toContain(
      'is 800x600, the manifest says 1440x900',
    );
  });

  it('fails a picture in the folder that the manifest does not list, and a listed picture that is missing', () => {
    expect(
      checkManifest(manifest(), [], read, ['docs/static/img/tutorials/a.png', 'docs/static/img/tutorials/drawn.png']).map(
        (problem) => problem.where,
      ),
    ).toEqual(['docs/static/img/tutorials/drawn.png']);
    expect(checkManifest(manifest(), [], () => undefined, [])[0]!.message).toContain('is listed and is not in docs/static/img');
  });

  it('fails an editor picture that the manifest does not list, as it does a tutorial picture (DOC-006)', () => {
    expect(
      checkManifest(manifest(), [], read, ['docs/static/img/tutorials/a.png', 'docs/static/img/editors/st-en.png']).map(
        (problem) => problem.where,
      ),
    ).toEqual(['docs/static/img/editors/st-en.png']);
  });

  it('wants the commit of the build, in full', () => {
    expect(checkManifest({ ...manifest(), commit: 'main' }, [], read, ['docs/static/img/tutorials/a.png'])[0]!.message).toContain(
      '40 hexadecimal digits',
    );
  });

  it('holds for the pages and the pictures of this repository', () => {
    const result = Bun.spawnSync(['bun', 'tools/docs/capture-screenshots.ts', '--check'], {
      cwd: new URL('../../', import.meta.url).pathname,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });
});

describe('the pictures of the recorded screen-reader check are captured ones too (UX-028, DOC-013)', () => {
  const path = `${RECORDED_DIR}/2026-10-20/en-1-welcome.png`;
  const shot = png(1080, 675, 7);
  const entry: RecordedImage = { path, sha256: digest(shot), width: 1080, height: 675 };
  const recordedFiles = new Map<string, Uint8Array>([[path, shot]]);
  const page = [{ page: 'docs/docs/p.md', text: '![Welcome](/img/screen-reader-check/2026-10-20/en-1-welcome.png)\n' }];
  const read = (file: string) => recordedFiles.get(file);
  const none = manifest([]);

  it('lets a page show a picture that a results.json lists, with the hash and the size it recorded', () => {
    expect(checkManifest(none, page, read, [path], [entry])).toEqual([]);
  });

  it('fails a page that shows a picture of that folder that no results.json lists', () => {
    expect(checkManifest(none, page, read, [path], []).map((problem) => problem.message)).toEqual([
      expect.stringContaining('is a picture that no results.json'),
      expect.stringContaining('which no results.json'),
    ]);
  });

  it('fails a recorded picture that was edited, resized or removed after the run', () => {
    const edited = png(1080, 675, 8);
    expect(checkManifest(none, [], () => edited, [path], [entry]).map((problem) => problem.message)).toEqual([
      expect.stringContaining('differs from the picture its results.json recorded'),
    ]);
    const resized = png(800, 600, 7);
    expect(checkManifest(none, [], () => resized, [path], [{ ...entry, sha256: digest(resized) }])[0]!.message).toContain(
      'is 800x600, its results.json says 1080x675',
    );
    expect(checkManifest(none, [], () => undefined, [], [entry])[0]!.message).toContain('is not in the folder');
  });
});
