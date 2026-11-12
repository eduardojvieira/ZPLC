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
      { id: 'floor', halfExtents: [10, 0.5, 10], position: [0, -0.5, 0], massKg: 0, friction: 0.6, motion: 'static' },
      { id: 'box', halfExtents: [CUBE, CUBE, CUBE], position: [0, 1, 0], massKg: 5, friction: 0.6, motion: 'dynamic' },
    ],
    belts: [],
    eyes: [],
  };
}
