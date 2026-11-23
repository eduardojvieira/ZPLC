/**
 * Journey of spec 012 VIS-015, VIS-016, VIS-018 and the picking half of VIS-003 on the rendered frame, in the software-GL window of
 * the framing journey (`withGlWindow`): the product's renderer and plant core draw belt-to-sensor and colour-separation, and the
 * page checks of scripts/plant/checks.ts read the frames back.
 *
 *   (a) VIS-016: each state pair of belt-to-sensor (diffuse sensor clear / detecting, push button released / pressed, belt stopped /
 *       running) changes at least 1 % of the pixels of the part's projected box, in light, dark and high contrast, at the low and
 *       medium levels, and with reduced motion; a running belt moves between frames, a stopped one and a reduced-motion one do not;
 *   (b) VIS-003: a pointer over each part of belt-to-sensor is picked as that part;
 *   (c) VIS-015: the renderer state at each level (tone mapping, sRGB output, shadows, maps, environment), high contrast flat;
 *   (d) VIS-018: on colour-separation, the top face of each red and blue item lies within 25 degrees of its named hue in light and
 *       dark, and a box with no colour falls outside both.
 *
 * Evidence level: development host, Linux, headless software GL, renderer and core in the page of the application window, outside
 * the plant panel (the hover and focus label of the panel is covered by the DOM tests of PlantCanvas and PlantPanel). No frame rate.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import type { Journey } from '../journeys';
import type { lookProblems as LookProblems } from '../plant/checks';
import { withGlWindow } from './plantFraming';

type Records = Parameters<typeof LookProblems>[0];

export const journeysPlantLook: Journey[] = [
  {
    name: 'VIS-016 the state of belt-to-sensor parts is drawn, the look follows the quality level and item colours match (real window)',
    example: 'none',
    proves: [],
    partly: ['VIS-003', 'VIS-015', 'VIS-016', 'VIS-018'],
    run: async (_app, { root, runtime }) => {
      await withGlWindow(root, runtime, async (page) => {
        await page.evaluate(
          `(() => { window.__look = undefined; import('/scripts/plant/checks.ts').then((m) => m.runAll().then((r) => ` +
            `{ window.__look = { ok: r, problems: m.lookProblems(r) }; })).catch((e) => { window.__look = { err: String((e && e.stack) ` +
            `|| e) }; }); ` +
            `return true; })()`,
        );
        let result: { ok?: Records; problems?: string[]; err?: string } | undefined;
        for (const deadline = Date.now() + 900_000; !result?.ok && Date.now() < deadline; await Bun.sleep(500)) {
          result = (await page.evaluate('window.__look')) as typeof result;
          if (result?.err) throw new Error(result.err);
        }
        assert(result?.ok && result.problems, 'The look checks did not finish in 15 minutes.');
        const records = result.ok;
        writeFileSync(join(root, 'plant-look.json'), JSON.stringify(records, null, 2));
        for (const p of records.pairs)
          console.log(
            `  ${p.pair} (${p.mode}, ${p.quality}${p.reducedMotion ? ', reduced motion' : ''}): ${(p.fraction * 100).toFixed(2)} % of ` +
              `${p.rect ? `${p.rect.w}x${p.rect.h}` : 'no box'}`,
          );
        for (const m of records.motion)
          console.log(
            `  belt motion${
              m.reducedMotion ? ' (reduced motion)' : ''
            }: running ${(m.running * 100).toFixed(2)} %, stopped ${(m.stopped * 100).toFixed(2)} %`,
          );
        console.log(`  picks: ${records.picks.map((p) => `${p.part} -> ${p.picked}`).join(', ')}`);
        for (const l of records.looks)
          console.log(
            `  ${l.quality}/${l.mode}: tone ${l.toneMapping}, ${l.outputColorSpace}, shadows ${
              l.shadows.enabled ? `${l.shadows.type} r${l.shadows.radius} ` + `${l.shadows.mapSize}px` : 'off'
            }, ` +
              `environment ${l.environment ? 'on' : 'off'}, textured ${
                l.materials
                  .filter((m) => m.maps.includes('map'))
                  .map((m) => m.name)
                  .join('/') || 'none'
              }`,
          );
        for (const h of records.hues)
          console.log(
            `  ${h.mode}/${h.quality} ${h.item} ${
              h.named ?? 'uncoloured'
            }: rgb ${h.rgb?.join(',')} hue ${h.hue?.toFixed(0)} L ${h.lightness?.toFixed(2)}`,
          );
        console.log(`  ${result.problems.length} problems (records: ${join(root, 'plant-look.json')})`);
        assert(result.problems.length === 0, result.problems.join('\n'));
      });
    },
  },
];
