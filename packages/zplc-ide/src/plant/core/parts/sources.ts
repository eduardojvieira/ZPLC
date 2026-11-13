import type { ConfigField, FactValue, PartView, ScenePart, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { ACCEPTS, matches, type Accepts } from '../classify';
import {
  BOX_HEIGHTS,
  BOX_MASSES,
  BASE_SIZE,
  CRATE_MASS_KG,
  CRATE_OUTER,
  crateShapes,
  boxSize,
  cfg,
  cfgNumber,
  itemProps,
  LID_SIZE,
  PALLET_SIZE,
  removeTrackedItem,
  spawnItem,
  trackedItems,
  WORKPIECE_MASS_KG,
  WORKPIECE_SIZE,
  yawQuat,
  type PartRuntime,
  type RuntimePartDefinition,
} from './items';

const STEP_MS = 5;
const JITTER_M = 0.05; // random mode: lateral offset of an emitted item, either side

const emitterConfig: Record<string, ConfigField> = {
  kind: { kind: 'enum', values: ['box', 'pallet', 'lid', 'base', 'workpiece', 'crate'], default: 'box' },
  vary: { kind: 'enum', values: ['none', 'colour', 'weight', 'code'], default: 'none' },
  codes: { kind: 'number', min: 1, max: 9, default: 3 },
  colour: { kind: 'enum', values: ['red', 'blue'], default: 'red' },
  material: { kind: 'enum', values: ['plastic', 'metal'], default: 'plastic' },
  code: { kind: 'number', min: 0, max: 9, default: 0 },
  height: { kind: 'enum', values: BOX_HEIGHTS, default: '0.3', unit: 'm' },
  mass: { kind: 'enum', values: BOX_MASSES, default: '2', unit: 'kg' },
  intervalMs: { kind: 'number', min: 0, max: 600000, default: 0, unit: 'ms' }, // 0: scripted, only the signal emits
  maxItems: { kind: 'number', min: 1, max: 1000, default: 10 },
};
const removerConfig: Record<string, ConfigField> = {
  width: { kind: 'number', min: 0.2, max: 2, default: 0.6, unit: 'm' },
  depth: { kind: 'number', min: 0.2, max: 2, default: 0.6, unit: 'm' },
  height: { kind: 'number', min: 0.2, max: 2, default: 0.6, unit: 'm' },
  accepts: { kind: 'enum', values: ACCEPTS, default: 'any' },
  acceptsCode: { kind: 'number', min: 0, max: 9, default: 0 },
};

const marker = (part: ScenePart, id: string, size: Vec3): PartView['pose'] => ({
  id: part.id,
  part: id,
  kind: 'box',
  size,
  p: part.position,
  q: yawQuat(part.rotationYDeg),
});

function emitterRuntime(part: ScenePart, rng: () => number): PartRuntime {
  const cfgs = emitterConfig;
  const interval = cfgNumber(part, cfgs, 'intervalMs');
  const max = cfgNumber(part, cfgs, 'maxItems');
  const kind = cfg(part, cfgs, 'kind');
  const pallet = kind === 'pallet';
  const vary = cfg(part, cfgs, 'vary');
  const codes = Math.round(cfgNumber(part, cfgs, 'codes'));
  let world: PhysicsWorld | undefined;
  let emitted = 0;
  let sinceMs = 0;
  let previous = false;
  const emit = () => {
    if (!world || emitted >= max) return;
    emitted += 1;
    const id = `${part.id}-${emitted}`;
    if (pallet) return spawnItem(world, id, 'pallet', PALLET_SIZE, 25, part.position, part.rotationYDeg);
    // The crate ignores vary, height and mass: a fixed open box (R5-C).
    if (kind === 'crate') {
      return spawnItem(world, id, 'item', CRATE_OUTER, CRATE_MASS_KG, part.position, part.rotationYDeg, 'crate', undefined, crateShapes());
    }
    if (kind === 'lid' || kind === 'base') {
      // Height is ignored for lids and bases; mass comes from the config.
      return spawnItem(
        world,
        id,
        'item',
        kind === 'lid' ? LID_SIZE : BASE_SIZE,
        cfgNumber(part, cfgs, 'mass'),
        part.position,
        part.rotationYDeg,
        kind,
      );
    }
    if (kind === 'workpiece') {
      const props = itemProps(part, cfgs, true);
      // R4-V1: one draw per emit, only when vary applies to this kind.
      if (vary === 'colour') props.colour = rng() < 0.5 ? 'red' : 'blue';
      else if (vary === 'code') props.code = 1 + Math.floor(rng() * codes);
      return spawnItem(world, id, 'item', WORKPIECE_SIZE, WORKPIECE_MASS_KG, part.position, part.rotationYDeg, undefined, props);
    }
    const random = interval > 0; // random mode draws height and lateral offset from the seeded generator
    const height = random ? Number(BOX_HEIGHTS[Math.floor(rng() * BOX_HEIGHTS.length)]) : cfgNumber(part, cfgs, 'height');
    const side = random ? (rng() * 2 - 1) * JITTER_M : 0;
    const at: Vec3 = [part.position[0], part.position[1], part.position[2] + side];
    const props = itemProps(part, cfgs, false);
    let mass = cfgNumber(part, cfgs, 'mass');
    if (vary === 'weight') mass = Number(BOX_MASSES[Math.floor(rng() * BOX_MASSES.length)]);
    else if (vary === 'code') props.code = 1 + Math.floor(rng() * codes);
    spawnItem(world, id, 'item', boxSize(height), mass, at, part.rotationYDeg, 'box', props);
  };
  return {
    build(w) {
      world = w;
    },
    beforeStep(commands) {
      const now = commands[`${part.name}.emit`] === true;
      if (now && !previous) emit();
      previous = now;
      if (interval > 0) {
        sinceMs += STEP_MS;
        if (sinceMs >= interval) {
          sinceMs = 0;
          emit();
        }
      }
    },
    afterStep() {},
    sense: () => ({}),
    facts: () => ({ [`emitted:${part.name}`]: emitted }),
    act(action) {
      throw new Error(`part "${part.name}" has no action "${action}"`);
    },
    views: () => [
      { id: part.id, part: 'emitter', name: part.name, pose: marker(part, 'emitter', [0.1, 0.1, 0.1]), state: { emitted }, signals: {} },
    ],
  };
}

function removerRuntime(part: ScenePart): PartRuntime {
  const size: Vec3 = [
    cfgNumber(part, removerConfig, 'width'),
    cfgNumber(part, removerConfig, 'height'),
    cfgNumber(part, removerConfig, 'depth'),
  ];
  let world: PhysicsWorld | undefined;
  const accepts = cfg(part, removerConfig, 'accepts') as Accepts;
  const acceptsCode = Math.round(cfgNumber(part, removerConfig, 'acceptsCode'));
  let delivered = 0;
  let sorted = 0;
  return {
    build(w) {
      world = w;
    },
    beforeStep() {},
    afterStep() {
      if (!world) return;
      const items = trackedItems(world);
      for (const b of world.bodies()) {
        if (!items.has(b.id)) continue;
        // The centre of the item is inside the volume (axis-aligned: ponytail, yaw of the remover is ignored).
        const inside = [0, 1, 2].every((k) => Math.abs(b.p[k]! - part.position[k]!) <= size[k]! / 2);
        if (!inside) continue;
        const info = items.get(b.id)!;
        if (matches(accepts, { ...info, pallet: info.kind === 'pallet' }, acceptsCode)) sorted += 1;
        removeTrackedItem(world, b.id);
        delivered += 1;
      }
    },
    sense: () => ({}),
    facts: (): Record<string, FactValue> =>
      accepts === 'any'
        ? { [`delivered:${part.name}`]: delivered }
        : { [`delivered:${part.name}`]: delivered, [`sorted:${part.name}`]: sorted, [`misrouted:${part.name}`]: delivered - sorted },
    act(action) {
      throw new Error(`part "${part.name}" has no action "${action}"`);
    },
    views: () => [
      { id: part.id, part: 'remover', name: part.name, pose: marker(part, 'remover', size), state: { delivered }, signals: {} },
    ],
  };
}

/** Emitter and remover: where items enter and leave a scene. */
export const sourceParts: readonly RuntimePartDefinition[] = [
  {
    id: 'emitter',
    family: 'sources',
    names: { en: 'Item emitter', es: 'Emisor de piezas' },
    config: emitterConfig,
    signals: (part) => [{ name: `${part.name}.emit`, direction: 'command', type: 'BOOL' }],
    actions: [],
    snapPoints: () => [{ name: 'out', position: [0, 0, 0], normalYDeg: 0, accepts: ['belt', 'roller', 'curved'] }],
    doc: {
      en:
        'Emits one item on each rising edge of its signal, and by itself every intervalMs when that is above zero (random mode, ' +
        'seeded). Kinds: box, pallet, lid, base, workpiece; a lid or base takes its mass from the mass setting and ignores height; a ' +
        'workpiece takes colour, material and code (0.5 kg). vary draws one seeded number per item: colour (workpiece), weight ' +
        '(box, 2 or 5 kg) or code (workpiece or box, 1 to codes); a vary that does not apply to the kind has no effect.',
      es:
        'Emite una pieza en cada flanco de subida de su señal, y por sí solo cada intervalMs cuando es mayor que cero (modo aleatorio, ' +
        'con semilla). Tipos: caja, tarima, tapa, base, pieza; una tapa o base toma su masa del ajuste de masa e ignora la altura; una ' +
        'pieza toma color, material y código (0,5 kg). vary sortea un número con semilla por pieza: color (pieza), peso (caja, 2 o 5 kg) ' +
        'o código (pieza o caja, de 1 a codes); un vary que no aplica al tipo no tiene efecto.',
    },
    runtime: emitterRuntime,
  },
  {
    id: 'remover',
    family: 'sources',
    names: { en: 'Item remover', es: 'Retirador de piezas' },
    config: removerConfig,
    signals: () => [],
    actions: [],
    snapPoints: () => [{ name: 'in', position: [0, 0, 0], normalYDeg: 180, accepts: ['belt', 'roller', 'curved'] }],
    doc: {
      en:
        'A volume that removes every item whose centre enters it and counts them as delivered. When accepts is not any (red, blue, ' +
        'metal, plastic, light up to 3.5 kg, heavy, short up to 0.25 m, medium up to 0.35 m, tall, or code with acceptsCode), it also ' +
        'counts them as sorted when they match and misrouted when they do not; a pallet never matches a class.',
      es:
        'Un volumen que retira cada pieza cuyo centro entra en él y las cuenta como entregadas. Cuando accepts no es any (red, blue, ' +
        'metal, plastic, light hasta 3,5 kg, heavy, short hasta 0,25 m, medium hasta 0,35 m, tall, o code con acceptsCode), también las ' +
        'cuenta como clasificadas si coinciden y como mal enrutadas si no; una tarima nunca coincide con una clase.',
    },
    runtime: removerRuntime,
  },
];
