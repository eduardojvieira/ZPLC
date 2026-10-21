// What a visitor of the repository finds on its public surface: no scratch file, no template leftover, no duplicate
// image, and every image file in the format its name says (DOC-020, DOC-018). The tests read the list of tracked
// files from git, as a clone sees it, and the bytes of the images; they match no source text.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const ROOT = new URL('../../', import.meta.url).pathname;

function trackedFiles(): string[] {
  const result = Bun.spawnSync(['git', 'ls-files'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
  return result.stdout.toString().split('\n').filter(Boolean);
}

/** Whether git ignores a path that is not tracked: what `git status` would hide from a contributor. */
function isIgnored(path: string): boolean {
  return Bun.spawnSync(['git', 'check-ignore', '--no-index', '-q', path], { cwd: ROOT }).exitCode === 0;
}

// The paths of DOC-020, with `IDE/` read as packages/zplc-ide and `APP/` as firmware/app (the layout after the
// move of the sources). A directory ends in `/`.
const REMOVED = [
  'packages/zplc-ide/monaco_test.ts',
  'packages/zplc-ide/test_mpeek_2.ts',
  'packages/zplc-ide/output_fbd.txt',
  'packages/zplc-ide/output_ld.txt',
  'packages/zplc-ide/output_sfc.txt',
  'packages/zplc.json',
  'firmware/app/build_tests/',
  'packages/zplc-ide/src/components/WatchWindow.tsx',
  'packages/zplc-ide/src/App.css',
  // the template posts and images of the site generator, and the two generated landing images
  'docs/blog/2019-05-28-first-blog-post.md',
  'docs/blog/2019-05-29-long-blog-post.md',
  'docs/blog/2021-08-01-mdx-blog-post.mdx',
  'docs/blog/2021-08-26-welcome/',
  'docs/blog/tags.yml',
  'docs/static/img/docusaurus-social-card.jpg',
  'docs/static/img/undraw_docusaurus_mountain.svg',
  'docs/static/img/undraw_docusaurus_react.svg',
  'docs/static/img/undraw_docusaurus_tree.svg',
  'docs/static/img/favicon.ico',
  'docs/static/img/hero-ide-runtime.png',
  'docs/static/img/architecture-diagram.png',
  // the duplicate of the banner, the orphan translation of version 1.0.0, and the files of tools that are not used
  'docs/assets/banner.png',
  'docs/i18n/es/docusaurus-plugin-content-docs/version-1.0.0/',
  '.dockerignore',
  '.eslintignore',
  'Makefile',
];

describe('repository hygiene: the non-functional items of the requirement are not in the tree (DOC-020)', () => {
  const tracked = trackedFiles();

  it('tracks none of the scratch files, template leftovers and duplicates it lists', () => {
    const present = REMOVED.filter((path) => (path.endsWith('/') ? tracked.some((file) => file.startsWith(path)) : tracked.includes(path)));
    expect(present).toEqual([]);
  });

  it("keeps the post and the author that are the project's own, which the template posts used to bury", () => {
    expect(tracked.filter((file) => file.startsWith('docs/blog/'))).toEqual([
      'docs/blog/2026-01-07-zplc-v1.4.3-release.md',
      'docs/blog/authors.yml',
    ]);
  });

  it('ignores the build directories a contributor creates, at any depth', () => {
    const builds = [
      'build/',
      'firmware/lib/zplc_core/build/',
      'firmware/app/build_tests/',
      'firmware/app/build_posix/',
      'docs/build/',
      'packages/zplc-ide/dist/',
      'twister-out/',
    ];
    expect(builds.filter((path) => !isIgnored(path))).toEqual([]);
  });
});

// The first bytes of each format an image file of the repository may have.
const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  '.png': (head) => head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (head) => head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  '.jpeg': (head) => head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  '.gif': (head) => head.subarray(0, 4).toString('latin1') === 'GIF8',
  '.webp': (head) => head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP',
  '.ico': (head) => head.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])),
  '.svg': (head) => /^\s*(<\?xml|<svg)/.test(head.toString('utf8')),
};

describe('docs site: an image file is the format its name says (DOC-018)', () => {
  it('has no JPEG named .png, no PNG named .jpg, and so on, among the tracked images', () => {
    const wrong = trackedFiles()
      .filter((file) => extname(file).toLowerCase() in SIGNATURES)
      .filter((file) => {
        const head = readFileSync(join(ROOT, file)).subarray(0, 256);
        return !SIGNATURES[extname(file).toLowerCase()]!(head);
      });
    expect(wrong).toEqual([]);
  });

  it('serves a favicon and a social card that exist, and a favicon that is a small file, not the picture of the identity', async () => {
    const { default: config } = (await import(join(ROOT, 'docs/docusaurus.config.js'))) as {
      default: { favicon: string; themeConfig: { image: string } };
    };
    const favicon = readFileSync(join(ROOT, 'docs/static', config.favicon));
    expect(favicon.length).toBeLessThan(100 * 1024);
    expect(readFileSync(join(ROOT, 'docs/static', config.themeConfig.image)).length).toBeGreaterThan(0);
  });
});
