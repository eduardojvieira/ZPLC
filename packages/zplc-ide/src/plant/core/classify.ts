import type { Vec3 } from '../contracts';

// ponytail: declared here until Task A0 exports them from contracts.ts; then import them from there and delete these two.
export type ItemColour = 'red' | 'blue';
export interface ItemProps {
  colour?: ItemColour;
  metal?: boolean;
  code?: number;
}

export type HeightClass = 'short' | 'medium' | 'tall';
export type WeightClass = 'light' | 'heavy';
export const ACCEPTS = ['any', 'red', 'blue', 'metal', 'plastic', 'light', 'heavy', 'short', 'medium', 'tall', 'code'] as const;
export type Accepts = (typeof ACCEPTS)[number];
export interface ClassifyInput extends ItemProps {
  size: Vec3;
  massKg: number;
}

/** Thresholds with 50 mm margin around the three box heights 0.2, 0.3, 0.4 (R4-C1). */
export const heightClassOf = (heightM: number): HeightClass => (heightM <= 0.25 ? 'short' : heightM <= 0.35 ? 'medium' : 'tall');
/** 3.5 kg sits between the two box masses 2 and 5 kg (R4-C1). */
export const weightClassOf = (massKg: number): WeightClass => (massKg <= 3.5 ? 'light' : 'heavy');

/** `code` is the `acceptsCode` of the remover. Pallets (no props, `isPallet`) never match a class, only `any`. */
export function matches(accepts: Accepts, item: ClassifyInput & { pallet?: boolean }, code: number): boolean {
  if (accepts === 'any') return true;
  if (item.pallet) return false;
  switch (accepts) {
    case 'red':
    case 'blue':
      return item.colour === accepts;
    case 'metal':
      return item.metal === true;
    case 'plastic':
      return item.metal !== true;
    case 'light':
    case 'heavy':
      return weightClassOf(item.massKg) === accepts;
    case 'short':
    case 'medium':
    case 'tall':
      return heightClassOf(item.size[1]) === accepts;
    case 'code':
      return item.code !== undefined && item.code === code;
  }
}
