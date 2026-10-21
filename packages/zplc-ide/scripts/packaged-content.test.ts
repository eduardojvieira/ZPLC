// REL-034, REL-019: what an installer carries, checked on the unpacked package that electron-builder made. The
// package is the artifact; the checks read it and never the build configuration.
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkFirmware, checkPackagedContent, encodings, readAsarFile } from './packaged-content';
import { listAsarFiles } from './run-packaged-desktop-smoke';

/** An asar archive of `files`: four little-endian words, the header JSON padded to 4 bytes, then the file bytes. */
function buildAsar(files: Record<string, string>): Uint8Array {
  const tree: { files: Record<string, unknown> } = { files: {} };
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const bytes = Buffer.from(text, 'utf8');
    let directory = tree;
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) {
      directory.files[part] ??= { files: {} };
      directory = directory.files[part] as { files: Record<string, unknown> };
    }
    directory.files[parts.at(-1)!] = { size: bytes.length, offset: String(offset) };
    chunks.push(bytes);
    offset += bytes.length;
  }
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const padded = Math.ceil(json.length / 4) * 4;
  const header = Buffer.alloc(16 + padded);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(8 + padded, 4);
  header.writeUInt32LE(4 + padded, 8);
  header.writeUInt32LE(json.length, 12);
  json.copy(header, 16);
  return Buffer.concat([header, ...chunks]);
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A repository folder and an unpacked package that match each other, which a test then breaks in one place. */
function fixture(options: { bundle?: string; notices?: string; omitExample?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zplc-content-'));
  roots.push(root);
  const repo = join(root, 'repo');
  const pkg = join(repo, 'packages/zplc-ide');
  mkdirSync(join(pkg, 'projects/blinky/src'), { recursive: true });
  mkdirSync(join(pkg, 'src/components'), { recursive: true });
  mkdirSync(join(pkg, 'lessons/first-blink'), { recursive: true });
  mkdirSync(join(repo, 'examples'), { recursive: true });
  const manifest = '{\n  "name": "Blinky",\n  "tasks": []\n}\n';
  const program = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nx := NOT x; (* it\'s "quoted" *)\nEND_PROGRAM\n';
  writeFileSync(join(pkg, 'projects/blinky/zplc.json'), manifest);
  writeFileSync(join(pkg, 'projects/blinky/src/main.st'), program);
  writeFileSync(
    join(pkg, 'src/components/learnContent.en.v1.ts'),
    "export const x = [{\n  id: 'scan-cycle-one-scan-memory', title: 'Scan' },\n  { id: 'motor-start-stop-safe' }];\n",
  );
  writeFileSync(join(pkg, 'lessons/first-blink/lesson.json'), JSON.stringify({ id: 'first-blink', version: 1 }));
  writeFileSync(join(repo, 'examples/01_hello.zplc'), 'ZPLCBYTES');
  writeFileSync(join(repo, 'examples/README.md'), 'not shipped');

  const bundle =
    options.bundle ??
    `const a=${JSON.stringify(manifest)};const b=${JSON.stringify(
      program,
    )};const lessons=["scan-cycle-one-scan-memory","motor-start-stop-safe","first-blink"];`;
  const resources = join(root, 'out/linux-unpacked/resources');
  mkdirSync(join(resources, 'examples'), { recursive: true });
  mkdirSync(join(resources, 'native-runtime'), { recursive: true });
  writeFileSync(
    join(resources, 'app.asar'),
    buildAsar({
      'dist/assets/index-abc.js': bundle,
      'dist/assets/codicon-xyz.ttf': 'font',
      'node_modules/react/package.json': '{"name":"react"}',
      'node_modules/@xyflow/react/package.json': '{"name":"@xyflow/react"}',
      'package.json': '{"name":"@zplc/ide"}',
    }),
  );
  if (!options.omitExample) writeFileSync(join(resources, 'examples/01_hello.zplc'), 'ZPLCBYTES');
  writeFileSync(join(resources, 'native-runtime/zplc_runtime'), 'binary');
  writeFileSync(
    join(resources, 'THIRD-PARTY-NOTICES.txt'),
    options.notices ??
      'react@19.0.0\nLicense: MIT\n\n@xyflow/react@12.0.0\nLicense: MIT\n\nCodicons (assets/codicon-xyz.ttf)\nLicense: CC-BY-4.0\n',
  );
  writeFileSync(join(resources, '..', 'LICENSE.electron.txt'), 'electron');
  writeFileSync(join(resources, '..', 'LICENSES.chromium.html'), 'chromium');
  return { repo, pkg, resources };
}

describe('the asar reader (REL-034)', () => {
  test('lists files and returns the exact bytes of one, in nested folders', () => {
    const archive = buildAsar({ 'dist/assets/a.js': 'AAA', 'dist/b.js': 'BB', 'package.json': '{}' });
    expect(listAsarFiles(archive).sort()).toEqual(['dist/assets/a.js', 'dist/b.js', 'package.json']);
    expect(Buffer.from(readAsarFile(archive, 'dist/assets/a.js')).toString()).toBe('AAA');
    expect(Buffer.from(readAsarFile(archive, 'dist/b.js')).toString()).toBe('BB');
    expect(() => readAsarFile(archive, 'dist/missing.js')).toThrow(/dist\/missing\.js/);
  });
});

describe('the encodings of a string in a minified bundle (REL-034)', () => {
  test('are the three quotings a minifier chooses between, with the escapes of each', () => {
    const forms = encodings('a "b" \'c\'\nd\\e`f${g}');
    expect(forms).toContain('"a \\"b\\" \'c\'\\nd\\\\e`f${g}"');
    expect(forms).toContain("'a \"b\" \\'c\\'\\nd\\\\e`f${g}'");
    expect(forms).toContain('`a "b" \'c\'\nd\\\\e\\`f\\${g}`');
  });
});

describe('the Linux desktop identity of the unpacked package (REL-011)', () => {
  const IDENTITY = {
    productName: 'ZPLC',
    appId: 'com.zenithindustrialcloud.zplc',
    executableName: 'zplc',
    desktopName: 'com.zenithindustrialcloud.zplc',
  };

  /** A Linux unpacked package: the manifest of the archive replaced, Electron's chrome-sandbox and the executable beside the resources. */
  function linux(manifest: string, executable = IDENTITY.executableName) {
    const made = fixture();
    const archive = join(made.resources, 'app.asar');
    const original = readFileSync(archive);
    const files: Record<string, string> = {};
    for (const path of listAsarFiles(original)) files[path] = Buffer.from(readAsarFile(original, path)).toString('utf8');
    writeFileSync(archive, buildAsar({ ...files, 'package.json': manifest }));
    const root = join(made.resources, '..');
    writeFileSync(join(root, 'chrome-sandbox'), 'sandbox');
    writeFileSync(join(root, executable), 'executable');
    mkdirSync(join(made.repo, 'scripts/release'), { recursive: true });
    writeFileSync(join(made.repo, 'scripts/release/identity.json'), JSON.stringify(IDENTITY));
    return made;
  }

  test('passes when the packaged manifest carries the desktop name of the identity and the package holds its executable', () => {
    const { repo, resources } = linux('{"name":"@zplc/ide","desktopName":"com.zenithindustrialcloud.zplc"}');
    expect(checkPackagedContent({ resources, repoRoot: repo })).toEqual([]);
  });

  test('accepts the form that names the .desktop file of the entry', () => {
    const { repo, resources } = linux('{"name":"@zplc/ide","desktopName":"com.zenithindustrialcloud.zplc.desktop"}');
    expect(checkPackagedContent({ resources, repoRoot: repo })).toEqual([]);
  });

  test('names a package whose desktop name is not the identity, one with no desktopName, and one without the executable', () => {
    const wrong = linux('{"name":"@zplc/ide","desktopName":"zplc-ide"}');
    expect(checkPackagedContent({ resources: wrong.resources, repoRoot: wrong.repo })).toContain(
      'desktopName zplc-ide of app.asar is not com.zenithindustrialcloud.zplc, the desktop name of scripts/release/identity.json',
    );
    const none = linux('{"name":"@zplc/ide"}');
    expect(checkPackagedContent({ resources: none.resources, repoRoot: none.repo })).toContain(
      'the package.json of app.asar has no desktopName: the window and the desktop entry would not match',
    );
    const renamed = linux('{"name":"@zplc/ide","desktopName":"com.zenithindustrialcloud.zplc"}', 'zplc-ide');
    expect(checkPackagedContent({ resources: renamed.resources, repoRoot: renamed.repo })).toContain(
      'the unpacked package has no executable zplc, the executable name of scripts/release/identity.json',
    );
  });

  test('asks nothing of a package that is not a Linux one', () => {
    const { repo, resources } = fixture();
    expect(checkPackagedContent({ resources, repoRoot: repo })).toEqual([]);
  });
});

describe('packaged content (REL-034)', () => {
  test('passes for a package that holds every example, lesson, bundled example file and notice', () => {
    const { repo, resources } = fixture();
    expect(checkPackagedContent({ resources, repoRoot: repo })).toEqual([]);
  });

  test('names an example project file that is not in the renderer bundle', () => {
    const { repo, resources } = fixture({
      bundle: 'const nothing=1;const lessons=["scan-cycle-one-scan-memory","motor-start-stop-safe","first-blink"];',
    });
    const problems = checkPackagedContent({ resources, repoRoot: repo });
    expect(problems).toContain('example project file projects/blinky/zplc.json is not in the renderer bundle');
    expect(problems).toContain('example project file projects/blinky/src/main.st is not in the renderer bundle');
  });

  test('names a lesson, from the content files or from a lesson package folder, that the bundle lacks', () => {
    const bundle = 'const a="{\\n  \\"name\\": \\"Blinky\\",\\n  \\"tasks\\": []\\n}\\n";const lessons=["scan-cycle-one-scan-memory"];';
    const { repo, resources } = fixture({ bundle });
    const problems = checkPackagedContent({ resources, repoRoot: repo });
    expect(problems).toContain('lesson motor-start-stop-safe is not in the renderer bundle');
    expect(problems).toContain('lesson first-blink is not in the renderer bundle');
    expect(problems.some((problem) => problem.includes('scan-cycle-one-scan-memory'))).toBe(false);
  });

  test('names an example bytecode file that is missing from the resources', () => {
    const { repo, resources } = fixture({ omitExample: true });
    expect(checkPackagedContent({ resources, repoRoot: repo })).toContain('examples/01_hello.zplc is not in the resources');
  });

  test('names a package of the application with no licence notice, and a font with none', () => {
    const { repo, resources } = fixture({ notices: 'react@19.0.0\nLicense: MIT\n' });
    const problems = checkPackagedContent({ resources, repoRoot: repo });
    expect(problems).toContain('node_modules/@xyflow/react of app.asar has no entry in THIRD-PARTY-NOTICES.txt');
    expect(problems).toContain('font dist/assets/codicon-xyz.ttf of app.asar has no entry in THIRD-PARTY-NOTICES.txt');
  });

  test('names a package with no notices file at all', () => {
    const { repo, resources } = fixture();
    rmSync(join(resources, 'THIRD-PARTY-NOTICES.txt'));
    expect(checkPackagedContent({ resources, repoRoot: repo })).toContain('THIRD-PARTY-NOTICES.txt is not in the resources');
  });
});

describe('the firmware images of the package (REL-025)', () => {
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const image = (board: string, file: string, learner: boolean, content: string, role = 'flash') => ({
    board,
    file,
    learner,
    role,
    sha256: sha(content),
    bytes: content.length,
  });
  /** A resources folder with a firmware folder: the manifest, the files it names, and what a test then breaks. */
  function resources(options: { omit?: string[]; extra?: Record<string, string>; boards?: string[] } = {}): string {
    const root = mkdtempSync(join(tmpdir(), 'zplc-firmware-'));
    roots.push(root);
    const folder = join(root, 'firmware');
    mkdirSync(folder, { recursive: true });
    const contents: Record<string, string> = {
      'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2': 'pico',
      'zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin': 'esp',
      'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin': 'nucleo',
    };
    const boards = options.boards ?? ['rpi_pico', 'esp32s3_devkitc'];
    const images = [
      ...(boards.includes('rpi_pico') ? [image('rpi_pico', 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', true, 'pico')] : []),
      ...(boards.includes('esp32s3_devkitc')
        ? [image('esp32s3_devkitc', 'zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin', true, 'esp')]
        : []),
      image('nucleo_h743zi', 'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin', false, 'nucleo'),
    ];
    writeFileSync(
      join(folder, 'zplc-runtime-2.0.0-rc.4.manifest.json'),
      JSON.stringify({ schema: 'zplc.firmware-release/1', version: '2.0.0-rc.4', commit: 'a'.repeat(40), images, builds: {} }),
    );
    for (const [name, content] of Object.entries({ ...contents, ...options.extra })) {
      if (
        !(options.omit ?? []).includes(name) &&
        (name in (options.extra ?? {}) || images.some((entry) => entry.file === name && entry.learner))
      )
        writeFileSync(join(folder, name), content);
    }
    return root;
  }

  test('a package with the manifest and the two learner images, and no other image, has no problem', () => {
    expect(checkFirmware(resources(), true)).toEqual([]);
  });

  test('a package made while no firmware bundle was available is a problem only when one was', () => {
    const root = mkdtempSync(join(tmpdir(), 'zplc-firmware-'));
    roots.push(root);
    expect(checkFirmware(root, false)).toEqual([]);
    expect(checkFirmware(root, true)).toEqual(['firmware/ is not in the resources, and a firmware bundle was available']);
  });

  test('names a learner image that is missing, one that differs from the manifest, and an image that should not be there', () => {
    expect(checkFirmware(resources({ omit: ['zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin'] }), true)).toEqual([
      'firmware/zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin is not in the resources',
    ]);
    const changed = resources({ extra: { 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2': 'changed' } });
    expect(checkFirmware(changed, true).join('\n')).toContain('does not have the checksum or size that the manifest states');
    const extra = resources({ extra: { 'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin': 'nucleo' } });
    expect(checkFirmware(extra, true).join('\n')).toContain('is not a learner-board image of the manifest');
  });

  test('refuses a manifest that names no image for a learner board', () => {
    expect(checkFirmware(resources({ boards: ['rpi_pico'] }), true).join('\n')).toContain('no image for the learner board esp32s3_devkitc');
  });
});
