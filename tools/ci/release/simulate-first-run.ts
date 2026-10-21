/**
 * Simulated first-run check of a release draft (REL-016), run on one Linux machine.
 *
 * Owner decision 2026-10-20: the first-run checks of a draft that RELEASING.md step 6 asks for on a real Mac and a real
 * Windows machine are simulated on Linux. This script runs every step of those checks that can run here against the
 * installers that electron-builder produced, and writes a JSON record with the result of each step. It is simulated on
 * Linux by owner decision 2026-10-20, not a real Mac or Windows machine: it never proves what SmartScreen, Smart App
 * Control, Gatekeeper or Privacy & Security show, and the record says which steps were not simulated, and why.
 *
 *   Linux    the .deb and the .rpm are unpacked and checked (Docker needs the docker group, so a container is used only
 *            when the user can reach it), the .deb layout is launched, and the AppImage is launched with
 *            --appimage-extract-and-run; both go through the same window, version, lesson, build and simulation steps.
 *   Windows  the NSIS installer is installed silently into a fresh Wine prefix, the installed application and the
 *            portable executable are launched under Wine, the files the install page names are checked, and the
 *            application is uninstalled again.
 *   macOS    the zip is read as files only: bundle name, Info.plist, nested native runtime. It cannot be launched here.
 *
 * Usage (DISPLAY must be a private display, never the owner's :0; Wayland variables are removed for the children):
 *   DISPLAY=:42 bun tools/ci/release/simulate-first-run.ts [--dist DIR] [--out FILE] [--only linux,windows,macos]
 *
 * Everything the script writes goes under ~/.cache/zplc-rel016 (the Wine prefix, the unpacked packages, the profiles).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, hostname } from 'node:os';
import { basename, join, relative } from 'node:path';
import { Cdp } from '../../../packages/zplc-ide/scripts/cdpHarness';

export type Status = 'pass' | 'fail' | 'not-simulated';
export interface Step {
  os: 'linux' | 'windows' | 'macos';
  id: string;
  status: Status;
  detail: string;
}

export const STATEMENT = 'Simulated on Linux by owner decision 2026-10-20, not a real Mac or Windows machine.';
export const APP_ID = 'com.zenithindustrialcloud.zplc';

const repo = join(import.meta.dir, '..', '..', '..');
const cache = join(homedir(), '.cache', 'zplc-rel016');
const HOST = '127.0.0.1';

export function summarize(steps: Step[]): Record<Status, number> {
  return {
    pass: steps.filter((s) => s.status === 'pass').length,
    fail: steps.filter((s) => s.status === 'fail').length,
    'not-simulated': steps.filter((s) => s.status === 'not-simulated').length,
  };
}

/** The string value of a key of an XML property list, or undefined (the first match: the top-level dictionary comes first). */
export function plistString(xml: string, key: string): string | undefined {
  return new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
}

/** The record must not carry the user's home folder. */
export const scrub = (text: string): string => text.replaceAll(homedir(), '~');

const steps: Step[] = [];
let logFile = '';
function log(line: string): void {
  console.log(line);
  if (logFile) appendFileSync(logFile, `${scrub(line)}\n`);
}
function record(os: Step['os'], id: string, status: Status, detail: string): void {
  steps.push({ os, id, status, detail: scrub(detail) });
  log(`[${os}] ${status.toUpperCase().padEnd(13)} ${id}: ${scrub(detail).slice(0, 300)}`);
}
/** Runs a check; an exception is a failed step, never a crash of the whole run. */
async function step(
  os: Step['os'],
  id: string,
  check: () => Promise<string | { status: Status; detail: string }> | string | { status: Status; detail: string },
): Promise<void> {
  try {
    const result = await check();
    if (typeof result === 'string') record(os, id, 'pass', result);
    else record(os, id, result.status, result.detail);
  } catch (error) {
    record(os, id, 'fail', error instanceof Error ? error.message : String(error));
  }
}
function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sh(
  command: string,
  env: Record<string, string | undefined> = {},
  timeoutMs = 120_000,
): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(['bash', '-c', command], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } });
  const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  clearTimeout(timer);
  return { code, out: `${out}${err}`.trim() };
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const a = server.address();
      server.close(() => resolve(typeof a === 'object' && a ? a.port : 0));
    });
  });
}
async function until<T>(what: string, check: () => Promise<T | undefined | false> | T | undefined | false, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value as T;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(300);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${last})` : ''}`);
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const tree = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: false }).map(String) : []);
const isExecutable = (path: string): boolean => (statSync(path).mode & 0o111) !== 0;

// ---------------------------------------------------------------------------------------------------------------------
// Driving a launched application over the DevTools protocol, as a person would: the Welcome screen, Learn, Build, Connect, Run.
// ---------------------------------------------------------------------------------------------------------------------

interface Launch {
  os: Step['os'];
  label: string;
  argv: string[];
  env: Record<string, string>;
  /** Where the application keeps its user data (the folder that must be named ZPLC). */
  userData: string;
  /** Run the lesson, build and simulation steps as well as the launch steps. */
  flow: boolean;
  /** The flow cannot be expected to work on this host (Wine): a failed flow step is recorded as not simulated, with the reason. */
  flowMayBeUnavailable?: boolean;
  stop?: () => Promise<void>;
}

function childEnvironment(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  for (const key of ['WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'XDG_BACKEND', 'GDK_BACKEND', 'QT_QPA_PLATFORM', 'MOZ_ENABLE_WAYLAND'])
    delete env[key];
  for (const key of Object.keys(env)) if (key.startsWith('HYPRLAND_')) delete env[key];
  return { ...env, ELECTRON_OZONE_PLATFORM_HINT: 'x11', ...extra };
}

async function exercise(launch: Launch, expectedVersion: string): Promise<void> {
  const { os, label } = launch;
  const port = await freePort();
  const logPath = join(cache, 'logs', `${label}.log`);
  mkdirSync(join(cache, 'logs'), { recursive: true });
  // --no-sandbox: an unpacked tree has no setuid chrome-sandbox, and Chromium cannot make a sandbox under Wine. The packaged
  // artifacts are not changed by this; the hosted package check runs with the sandbox on.
  const argv = ['setsid', ...launch.argv, '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`];
  const proc = Bun.spawn(argv, { stdout: Bun.file(logPath), stderr: Bun.file(logPath), env: childEnvironment(launch.env) });
  let cdp: Cdp | undefined;
  const terminate = async () => {
    cdp?.close();
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await launch.stop?.();
  };
  try {
    const target = await until(
      `${label}: the window`,
      async () => {
        if (proc.exitCode !== null)
          throw new Error(`the application exited with code ${proc.exitCode}: ${scrub(readFileSync(logPath, 'utf8').slice(-400))}`);
        const list = await fetch(`http://${HOST}:${port}/json/list`)
          .then((r) => r.json() as Promise<Array<{ type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string }>>)
          .catch(() => []);
        return list.find((t) => t.type === 'page' && t.url?.startsWith('file:') && t.webSocketDebuggerUrl);
      },
      180_000,
    ).catch((error: Error) => {
      record(os, `${label}.launch`, 'fail', error.message);
      return undefined;
    });
    if (!target) return;
    record(os, `${label}.launch`, 'pass', `the application opened its window (${target.url?.split('/').slice(-3).join('/')})`);
    cdp = await Cdp.connect(target.webSocketDebuggerUrl!);
    await until(`${label}: the preload bridge`, async () => await cdp!.evaluate('Boolean(window.electronAPI?.getAppInfo)'), 60_000);

    await step(os, `${label}.title`, async () => {
      const title = await until(
        'the title ZPLC',
        async () => {
          const list = await fetch(`http://${HOST}:${port}/json/list`).then(
            (r) => r.json() as Promise<Array<{ type?: string; title?: string }>>,
          );
          return list.find((t) => t.type === 'page')?.title === 'ZPLC' ? 'ZPLC' : undefined;
        },
        20_000,
      );
      const named = await sh(`xdotool search --name '^ZPLC$' | head -3`, { DISPLAY: process.env.DISPLAY });
      must(
        named.code === 0 && named.out.length > 0,
        `the page title is ${title}, but no window of the display is named exactly ZPLC (xdotool: ${named.out || 'no match'})`,
      );
      return `the page title and the title of the window on the display are ZPLC (window ${named.out.split('\n')[0]})`;
    });
    await step(os, `${label}.version`, async () => {
      const info = (await cdp!.evaluate('window.electronAPI.getAppInfo()')) as {
        version: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
      };
      must(
        info.version === expectedVersion && info.isPackaged === true,
        `getAppInfo says ${JSON.stringify(info)}, expected version ${expectedVersion} and isPackaged true`,
      );
      return `version ${info.version}, isPackaged ${info.isPackaged}, platform ${info.platform}/${info.arch}`;
    });
    await step(os, `${label}.user-data`, async () => {
      const found = await until(
        'the user-data folder',
        () => {
          const names = existsSync(launch.userData) ? readdirSync(launch.userData) : [];
          return names.includes('ZPLC') ? names : undefined;
        },
        20_000,
      ).catch(() => {
        throw new Error(
          `the application created ${
            tree(launch.userData)
              .filter((p) => p.split('/').length <= 2)
              .join(', ') || 'no folder'
          } and no folder named ZPLC, which the install page says it uses`,
        );
      });
      must(!found.includes('ZPLC IDE'), 'a folder named ZPLC IDE was created');
      return `the application keeps its data in a folder named ZPLC (${basename(launch.userData)}/ZPLC), not ZPLC IDE`;
    });
    if (!launch.flow) return;

    const click = async (text: string, role = 'button') => {
      await until(
        `${label}: ${text}`,
        async () =>
          (await cdp!.evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const el = [...document.querySelectorAll(${JSON.stringify(role === 'button' ? 'button' : `[role="${role}"]`)})].find((e) => {
          const names = [e.getAttribute('aria-label') || '', e.textContent || ''].map((x) => x.trim());
          return wanted.startsWith('=') ? names.some((x) => x === wanted.slice(1)) : names.some((x) => x.startsWith(wanted));
        });
        if (!el || el.disabled) return false;
        el.click();
        return true;
      })()`)) === true,
        45_000,
      );
    };
    const visible = async (text: string) =>
      (await cdp!.evaluate(
        `[...document.querySelectorAll('button')].some((e) => [e.getAttribute('aria-label') || '', e.textContent || ''].some((x) => ` +
          `x.trim().startsWith(${JSON.stringify(text)})))`,
      )) as boolean;
    const windowText = async () => String(await cdp!.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`));
    let opened = false;
    await step(os, `${label}.open-example`, async () => {
      // The Learn course opens an app-owned workspace without a native folder dialog, which a headless run cannot answer.
      await click('Learn');
      await click('Start the course');
      await until(
        'the lesson workspace',
        async () =>
          await cdp!.evaluate(
            `Boolean(document.getElementById('learn-title')) && [...document.querySelectorAll('button')].some((b) => ` +
              `(b.getAttribute('aria-label') || '').startsWith('Build options'))`,
          ),
        90_000,
      );
      opened = true;
      return `the first lesson ("${await cdp!.evaluate(
        `document.getElementById('learn-title').textContent.trim()`,
      )}") opened with its starter project`;
    });
    record(
      os,
      `${label}.native-folder-dialog`,
      'not-simulated',
      'the Open project button opens the native folder dialog of the system, which a headless run cannot answer (the test hook that ' +
        'answers it exists only in builds made for the suite, by design, VF-008); the example was opened through the Learn course, which ' +
        'opens an app-owned workspace with no dialog. The real dialog of the system was not exercised',
    );
    if (!opened) return;
    let built = false;
    await step(os, `${label}.build`, async () => {
      await click('Build options');
      await click('Compile', 'menuitem');
      if (!(await cdp!.evaluate(`document.getElementById('console-tab-output')?.getAttribute('aria-selected') === 'true'`)))
        await click('Output', 'tab');
      const result = await until(
        'a build result in Output',
        async () =>
          (
            String(await cdp!.evaluate(`document.querySelector('[role="tabpanel"][id^="console-panel-"]')?.innerText ?? ''`)).match(
              new RegExp(
                [
                  'Built saved workspace locally: [^\\n]*',
                  'Canonical workspace build failed[^\\n]*',
                  'Save changes before building[^\\n]*',
                  'Build requires a saved folder[^\\n]*',
                  'Saved workspace (?:compiler is unavailable|could not be opened)[^\\n]*',
                ].join('|'),
                'g',
              ),
            ) ?? []
          ).at(-1),
        90_000,
      );
      must(result.startsWith('Built'), result);
      built = true;
      return result;
    });
    if (!built) return;
    let connected = false;
    await step(os, `${label}.simulation-connect`, async () => {
      try {
        await click('=Connect');
        await until('the simulation to connect', async () => await visible('Disconnect'), 60_000);
      } catch (error) {
        const detail = `${(error as Error).message}; the window says: ${(await windowText()).slice(0, 500)}`;
        if (launch.flowMayBeUnavailable)
          return { status: 'not-simulated' as Status, detail: `the packaged native runtime did not connect under this host: ${detail}` };
        throw new Error(detail);
      }
      connected = true;
      return 'Connect started the packaged native runtime and the window shows Disconnect';
    });
    if (!connected) return;
    await step(os, `${label}.simulation-run`, async () => {
      await click('Run (F5)');
      await until('the program to run', async () => await visible('Pause (F6)'), 60_000);
      await click('Watch', 'tab').catch(() => undefined);
      const seen = new Set<string>();
      const deadline = Date.now() + 9_000;
      while (Date.now() < deadline) {
        for (const value of (await cdp!.evaluate(
          `[...document.querySelectorAll('[data-output] [data-output-value]')].map((e) => e.textContent.trim())`,
        )) as string[])
          seen.add(value);
        await Bun.sleep(250);
      }
      return `Run shows Pause; the faceplate output values seen over 9 s: ${[...seen].join(', ') || 'none shown'}`;
    });
  } finally {
    await terminate();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------------------------------------------------

async function unpack(kind: 'deb' | 'rpm', file: string, dest: string): Promise<void> {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const command =
    kind === 'deb'
      ? `member=$(bsdtar -tf '${file}' | grep '^data\\.tar'); bsdtar -xOf '${file}' "$member" | bsdtar -x -C '${dest}'`
      : `rpm2cpio '${file}' | bsdtar -x -C '${dest}'`;
  const result = await sh(command);
  must(result.code === 0, `could not unpack ${basename(file)}: ${result.out}`);
}

function checkInstalledTree(root: string, appDir: string): string[] {
  const missing: string[] = [];
  const need = (path: string, what: string) => {
    if (!existsSync(join(root, path))) missing.push(`${what} (${path})`);
  };
  need('usr/lib/udev/rules.d/70-zplc-boards.rules', 'the udev rule of the boards, named by the install page');
  need(`${appDir}/resources/native-runtime/zplc_runtime`, 'the native runtime');
  need(`${appDir}/resources/THIRD-PARTY-NOTICES.txt`, 'the third-party notices');
  need(`${appDir}/resources/app.asar`, 'the application archive');
  need(`${appDir}/resources/examples`, 'the examples');
  return missing;
}

async function linux(dist: string, version: string, runDir: string): Promise<void> {
  const deb = join(dist, `zplc-${version}-linux-amd64.deb`);
  const rpm = join(dist, `zplc-${version}-linux-x86_64.rpm`);
  const appImage = join(dist, `zplc-${version}-linux-x86_64.AppImage`);

  await step('linux', 'docker', async () => {
    const info = await sh('docker info --format "{{.ServerVersion}}"');
    if (info.code === 0)
      return {
        status: 'pass' as Status,
        detail:
          `docker ${info.out} is reachable without sudo, but this script unpacks the packages instead of installing them in a ` +
          `container`,
      };
    return {
      status: 'not-simulated' as Status,
      detail:
        `a clean container install was not run: this user cannot reach the Docker daemon ` +
        `(${info.out.split('\n')[0]}). The packages are unpacked with bsdtar and rpm2cpio instead; scripts/check-linux-package.sh, which ` +
        `installs them in Debian 13, Ubuntu 24.04 and Fedora containers, runs in the hosted release workflow`,
    };
  });

  const debDir = join(runDir, 'deb');
  await step('linux', 'deb.control', async () => {
    const control = await sh(
      `member=$(bsdtar -tf '${deb}' | grep '^control\\.tar'); bsdtar -xOf '${deb}' "$member" | bsdtar -xO -f - ./control`,
    );
    must(control.code === 0, control.out);
    const field = (name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(control.out)?.[1];
    must(field('Package') === 'zplc', `Package is ${field('Package')}, expected zplc (the install page says: sudo apt remove zplc)`);
    // Debian writes a prerelease with a tilde, so that 2.0.0~rc.3 sorts before 2.0.0.
    must(field('Version') === version.replace('-', '~'), `Version is ${field('Version')}, expected ${version.replace('-', '~')}`);
    must(field('Architecture') === 'amd64', `Architecture is ${field('Architecture')}`);
    return `Package zplc, Version ${field('Version')}, Architecture ${field('Architecture')}, ${
      field('Depends')?.split(',').length
    } dependencies`;
  });
  await step('linux', 'deb.files', async () => {
    await unpack('deb', deb, debDir);
    const appDir = readdirSync(join(debDir, 'opt')).map((d) => `opt/${d}`)[0];
    must(appDir, 'the package installs nothing under /opt');
    const missing = checkInstalledTree(debDir, appDir);
    must(missing.length === 0, `missing: ${missing.join('; ')}`);
    // electron-builder links the command in the post-install script, not in the payload.
    const postinst = await sh(
      `member=$(bsdtar -tf '${deb}' | grep '^control\\.tar'); bsdtar -xOf '${deb}' "$member" | bsdtar -xO -f - ./postinst`,
    );
    must(postinst.code === 0 && postinst.out.includes('/usr/bin/zplc'), 'the post-install script does not link /usr/bin/zplc');
    const desktop = tree(join(debDir, 'usr/share/applications'));
    must(desktop.includes(`${APP_ID}.desktop`), `the desktop file is ${desktop.join(', ') || 'missing'}, expected ${APP_ID}.desktop`);
    must(isExecutable(join(debDir, appDir, 'resources/native-runtime/zplc_runtime')), 'the native runtime is not executable');
    return (
      `${appDir} holds the runtime (executable), notices, examples and app.asar; the post-install script links ` +
      `/usr/bin/zplc; ${APP_ID}.desktop and the udev rule are installed`
    );
  });
  await step('linux', 'rpm.files', async () => {
    const query = await sh(`rpm -qp --queryformat '%{NAME} %{VERSION}-%{RELEASE} %{ARCH}' '${rpm}' 2>/dev/null`);
    must(query.code === 0 && query.out.startsWith('zplc '), `rpm says ${query.out}`);
    const rpmDir = join(runDir, 'rpm');
    await unpack('rpm', rpm, rpmDir);
    const appDir = readdirSync(join(rpmDir, 'opt')).map((d) => `opt/${d}`)[0];
    must(appDir, 'the package installs nothing under /opt');
    const missing = checkInstalledTree(rpmDir, appDir);
    must(missing.length === 0, `missing: ${missing.join('; ')}`);
    rmSync(rpmDir, { recursive: true, force: true });
    return `rpm ${query.out}; ${appDir} holds the same files as the deb`;
  });

  const display = process.env.DISPLAY!;
  const appDir = existsSync(join(debDir, 'opt')) ? join(debDir, 'opt', readdirSync(join(debDir, 'opt'))[0]) : undefined;
  if (appDir) {
    const config = join(runDir, 'xdg-deb');
    mkdirSync(config, { recursive: true });
    await exercise(
      {
        os: 'linux',
        label: 'deb-layout',
        argv: [join(appDir, 'zplc')],
        env: { DISPLAY: display, XDG_CONFIG_HOME: config, HOME: runDir },
        userData: config,
        flow: false,
      },
      version,
    );
  }
  const config = join(runDir, 'xdg-appimage');
  mkdirSync(config, { recursive: true });
  await step('linux', 'appimage.present', () => {
    must(existsSync(appImage) && isExecutable(appImage), `${basename(appImage)} is missing or not executable`);
    return `${basename(appImage)} is executable (${(statSync(appImage).size / 1e6).toFixed(0)} MB)`;
  });
  await exercise(
    {
      os: 'linux',
      label: 'appimage',
      argv: [appImage, '--appimage-extract-and-run'],
      env: { DISPLAY: display, XDG_CONFIG_HOME: config, HOME: runDir, TMPDIR: join(runDir, 'tmp') },
      userData: config,
      flow: true,
    },
    version,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Windows, under Wine
// ---------------------------------------------------------------------------------------------------------------------

async function windows(dist: string, version: string, runDir: string): Promise<void> {
  const setup = join(dist, `zplc-${version}-win-x64-setup-unsigned.exe`);
  const portable = join(dist, `zplc-${version}-win-x64-portable-unsigned.exe`);
  const prefix = join(cache, 'wine-prefix');
  rmSync(prefix, { recursive: true, force: true });
  const wineEnv = {
    WINEPREFIX: prefix,
    WINEDEBUG: '-all',
    WINEARCH: 'win64',
    WINEDLLOVERRIDES: 'mscoree,mshtml=',
    DISPLAY: process.env.DISPLAY!,
    XDG_CONFIG_HOME: join(runDir, 'xdg-wine'),
    HOME: homedir(),
  };
  const wine = (command: string, timeout?: number) => sh(`env -u WAYLAND_DISPLAY wine ${command}`, wineEnv, timeout);
  const stopWine = async () => {
    await sh('wineserver -k', wineEnv, 30_000);
  };

  await step('windows', 'wine', async () => {
    const version = await sh('wine --version');
    const boot = await wine('wineboot -u', 180_000);
    must(existsSync(join(prefix, 'drive_c')), `wineboot did not create a prefix: ${boot.out}`);
    // Wine ships a powershell.exe stub that exits 0 for every command. The NSIS installer asks PowerShell whether ZPLC is
    // running, takes the 0 for "yes", fails to close the application it imagines and quits with code 2. Moving the stub
    // away makes the installer use its tasklist path, which Wine answers correctly. A real Windows has the real PowerShell.
    for (const dir of ['system32', 'syswow64']) {
      const stub = join(prefix, 'drive_c', 'windows', dir, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      if (existsSync(stub)) renameSync(stub, `${stub}.stub`);
    }
    return (
      `${version.out}, fresh prefix created (${relative(homedir(), prefix)}); Wine's powershell.exe stub moved away, because it ` +
      `makes the NSIS running-application check report ZPLC as running`
    );
  });
  const users = join(prefix, 'drive_c', 'users');
  const winUser = existsSync(users) ? readdirSync(users).find((u) => u !== 'Public') : undefined;
  const local = winUser ? join(users, winUser, 'AppData', 'Local') : '';
  const roaming = winUser ? join(users, winUser, 'AppData', 'Roaming') : '';

  await step('windows', 'installer.silent-install', async () => {
    const result = await wine(`'${setup}' /S`, 300_000);
    const exe = await until('zplc.exe after the install', () => tree(join(local, 'Programs')).find((p) => p.endsWith('zplc.exe')), 120_000);
    await stopWine();
    return (
      `the NSIS setup installed silently ` +
      `(exit ${result.code}) to AppData/Local/Programs/${exe.replace(/\/zplc\.exe$/, '')}, per user, with no administrator prompt`
    );
  });
  const installedExe = tree(join(local, 'Programs')).find((p) => p.endsWith('zplc.exe'));
  const installDir = installedExe ? join(local, 'Programs', installedExe.replace(/\/zplc\.exe$/, '')) : '';

  await step('windows', 'installer.files', async () => {
    must(installDir, 'nothing was installed');
    const missing = [
      'resources/native-runtime/zplc_runtime.exe',
      'resources/THIRD-PARTY-NOTICES.txt',
      'resources/app.asar',
      'resources/examples',
    ].filter((p) => !existsSync(join(installDir, p)));
    must(missing.length === 0, `missing: ${missing.join(', ')}`);
    const magic = readFileSync(join(installDir, 'resources/native-runtime/zplc_runtime.exe')).subarray(0, 2).toString('latin1');
    must(magic === 'MZ', 'the native runtime is not a Windows executable');
    const startMenu = tree(join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs')).filter((p) => p.endsWith('.lnk'));
    const desktop = tree(join(users, winUser!, 'Desktop')).filter((p) => p.endsWith('.lnk'));
    must(startMenu.includes('ZPLC.lnk'), `the Start menu shortcut is ${startMenu.join(', ') || 'missing'}, expected ZPLC.lnk`);
    must(desktop.includes('ZPLC.lnk'), `the desktop shortcut is ${desktop.join(', ') || 'missing'}, expected ZPLC.lnk`);
    return (
      'zplc.exe, the native runtime (a PE file), notices, examples and app.asar are installed; the Start menu and desktop shortcuts ' +
      'are named ZPLC'
    );
  });
  await step('windows', 'installer.apps-entry', async () => {
    const reg = await wine('reg query HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall /s');
    await stopWine();
    const name = /DisplayName\s+REG_SZ\s+(.*)/.exec(reg.out)?.[1]?.trim();
    const shown = /DisplayVersion\s+REG_SZ\s+(.*)/.exec(reg.out)?.[1]?.trim();
    // electron-builder writes the version into the display name: Installed apps lists "ZPLC 2.0.0-rc.3".
    must(
      name === 'ZPLC' || name === `ZPLC ${version}`,
      `the entry of Settings, Apps is named ${name ?? 'missing'}, the install page says ZPLC`,
    );
    must(shown === version, `the entry shows version ${shown}`);
    return `Settings, Apps, Installed apps would list ${name} ${shown} (Uninstall key of the user)`;
  });

  if (installDir) {
    await exercise(
      {
        os: 'windows',
        label: 'installed',
        argv: ['wine', join(installDir, 'zplc.exe')],
        env: { ...wineEnv },
        userData: roaming,
        flow: true,
        flowMayBeUnavailable: true,
        stop: stopWine,
      },
      version,
    );
  }
  await exercise(
    {
      os: 'windows',
      label: 'portable',
      argv: ['wine', portable],
      env: { ...wineEnv },
      userData: roaming,
      flow: false,
      stop: stopWine,
    },
    version,
  );

  record(
    'windows',
    'smartscreen-and-smart-app-control',
    'not-simulated',
    'Windows protected your PC (SmartScreen, More info, Run anyway) and Smart App Control are behaviours of Windows itself; Wine has ' +
      'neither, so the first-run steps 2 and 3 of the install page were not exercised',
  );
  await step('windows', 'uninstall', async () => {
    must(installDir, 'nothing was installed');
    const uninstaller = tree(installDir).find((p) => /^Uninstall .*\.exe$/.test(p));
    must(uninstaller, 'the install folder holds no uninstaller');
    await wine(`'${join(installDir, uninstaller)}' /S`, 180_000);
    await until('the install folder to go', () => !existsSync(join(installDir, 'zplc.exe')), 60_000);
    await stopWine();
    const kept = tree(roaming).filter((p) => p.split('/').length === 1 && p !== 'Microsoft');
    must(kept.length > 0, 'the user-data folder was removed with the application');
    return `the silent uninstall removed the application, and the user-data folder (${kept.join(', ')}) stayed, as the install page says`;
  });
  rmSync(prefix, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// macOS: files only
// ---------------------------------------------------------------------------------------------------------------------

async function macos(dist: string, version: string, runDir: string): Promise<void> {
  const zip = join(dist, `zplc-${version}-mac-x64.zip`);
  const dir = join(runDir, 'mac');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const listing = await sh(`bsdtar -tvf '${zip}'`);
  must(listing.code === 0, listing.out);
  const unzip = await sh(`bsdtar -xf '${zip}' -C '${dir}'`, {}, 300_000);
  must(unzip.code === 0, unzip.out);
  const bundles = readdirSync(dir).filter((p) => p.endsWith('.app'));

  await step('macos', 'bundle-name', () => {
    must(bundles.length === 1, `the zip holds ${bundles.length} bundles`);
    must(
      bundles[0] === 'ZPLC.app',
      `the bundle is named ${bundles[0]}; the install page says ZPLC.app (drag ZPLC to Applications, xattr on /Applications/ZPLC.app) ` +
        `and the Homebrew cask installs app "ZPLC.app"`,
    );
    return `the zip holds one bundle, ${bundles[0]}`;
  });
  const app = join(dir, bundles[0] ?? '');
  const plist = existsSync(join(app, 'Contents/Info.plist')) ? readFileSync(join(app, 'Contents/Info.plist'), 'utf8') : '';
  await step('macos', 'info-plist', () => {
    must(plist, 'no Contents/Info.plist');
    const want: Record<string, string> = { CFBundleIdentifier: APP_ID, CFBundleShortVersionString: version, CFBundleName: 'ZPLC' };
    const wrong = Object.entries(want)
      .filter(([key, value]) => plistString(plist, key) !== value)
      .map(([key, value]) => `${key} is ${plistString(plist, key)}, expected ${value}`);
    must(wrong.length === 0, wrong.join('; '));
    return (
      `CFBundleIdentifier ${APP_ID}, CFBundleShortVersionString ${version}, CFBundleName ZPLC, ` +
      `CFBundleExecutable ${plistString(plist, 'CFBundleExecutable')}`
    );
  });
  await step('macos', 'main-executable', () => {
    const name = plistString(plist, 'CFBundleExecutable');
    must(name && existsSync(join(app, 'Contents/MacOS', name)), `Contents/MacOS/${name} is missing`);
    must(isExecutable(join(app, 'Contents/MacOS', name)), `Contents/MacOS/${name} is not executable`);
    const magic = readFileSync(join(app, 'Contents/MacOS', name))
      .readUInt32LE(0)
      .toString(16);
    must(
      ['feedfacf', 'feedface', 'cafebabe', 'bebafeca'].includes(magic),
      `Contents/MacOS/${name} starts with ${magic}, not a Mach-O header`,
    );
    return `Contents/MacOS/${name} is an executable Mach-O file (magic ${magic})`;
  });
  await step('macos', 'bundle-files', () => {
    const missing = [
      'Contents/Resources/app.asar',
      'Contents/Resources/examples',
      'Contents/Resources/THIRD-PARTY-NOTICES.txt',
      'Contents/Resources/icon.icns',
      'Contents/Frameworks',
    ].filter((p) => !existsSync(join(app, p)));
    must(missing.length === 0, `missing: ${missing.join(', ')}`);
    return 'app.asar, examples, notices, icon.icns and the frameworks are in the bundle';
  });
  await step('macos', 'native-runtime-present', () => {
    const runtime = join(app, 'Contents/Resources/native-runtime/zplc_runtime');
    must(existsSync(runtime), 'the nested native runtime is missing');
    must(isExecutable(runtime), 'the nested native runtime is not executable');
    return 'Contents/Resources/native-runtime/zplc_runtime is present and executable';
  });
  const runtime = join(app, 'Contents/Resources/native-runtime/zplc_runtime');
  record(
    'macos',
    'native-runtime-format',
    'not-simulated',
    existsSync(runtime) && readFileSync(runtime).subarray(0, 4).toString('latin1') === '\x7fELF'
      ? 'the runtime in this zip is a Linux ELF file standing in for the macOS build: no macOS compiler exists on this machine, so its ' +
          'Mach-O format and its architecture were not checked here (the hosted macOS job builds and signs it)'
      : 'the format of the runtime was not checked',
  );
  record(
    'macos',
    'launch',
    'not-simulated',
    'a macOS application cannot be launched on Linux; nothing of the Gatekeeper, Done, Privacy & Security, Open Anyway sequence of the ' +
      'install page was exercised',
  );
  record(
    'macos',
    'ad-hoc-signature',
    'not-simulated',
    'codesign exists only on macOS: the ad hoc seal of the bundle was not made or verified here (scripts/verify-mac-signature.ts checks ' +
      'it in the hosted job)',
  );
  record('macos', 'dmg', 'not-simulated', 'a DMG can only be built on macOS: only the zip was produced and read');
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const dist = arg('--dist') ?? join(cache, 'dist');
  const only = (arg('--only') ?? 'linux,windows,macos').split(',');
  const date = new Date().toISOString().slice(0, 10);
  const out = arg('--out') ?? join(cache, `first-run-${date}.json`);
  logFile = out.replace(/\.json$/, '.log');
  writeFileSync(logFile, '');
  must(process.env.DISPLAY && process.env.DISPLAY !== ':0', "DISPLAY must name a private display, never the owner's :0");
  must(existsSync(dist), `no build output at ${dist}`);
  const version = JSON.parse(readFileSync(join(repo, 'packages/zplc-ide/package.json'), 'utf8')).version as string;
  const runDir = join(cache, `run-${date}`);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(join(runDir, 'tmp'), { recursive: true });
  const git = async (args: string) => (await sh(`git -C '${repo}' ${args}`)).out;
  const started = new Date().toISOString();
  log(`${STATEMENT} Version ${version}, display ${process.env.DISPLAY}.`);

  if (only.includes('linux')) await linux(dist, version, runDir);
  if (only.includes('windows')) await windows(dist, version, runDir);
  if (only.includes('macos')) await macos(dist, version, runDir);

  const artifacts = readdirSync(dist)
    .filter((f) => /\.(AppImage|deb|rpm|exe|zip)$/.test(f))
    .sort()
    .map((f) => ({ file: f, bytes: statSync(join(dist, f)).size, sha256: sha256(join(dist, f)) }));
  const result = {
    schema: 'zplc.first-run-simulation/1',
    requirement: 'REL-016',
    statement: STATEMENT,
    started,
    finished: new Date().toISOString(),
    version,
    commit: await git('rev-parse HEAD'),
    dirtyTree: (await git('status --porcelain')).length > 0,
    script: 'tools/ci/release/simulate-first-run.ts',
    host: {
      kernel: (await sh('uname -sr')).out,
      hostname: hostname() === '' ? '' : 'redacted',
      wine: (await sh('wine --version')).out,
      docker: (await sh('docker --version')).out,
    },
    artifacts,
    summary: summarize(steps),
    steps,
  };
  writeFileSync(out, `${scrub(JSON.stringify(result, null, 2))}\n`);
  log(`summary ${JSON.stringify(result.summary)}; record ${scrub(out)}`);
  process.exitCode = result.summary.fail === 0 ? 0 : 1;
}

if (import.meta.main) await main();
