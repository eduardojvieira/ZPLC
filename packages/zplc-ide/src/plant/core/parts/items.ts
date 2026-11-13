import type { BodyPose, ConfigField, FactValue, PartDefinition, PartView, Quat, ScenePart, Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import type { ItemProps } from '../classify';

/** What the core (P4) composes per scene part. Called once per 5 ms plant step: beforeStep, world.step, afterStep. */
export interface PartRuntime {
  build(world: PhysicsWorld, part: ScenePart): void;
  /** Latched commands by full signal name: belt targets, emitter edges. */
  beforeStep(commands: Readonly<Record<string, boolean | number>>): void;
  afterStep(): void;
  sense(): Record<string, boolean | number>;
  facts(): Record<string, FactValue>;
  act(action: string): void;
  views(): readonly PartView[];
}
export type PartRuntimeFactory = (part: ScenePart, rng: () => number) => PartRuntime;
export type RuntimePartDefinition = PartDefinition & { runtime: PartRuntimeFactory };

/** Items rest on conveyors with this friction (gate-verified, check 1). */
export const ITEM_FRICTION = 0.6;
export const BOX_BASE: readonly [number, number] = [0.4, 0.3]; // x and z, metres
export const PALLET_SIZE: Vec3 = [1.2, 0.144, 0.8];
const PALLET_MASS_KG = 25;
export const LID_SIZE: Vec3 = [0.4, 0.04, 0.3];
export const BASE_SIZE: Vec3 = [0.4, 0.15, 0.3];

/** The value of a config field with the definition's default; numbers also accept the enum's text form. */
export function cfg(part: ScenePart, fields: Readonly<Record<string, ConfigField>>, key: string): number | string | boolean {
  return part.config[key] ?? fields[key]!.default;
}
export const cfgNumber = (part: ScenePart, fields: Readonly<Record<string, ConfigField>>, key: string): number =>
  Number(cfg(part, fields, key));

/** Local (x, z) to world (x, z) for a rotation about +y (matches the body quaternion of `PhysicsWorld.addBody`). */
export function rotateY(deg: number, x: number, z: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
}
export function yawQuat(deg: number): Quat {
  const a = (deg * Math.PI) / 360;
  return [0, Math.sin(a), 0, Math.cos(a)];
}

export interface ItemInfo extends ItemProps {
  kind: 'item' | 'pallet';
  size: Vec3;
  massKg: number;
  tag?: ItemTag;
}
/** C3 amended (K0 declares it as BodyPose['tag']): lets the view draw a lid or a base differently from a box. */
export type ItemTag = NonNullable<BodyPose['tag']>;
const tracked = new WeakMap<PhysicsWorld, Map<string, ItemInfo>>(); // Map keeps insertion order: creation order
export const trackedItems = (world: PhysicsWorld): ReadonlyMap<string, ItemInfo> => tracked.get(world) ?? new Map();

/** Creates a dynamic item whose bottom face is centred on `at` and registers it, so removers and P4 can find it. */
export function spawnItem(
  world: PhysicsWorld,
  id: string,
  kind: 'item' | 'pallet',
  size: Vec3,
  massKg: number,
  at: Vec3,
  rotationYDeg: number,
  tag?: ItemTag,
  props?: ItemProps,
): void {
  world.addBody({
    id,
    kind,
    half: [size[0] / 2, size[1] / 2, size[2] / 2],
    position: [at[0], at[1] + size[1] / 2 + 0.001, at[2]],
    rotationYDeg,
    massKg,
    friction: ITEM_FRICTION,
    motion: 'dynamic',
    layer: 'moving',
  });
  const map = tracked.get(world) ?? new Map<string, ItemInfo>();
  map.set(id, { kind, size, massKg, ...(tag ? { tag } : {}), ...props });
  tracked.set(world, map);
}
export function removeTrackedItem(world: PhysicsWorld, id: string): void {
  world.removeBody(id);
  tracked.get(world)?.delete(id);
}

export const BOX_HEIGHTS = ['0.2', '0.3', '0.4'] as const; // plan choice: three heights, two masses
export const BOX_MASSES = ['2', '5'] as const;
export const WORKPIECE_SIZE: Vec3 = [0.2, 0.1, 0.2];
export const WORKPIECE_MASS_KG = 0.5;
export const boxSize = (height: number): Vec3 => [BOX_BASE[0], height, BOX_BASE[1]];

const NO_SIGNALS = () => [];
const itemDoc = (en: string, es: string) => ({ en, es });

const boxConfig: Record<string, ConfigField> = {
  height: { kind: 'enum', values: BOX_HEIGHTS, default: '0.3', unit: 'm' },
  mass: { kind: 'enum', values: BOX_MASSES, default: '2', unit: 'kg' },
  code: { kind: 'number', min: 0, max: 9, default: 0 },
};
const workpieceConfig: Record<string, ConfigField> = {
  colour: { kind: 'enum', values: ['red', 'blue'], default: 'red' },
  material: { kind: 'enum', values: ['plastic', 'metal'], default: 'plastic' },
  code: { kind: 'number', min: 0, max: 9, default: 0 },
  mass: { kind: 'number', min: 0.1, max: 5, default: WORKPIECE_MASS_KG, unit: 'kg' },
};

/** The item properties a config sets: colour and metal for a workpiece, a code (1 to 9) for a workpiece or a box; 0 means none. */
export function itemProps(part: ScenePart, fields: Readonly<Record<string, ConfigField>>, workpiece: boolean): ItemProps {
  const code = Math.round(cfgNumber(part, fields, 'code'));
  return {
    ...(workpiece ? { colour: cfg(part, fields, 'colour') as 'red' | 'blue', metal: cfg(part, fields, 'material') === 'metal' } : {}),
    ...(code > 0 ? { code } : {}),
  };
}

const lidBaseConfig: Record<string, ConfigField> = { mass: { kind: 'number', min: 0.1, max: 50, default: 1, unit: 'kg' } };

function itemRuntime(partId: 'box' | 'pallet' | 'lid' | 'base' | 'workpiece'): PartRuntimeFactory {
  return (part) => {
    let world: PhysicsWorld | undefined;
    const size = (): Vec3 =>
      partId === 'box'
        ? boxSize(cfgNumber(part, boxConfig, 'height'))
        : partId === 'workpiece'
          ? WORKPIECE_SIZE
          : partId === 'lid'
            ? LID_SIZE
            : partId === 'base'
              ? BASE_SIZE
              : PALLET_SIZE;
    return {
      build(w, p) {
        world = w;
        const mass =
          partId === 'box'
            ? cfgNumber(p, boxConfig, 'mass')
            : partId === 'workpiece'
              ? cfgNumber(p, workpieceConfig, 'mass')
              : partId === 'pallet'
                ? PALLET_MASS_KG
                : cfgNumber(p, lidBaseConfig, 'mass');
        // A workpiece has no tag (its pose says part 'workpiece'); the view reads the properties from the pose.
        const tag = partId === 'pallet' || partId === 'workpiece' ? undefined : partId === 'box' ? 'box' : partId;
        const props =
          partId === 'box' || partId === 'workpiece'
            ? itemProps(p, partId === 'box' ? boxConfig : workpieceConfig, partId === 'workpiece')
            : undefined;
        spawnItem(w, p.id, partId === 'pallet' ? 'pallet' : 'item', size(), mass, p.position, p.rotationYDeg, tag, props);
      },
      beforeStep() {},
      afterStep() {},
      sense: () => ({}),
      facts: () => ({}),
      act() {},
      views() {
        const b = world?.bodies().find((x) => x.id === part.id);
        if (!b) return [];
        const info = trackedItems(world!).get(part.id);
        const pose: BodyPose = {
          id: part.id,
          part: partId,
          kind: partId === 'pallet' ? 'pallet' : 'item',
          size: size(),
          p: b.p,
          q: b.q,
          ...(info?.colour ? { colour: info.colour } : {}),
          ...(info?.metal !== undefined ? { metal: info.metal } : {}),
          ...(info?.code ? { code: info.code } : {}),
        };
        return [{ id: part.id, part: partId, name: part.name, pose, state: {}, signals: {} }];
      },
    };
  };
}

/** The initial items of a scene. Geometry is generated from `size`, never loaded (PRT-009). */
export const itemParts: readonly RuntimePartDefinition[] = [
  {
    id: 'box',
    family: 'items',
    names: { en: 'Box', es: 'Caja' },
    config: boxConfig,
    signals: NO_SIGNALS,
    actions: [],
    snapPoints: () => [],
    doc: itemDoc(
      'A 0.4 by 0.3 m box with a chosen height and mass, and an optional code 1 to 9 (0 means none). Its position is the centre of its ' +
        'bottom face.',
      'Una caja de 0,4 por 0,3 m con altura y masa a elegir, y un código opcional de 1 a 9 (0 significa ninguno). Su posición es el ' +
        'centro de su cara inferior.',
    ),
    runtime: itemRuntime('box'),
  },
  {
    id: 'workpiece',
    family: 'items',
    names: { en: 'Workpiece', es: 'Pieza' },
    config: workpieceConfig,
    signals: NO_SIGNALS,
    actions: [],
    snapPoints: () => [],
    doc: itemDoc(
      'A 0.2 by 0.2 m block, 0.1 m high, in red or blue, plastic or metal, with an optional code 1 to 9 (0 means none) and a chosen ' +
        'mass. Sensors and removers read its colour, material and code. Its position is the centre of its bottom face.',
      'Un bloque de 0,2 por 0,2 m y 0,1 m de alto, rojo o azul, de plástico o metal, con un código opcional de 1 a 9 (0 significa ' +
        'ninguno) y una masa a elegir. Los sensores y los retiradores leen su color, su material y su código. Su posición es el centro ' +
        'de su cara inferior.',
    ),
    runtime: itemRuntime('workpiece'),
  },
  {
    id: 'pallet',
    family: 'items',
    names: { en: 'Pallet', es: 'Tarima' },
    config: {},
    signals: NO_SIGNALS,
    actions: [],
    snapPoints: () => [],
    doc: itemDoc(
      'A 1.2 by 0.8 m pallet, 0.144 m high, 25 kg. Its position is the centre of its bottom face.',
      'Una tarima de 1,2 por 0,8 m, de 0,144 m de alto y 25 kg. Su posición es el centro de su cara inferior.',
    ),
    runtime: itemRuntime('pallet'),
  },
  ...(['lid', 'base'] as const).map((id): RuntimePartDefinition => ({
    id,
    family: 'items',
    names: id === 'lid' ? { en: 'Lid', es: 'Tapa' } : { en: 'Base', es: 'Base' },
    config: lidBaseConfig,
    signals: NO_SIGNALS,
    actions: [],
    snapPoints: () => [],
    doc:
      id === 'lid'
        ? itemDoc(
            'A 0.4 by 0.3 m lid, 0.04 m high, with a chosen mass. It rests on a base. Its position is the centre of its bottom face.',
            'Una tapa de 0,4 por 0,3 m, de 0,04 m de alto y con masa a elegir. Se apoya sobre una base. Su posición es el centro de su ' +
              'cara inferior.',
          )
        : itemDoc(
            'A 0.4 by 0.3 m base, 0.15 m high, with a chosen mass. A lid rests on it. Its position is the centre of its bottom face.',
            'Una base de 0,4 por 0,3 m, de 0,15 m de alto y con masa a elegir. Una tapa se apoya sobre ella. Su posición es el centro de ' +
              'su cara inferior.',
          ),
    runtime: itemRuntime(id),
  })),
];
