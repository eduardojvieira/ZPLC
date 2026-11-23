/**
 * Journey of spec 012 VIS-002 and VIS-003 on the rendered frame: in a real Electron window, with the real three.js on software GL
 * (SwiftShader, `--headless` plus `--use-angle=swiftshader-webgl`; the development host of the other journeys runs with
 * `--disable-gpu` and has no WebGL 2, so this journey starts a second window of the same application with the flags the bench uses),
 * the product's own renderer draws each of the 21 shipped scenes from the snapshot its real plant core publishes, is resized to
 * 480x640, 720x800, 1280x720 and 1920x1080, and then, from the live camera and the drawn meshes:
 *
 *   (a) every corner of every drawn box (part views, item instances, crate walls) projects inside the frame;
 *   (b) no two drawn boxes have the same world corners (the same pose and size), so nothing is drawn twice.
 *
 * Evidence level: development host, Linux, headless software GL, Studio's own renderer module and plant core loaded in the page
 * of the application window; it does not go through the plant panel (that wiring is covered by the DOM tests of PlantPanel), it
 * gives no frame-rate or GPU evidence.
 */
import { join } from 'node:path';
import { trustedDevelopmentRendererUrl } from '../../electron/security';
import { assert, Cdp, drain, freePort, HOST, packageRoot, smokeVitePort, stop, waitFor, type OwnedProcess } from '../run-desktop-smoke';
import type { Journey } from '../journeys';

export const FRAMING_SIZES: ReadonlyArray<readonly [number, number]> = [
  [480, 640],
  [720, 800],
  [1280, 720],
  [1920, 1080],
];

export interface SceneFraming {
  id: string;
  parts: number;
  items: number;
  boxes: number;
  /** Per size, the boxes with a corner outside the frame (label and size). */
  outside: Array<{ size: string; boxes: string[] }>;
  /** Boxes that share every world corner with another one. */
  coincident: string[][];
  /** A size whose frame was not drawn at that aspect (the camera still had another aspect), which would void the check. */
  notDrawn: string[];
}

/** The page side: it runs in the window, imports the product's modules from the development server and returns one record per scene. */
const PAGE =
  `
(async () => {
  const sizes = ${JSON.stringify(FRAMING_SIZES)};
  const [{ createRenderer }, { createPlantCore }, { SCENE_INDEX }, THREE] = await Promise.all([
    import('/src/plant/view/renderer.ts'),
    import('/src/plant/core/plantCore.ts'),
    import('/src/generated/sceneIndex.ts'),
    import('/node_modules/three/build/three.module.js'),
  ]);
  const frames = (n) => new Promise((resolve) => { let k = 0; const f = () => (++k >= n ? resolve() : requestAnimationFrame(f)); ` +
  `requestAnimationFrame(f); });
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const out = [];
  for (const entry of SCENE_INDEX) {
    const scene = JSON.parse((await import('/plant-scenes/' + entry.id + '/scene.json?raw')).default);
    const core = await createPlantCore(scene);
    const snapshot = core.snapshot();
    const spy = {};
    const T = {
      ...THREE,
      PerspectiveCamera: class extends THREE.PerspectiveCamera { constructor(...a) { super(...a); spy.camera = this; } },
      Scene: class extends THREE.Scene { constructor() { super(); spy.world = this; } },
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;z-index:99999';
    document.body.appendChild(canvas);
    const renderer = createRenderer(canvas, scene, { quality: 'low' }, T);
    if ('unavailable' in renderer) throw new Error(entry.id + ': ' + renderer.unavailable);
    renderer.setSnapshot(snapshot);
    const record = { id: entry.id, parts: snapshot.parts.length, items: snapshot.items.length, boxes: 0, outside: [], coincident: [], ` +
  `notDrawn: [] };
    for (const [w, h] of sizes) {
      renderer.resize(w, h);
      await frames(3);
      const cam = spy.camera;
      const label = w + 'x' + h;
      if (canvas.width !== w || canvas.height !== h || Math.abs(cam.aspect - w / h) > 1e-6) { record.notDrawn.push(label); continue; }
      spy.world.updateMatrixWorld(true);
      cam.updateMatrixWorld(true);
      const view = cam.matrixWorldInverse;
      const boxes = [];
      const add = (name, bb, matrix) => {
        const corners = [];
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z])
          corners.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
        boxes.push({ name, corners });
      };
      let meshIndex = 0;
      spy.world.traverse((o) => {
        if (!o.isMesh || !o.visible || (o.material && o.material.wireframe) || o.geometry.type === 'PlaneGeometry') return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        if (o.isInstancedMesh) {
          const m = new THREE.Matrix4();
          for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); add('instanced' + meshIndex + '#' + i, bb, new ` +
  `THREE.Matrix4().multiplyMatrices(o.matrixWorld, m)); }
          meshIndex++;
        } else add((o.userData && o.userData.part ? o.userData.part : 'mesh') + '@' + o.position.toArray().map(r3).join(','), bb, ` +
  `o.matrixWorld);
      });
      const bad = [];
      for (const box of boxes)
        if (box.corners.some((c) => { const v = c.clone().applyMatrix4(view); const p = v.clone().applyMatrix4(cam.projectionMatrix); ` +
  `return !(v.z < -cam.near) || Math.abs(p.x) > 1 || Math.abs(p.y) > 1; }))
          bad.push(box.name);
      record.boxes = boxes.length;
      if (bad.length) record.outside.push({ size: label, boxes: bad });
      if (w === 1280) {
        const groups = new Map();
        for (const box of boxes) {
          const key = box.corners.map((c) => c.toArray().map(r3).join(',')).sort().join(';');
          groups.set(key, [...(groups.get(key) ?? []), box.name]);
        }
        record.coincident = [...groups.values()].filter((g) => g.length > 1);
      }
    }
    renderer.dispose(); canvas.remove(); core.dispose();
    out.push(record);
  }
  return out;
})()`;

/** A second window of the application with software GL, on the development server the journeys already run. */
export async function withGlWindow<T>(root: string, runtime: string, body: (page: Cdp) => Promise<T>): Promise<T> {
  const port = smokeVitePort();
  const cdpPort = await freePort();
  const electronPath = join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  const output: string[] = [];
  const electron: OwnedProcess = Bun.spawn(
    [
      electronPath,
      '--headless',
      '--use-angle=swiftshader-webgl',
      '--use-gl=angle',
      '--enable-unsafe-swiftshader',
      '--lang=en-US',
      `--zplc-smoke-port=${port}`,
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${join(root, 'gl-profile')}`,
      '.',
    ],
    {
      cwd: packageRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODE_ENV: 'development', ZPLC_NATIVE_SIM_BIN: runtime, ZPLC_PERSIST_ROOT: join(root, 'gl-persist') },
    },
  );
  drain(electron, output, 'electron');
  let page: Cdp | undefined;
  try {
    const target = await waitFor('the software-GL window', async () => {
      const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`)
        .then((response) => response.json())
        .catch(() => [] as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>);
      return (targets as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>).find(
        (item) => item.type === 'page' && item.url === trustedDevelopmentRendererUrl(port) && item.webSocketDebuggerUrl,
      )?.webSocketDebuggerUrl;
    });
    page = await Cdp.connect(target);
    for (const method of ['Runtime.enable', 'Page.enable', 'Page.bringToFront']) await page.command(method);
    await page.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    // A cold development server transforms the application on this first load: wait longer than a warm window needs.
    for (const deadline = Date.now() + 300_000; Date.now() < deadline; await Bun.sleep(250))
      if ((await page.evaluate(`document.querySelector('h1')?.textContent`).catch(() => undefined)) === 'ZPLC') break;
    assert(
      (await page.evaluate(`document.querySelector('h1')?.textContent`)) === 'ZPLC',
      'The application page did not open in 5 minutes.',
    );
    return await body(page);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-2_000)}`);
  } finally {
    if (page) void page.command('Browser.close').catch(() => undefined);
    await Promise.race([electron.exited, Bun.sleep(3_000)]);
    page?.close();
    await stop(electron);
  }
}

/** The findings of one run as lines a person can read; empty when every scene is framed and drawn once. */
export function framingProblems(records: readonly SceneFraming[]): string[] {
  const problems: string[] = [];
  for (const r of records) {
    if (r.boxes === 0) problems.push(`${r.id}: nothing was drawn`);
    for (const size of r.notDrawn) problems.push(`${r.id} ${size}: the frame was not drawn at that size`);
    for (const o of r.outside)
      problems.push(`${r.id} ${o.size}: outside the frame: ${o.boxes.slice(0, 4).join(', ')}${o.boxes.length > 4 ? '...' : ''}`);
    for (const group of r.coincident) problems.push(`${r.id}: drawn twice: ${group.join(' + ')}`);
  }
  return problems;
}

export const journeysPlantFraming: Journey[] = [
  {
    name: 'VIS-002 the first view fits the 21 scenes at four panel sizes and no box is drawn twice (real window, software GL)',
    example: 'none',
    proves: [],
    partly: ['VIS-002', 'VIS-003'],
    run: async (_app, { root, runtime }) => {
      await withGlWindow(root, runtime, async (page) => {
        await page.evaluate(
          `(() => { window.__framing = undefined; ${PAGE}.then((v) => { window.__framing = { ok: v }; }, (e) => { window.__framing = { ` +
            `err: String((e && e.stack) || e) }; }); return true; })()`,
        );
        // The 21 scenes on software GL take minutes: a page task polled here, never one protocol command.
        let records: SceneFraming[] | undefined;
        for (const deadline = Date.now() + 900_000; !records && Date.now() < deadline; await Bun.sleep(500)) {
          const result = (await page.evaluate('window.__framing')) as { ok?: SceneFraming[]; err?: string } | undefined;
          if (result?.err) throw new Error(result.err);
          records = result?.ok;
        }
        assert(records, 'The framing check of the 21 scenes did not finish in 15 minutes.');
        assert(records.length === 21, `${records.length} scenes were checked instead of 21.`);
        const problems = framingProblems(records);
        console.log(
          `  ${records.length} scenes, ${records.reduce(
            (n, r) => n + r.boxes,
            0,
          )} boxes at 1920x1080, ${FRAMING_SIZES.length} sizes each: ${problems.length} problems`,
        );
        assert(problems.length === 0, problems.join('\n'));
      });
    },
  },
];
