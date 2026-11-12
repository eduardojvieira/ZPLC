export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export interface BoxSpec { id: string; halfExtents: Vec3; position: Vec3; massKg: number; friction: number; motion: 'static' | 'dynamic' }
export interface BeltSpec { id: string; halfExtents: Vec3; position: Vec3; axis: Vec3; friction: number; accelMps2: number }
export interface EyeSpec { id: string; from: Vec3; to: Vec3 }
export interface GateScene { name: string; boxes: BoxSpec[]; belts: BeltSpec[]; eyes: EyeSpec[] }

const CUBE = 0.15;

// A static floor with its top at y = 0 and one 0.3 m cube of 5 kg, centre at y = 1.
export function dropBox(): GateScene {
  return {
    name: 'dropBox',
    boxes: [
      floor(),
      { id: 'box', halfExtents: [CUBE, CUBE, CUBE], position: [0, 1, 0], massKg: 5, friction: 0.6, motion: 'dynamic' },
    ],
    belts: [],
    eyes: [],
  };
}

export const BELT_SPEED_MPS = 0.5;

const BELT_TOP = 0.5;

const floor = (): BoxSpec => ({ id: 'floor', halfExtents: [10, 0.5, 10], position: [0, -0.5, 0], massKg: 0, friction: 0.6, motion: 'static' });

const belt = (lengthM: number): BeltSpec => ({
  id: 'belt',
  halfExtents: [lengthM / 2, 0.05, 0.3],
  position: [0, BELT_TOP - 0.05, 0],
  axis: [1, 0, 0],
  friction: 0.6,
  accelMps2: 1.0,
});

const cubeOnBelt = (x: number): BoxSpec => ({ id: 'box', halfExtents: [CUBE, CUBE, CUBE], position: [x, BELT_TOP + CUBE + 0.001, 0], massKg: 5, friction: 0.6, motion: 'dynamic' });

export function beltBox(): GateScene {
  return {
    name: 'beltBox',
    boxes: [floor(), cubeOnBelt(-1.5)],
    belts: [belt(4)],
    eyes: [{ id: 'eye', from: [1, BELT_TOP + 0.1, -0.5], to: [1, BELT_TOP + 0.1, 0.5] }],
  };
}

export function palletStack(): GateScene {
  const palletHalf: Vec3 = [0.6, 0.072, 0.4];
  const palletY = BELT_TOP + palletHalf[1] + 0.001;
  const boxes: BoxSpec[] = [floor(), { id: 'pallet', halfExtents: palletHalf, position: [-3, palletY, 0], massKg: 25, friction: 0.6, motion: 'dynamic' }];
  for (let i = 0; i < 5; i += 1) {
    boxes.push({ id: `box${i}`, halfExtents: [0.2, 0.1, 0.15], position: [-3, palletY + palletHalf[1] + 0.1 + 0.001 + i * 0.2002, 0], massKg: 5, friction: 0.6, motion: 'dynamic' });
  }
  return { name: 'palletStack', boxes, belts: [belt(8)], eyes: [] };
}

export function restSoak(): GateScene {
  return {
    name: 'restSoak',
    boxes: [
      floor(),
      cubeOnBelt(0),
      { id: 'floorBox', halfExtents: [CUBE, CUBE, CUBE], position: [5, CUBE + 0.001, 0], massKg: 5, friction: 0.6, motion: 'dynamic' },
    ],
    belts: [belt(4)],
    eyes: [],
  };
}

// 20 belts (4 columns in x by 5 rows in z), 10 boxes of 5 kg on each, 0.35 m apart, centred.
export function stress(): GateScene {
  const big: BoxSpec = { id: 'floor', halfExtents: [40, 0.5, 10], position: [0, -0.5, 0], massKg: 0, friction: 0.6, motion: 'static' };
  const boxes: BoxSpec[] = [big];
  const belts: BeltSpec[] = [];
  for (let n = 0; n < 20; n += 1) {
    const x = ((n % 4) - 1.5) * 9;
    const z = (Math.floor(n / 4) - 2) * 1.0;
    belts.push({ id: `belt-${n}`, halfExtents: [4, 0.05, 0.3], position: [x, BELT_TOP - 0.05, z], axis: [1, 0, 0], friction: 0.6, accelMps2: 1.0 });
    for (let i = 0; i < 10; i += 1) {
      boxes.push({ id: `box-${n}-${i}`, halfExtents: [CUBE, CUBE, CUBE], position: [x + (i - 4.5) * 0.35, BELT_TOP + CUBE + 0.001, z], massKg: 5, friction: 0.6, motion: 'dynamic' });
    }
  }
  return { name: 'stress', boxes, belts, eyes: [] };
}

// Every 200 scans every belt reverses between +0.5 and -0.5 m/s.
export function driveStress(world: { setBeltTarget(id: string, speedMps: number): void }, scan: number): void {
  if (scan % 200 !== 0) return;
  const speed = (scan / 200) % 2 === 0 ? BELT_SPEED_MPS : -BELT_SPEED_MPS;
  for (let n = 0; n < 20; n += 1) world.setBeltTarget(`belt-${n}`, speed);
}
