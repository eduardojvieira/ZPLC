// Headless step cost of the stress scene (input to check 3). Exit 1 when p95 at the 5 ms plant step is above 5 ms.
import { execSync } from 'node:child_process';
import { cpus, loadavg, totalmem } from 'node:os';
import { writeFileSync } from 'node:fs';
import { loadJolt } from '../../src/plant-gate/jolt';
import { driveStress, stress } from '../../src/plant-gate/scenes';
import { createWorld } from '../../src/plant-gate/world';

const SCANS = 3000;
const gateDir = new URL('../../../../specs/012-zplc-2-1-plant-simulation/gate/', import.meta.url);

async function run(plantStepMs: number) {
  const world = createWorld(await loadJolt(), stress(), plantStepMs);
  const samples: number[] = [];
  const t0 = performance.now();
  for (let scan = 0; scan < SCANS; scan += 1) {
    driveStress(world, scan);
    const s = performance.now();
    world.step(10);
    samples.push(performance.now() - s);
  }
  const wallMs = performance.now() - t0;
  world.dispose();
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!;
  return { plantStepMs, stepMsP50: at(0.5), stepMsP95: at(0.95), stepMsMax: samples[samples.length - 1]!, realTimeFactor: 30000 / wallMs };
}

const runs = [await run(5), await run(10)];
const record = {
  schema: 'zplc.plant-gate/1',
  commit: execSync('git rev-parse HEAD').toString().trim(),
  host: { platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model ?? 'unknown', memoryGb: Math.round(totalmem() / 2 ** 30) },
  loadAverage: loadavg(),
  scene: 'stress', scans: SCANS, scanMs: 10,
  runs,
};
writeFileSync(new URL(`capacity-headless-${process.platform}-${process.arch}.json`, gateDir), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
process.exit(runs[0]!.stepMsP95 > 5 ? 1 : 0);
