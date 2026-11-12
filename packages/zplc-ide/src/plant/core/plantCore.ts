import type {
  BodyPose,
  FactValue,
  PartView,
  PlantCore,
  PlantSceneFile,
  PlantSignalDef,
  PlantSnapshot,
  PlantState,
  Vec3,
} from '../contracts';
import { catalogue, registerParts } from './catalogue';
import { buildFacts, createContactTracker } from './facts';
import { loadJolt } from './jolt';
import { conveyorParts } from './parts/conveyors';
import { flowParts } from './parts/flow';
import { itemParts, boxSize, PALLET_SIZE, removeTrackedItem, spawnItem, trackedItems, type RuntimePartDefinition } from './parts/items';
import { isOperable, panelParts } from './parts/panel';
import { sensorParts } from './parts/sensors';
import { sourceParts } from './parts/sources';
import { sceneSignals, validateScene } from './scene';
import { createTrace } from './trace';
import { createWorld, PLANT_STEP_MS, type PhysicsWorld } from './world';

const SHIPPED: readonly RuntimePartDefinition[] = [
  ...itemParts,
  ...conveyorParts,
  ...sourceParts,
  ...sensorParts,
  ...flowParts,
  ...panelParts,
];
const RUNTIMES = new Map(SHIPPED.map((d) => [d.id, d]));
registerParts(SHIPPED.filter((d) => !catalogue.get(d.id)));

const DROP_Y = -0.5; // PLT-010: an item whose centre falls below the floor plane minus 0.5 m is dropped
const MAX_ITEMS = 1000;
const ADDED_PALLET_KG = 25;
const ADDED_BOX_KG = 2;

/** Everything that happens to a core after `reset`, in order. Restore replays it: the core is deterministic (PLT-006). */
type Op =
  | readonly ['a', number, number] // advance(ms) repeated n times
  | readonly ['c', Readonly<Record<string, boolean | number>>]
  | readonly ['o', string, boolean | number]
  | readonly ['f', string, string]
  | readonly ['+', string, Vec3]
  | readonly ['-', string];

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function createPlantCore(scene: PlantSceneFile, options: { seed?: number } = {}): Promise<PlantCore> {
  const problems = validateScene(scene, catalogue);
  if (problems.length > 0) throw new Error(`plant: invalid scene: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`);
  const Jolt = await loadJolt();
  const seed = options.seed ?? 1;
  const sceneJson = JSON.stringify(scene);
  const signals: readonly PlantSignalDef[] = sceneSignals(scene, catalogue);
  const commandNames = signals.filter((s) => s.direction === 'command').map((s) => s.name);
  const known = signals.map((s) => s.name).join(', ');

  function build() {
    const world: PhysicsWorld = createWorld(Jolt, PLANT_STEP_MS);
    // The floor: its top is the plane y = 0.
    world.addBody({
      id: 'floor',
      kind: 'box',
      half: [50, 0.5, 50],
      position: [0, -0.5, 0],
      rotationYDeg: 0,
      massKg: 0,
      friction: 0.6,
      motion: 'static',
      layer: 'static',
    });
    const rng = seeded(seed);
    const runtimes = scene.parts.map((part) => {
      const rt = RUNTIMES.get(part.part)!.runtime(part, rng);
      rt.build(world, part);
      return { part, rt };
    });
    return {
      world,
      runtimes,
      latched: {} as Record<string, boolean | number>,
      trace: createTrace(),
      contacts: createContactTracker(),
      dropped: 0,
      collided: 0,
      scans: 0,
      added: 0,
    };
  }
  let m = build();
  // ponytail: the journal grows with run time (one entry per command change); snapshot-based capture if a caller captures hourly runs
  let journal: Op[] = [];
  let disposed = false;

  const find = (name: string) => {
    const found = m.runtimes.find((r) => r.part.name === name);
    if (!found) throw new Error(`plant: unknown part "${name}"; the scene has: ${m.runtimes.map((r) => r.part.name).join(', ')}`);
    return found;
  };

  function postStep(): void {
    const items = trackedItems(m.world);
    const bodies = m.world.bodies();
    for (const b of bodies) {
      if (items.has(b.id) && b.p[1] < DROP_Y) {
        removeTrackedItem(m.world, b.id);
        m.dropped += 1;
      }
    }
    m.collided += m.contacts.update(
      bodies.filter((b) => items.has(b.id)),
      items,
    );
  }

  function advance(ms: number): void {
    if (!Number.isInteger(ms / PLANT_STEP_MS) || ms <= 0)
      throw new RangeError(`plant: advance needs a positive multiple of ${PLANT_STEP_MS} ms, got ${ms}`);
    for (let i = 0; i < ms / PLANT_STEP_MS; i += 1) {
      for (const { rt } of m.runtimes) rt.beforeStep(m.latched);
      m.world.step(PLANT_STEP_MS);
      for (const { rt } of m.runtimes) rt.afterStep();
      postStep();
    }
    m.scans += 1;
    const sensed = Object.values(sense());
    m.trace.record(
      m.world.bodies(),
      commandNames.map((n) => Number(m.latched[n] ?? 0)),
      sensed.map(Number),
    );
  }

  function sense(): Record<string, boolean | number> {
    return Object.assign({}, ...m.runtimes.map((r) => r.rt.sense()));
  }

  /** Runs one op against the machine; it throws before changing anything when the op is invalid. */
  function exec(op: Op): void {
    switch (op[0]) {
      case 'a':
        for (let i = 0; i < op[2]; i += 1) advance(op[1]);
        return;
      case 'c': {
        const unknown = Object.keys(op[1]).find((n) => !commandNames.includes(n));
        if (unknown !== undefined) throw new Error(`plant: unknown signal "${unknown}"; the scene has: ${known}`);
        Object.assign(m.latched, op[1]);
        return;
      }
      case 'o':
        if (!m.runtimes.some(({ rt }) => isOperable(rt) && rt.operate(op[1], op[2])))
          throw new Error(`plant: unknown signal "${op[1]}"; the scene has: ${known}`);
        return;
      case 'f': {
        const { part, rt } = find(op[1]);
        const actions = RUNTIMES.get(part.part)!.actions;
        if (!actions.includes(op[2]))
          throw new Error(`plant: part "${op[1]}" has no action "${op[2]}"; it has: ${actions.join(', ') || 'none'}`);
        rt.act(op[2]);
        return;
      }
      case '+': {
        if (trackedItems(m.world).size >= MAX_ITEMS) throw new RangeError(`plant: the scene already holds ${MAX_ITEMS} items`);
        const pallet = op[1] === 'pallet';
        if (!pallet && op[1] !== 'box') throw new Error(`plant: unknown item kind "${op[1]}"; use box or pallet`);
        m.added += 1;
        spawnItem(
          m.world,
          `added-${m.added}`,
          pallet ? 'pallet' : 'item',
          pallet ? PALLET_SIZE : boxSize(0.3),
          pallet ? ADDED_PALLET_KG : ADDED_BOX_KG,
          op[2],
          0,
        );
        return;
      }
      case '-':
        if (!trackedItems(m.world).has(op[1])) throw new Error(`plant: no item "${op[1]}"`);
        removeTrackedItem(m.world, op[1]);
    }
  }
  function run(op: Op): void {
    exec(op);
    const last = journal[journal.length - 1];
    if (op[0] === 'a' && last?.[0] === 'a' && last[1] === op[1]) journal[journal.length - 1] = ['a', op[1], last[2] + op[2]];
    else journal.push(op);
  }

  function facts(): Record<string, FactValue> {
    const items = trackedItems(m.world);
    return buildFacts({
      partFacts: m.runtimes.map((r) => r.rt.facts()),
      dropped: m.dropped,
      collided: m.collided,
      items,
      poses: new Map(
        m.world
          .bodies()
          .filter((b) => items.has(b.id))
          .map((b) => [b.id, b.p]),
      ),
    });
  }

  function freshMachine(): void {
    m.world.dispose();
    m = build();
    journal = [];
  }

  const core: PlantCore = {
    stepMs: 5,
    signals,
    apply(commands) {
      const changed = Object.entries(commands).some(([k, v]) => m.latched[k] !== v);
      if (changed) run(['c', { ...commands }]);
      else exec(['c', commands]); // still validates the names
    },
    advance: (ms) => run(['a', ms, 1]),
    sense,
    facts,
    operate: (signal, value) => run(['o', signal, value]),
    act: (part, action) => run(['f', part, action]),
    addItem(kind, at) {
      run(['+', kind, at]);
      return `added-${m.added}`;
    },
    removeItem: (id) => run(['-', id]),
    snapshot(): PlantSnapshot {
      const items = trackedItems(m.world);
      const poses: BodyPose[] = m.world.bodies().flatMap((b) => {
        const info = items.get(b.id);
        return info
          ? [{ id: b.id, part: info.kind === 'pallet' ? 'pallet' : 'box', kind: info.kind, size: info.size, p: b.p, q: b.q }]
          : [];
      });
      const parts: PartView[] = m.runtimes.flatMap((r) => r.rt.views());
      return { timeMs: m.world.timeMs, scans: m.scans, parts, items: poses, facts: facts() };
    },
    capture(): PlantState {
      const head = new TextEncoder().encode(JSON.stringify({ scene: sceneJson, seed, timeMs: m.world.timeMs, journal }));
      const world = m.world.capture();
      const bytes = new Uint8Array(4 + head.length + world.length);
      new DataView(bytes.buffer).setUint32(0, head.length, true);
      bytes.set(head, 4);
      bytes.set(world, 4 + head.length);
      return { format: 1, bytes };
    },
    restore(state) {
      const view = new DataView(state.bytes.buffer, state.bytes.byteOffset, state.bytes.byteLength);
      const len = view.getUint32(0, true);
      const head = JSON.parse(new TextDecoder().decode(state.bytes.subarray(4, 4 + len))) as {
        scene: string;
        seed: number;
        timeMs: number;
        journal: Op[];
      };
      if (state.format !== 1 || head.scene !== sceneJson || head.seed !== seed)
        throw new Error('plant: this capture belongs to a different scene');
      // The state is rebuilt by replaying the capture's own history on a fresh world: bodies spawned and removed since
      // the start, jams, emitter counters and the blade all come back in order. The exact Jolt state then proves it.
      freshMachine();
      for (const op of head.journal) run(op);
      const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
      if (m.world.timeMs !== head.timeMs || !same(m.world.capture(), state.bytes.subarray(4 + len)))
        throw new Error('plant: the capture could not be restored (replay diverged)');
    },
    reset: freshMachine,
    traceHash: () => Promise.resolve(m.trace.hash()),
    dispose() {
      if (disposed) return;
      disposed = true;
      m.world.dispose();
    },
  };
  return core;
}
