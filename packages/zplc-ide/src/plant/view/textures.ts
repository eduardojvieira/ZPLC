/**
 * The URLs of the bundled plant textures (src/plant/assets/textures, VIS-012, VIS-019), resolved by Vite as `?url` assets: the build
 * copies each map into the application and serves it from the application itself (CSP `img-src 'self'`); nothing is remote. Outside
 * Vite (bun tests) the glob does not exist and no texture resolves, so the renderer draws without maps.
 */
import type { Skin } from './look';

export type MapName = 'basecolor' | 'normal' | 'roughness' | 'metalness';
export const MAP_NAMES: readonly MapName[] = ['basecolor', 'normal', 'roughness', 'metalness'];

let urls: Record<string, string> = {};
try {
  urls = import.meta.glob<string>('../assets/textures/*/*.png', { query: '?url', import: 'default', eager: true });
} catch {
  // not running under Vite
}

/** The URL of one map of one bundled texture set, or undefined when it is not bundled (or outside Vite). */
export const textureUrl = (skin: Skin, map: MapName): string | undefined => urls[`../assets/textures/${skin}/${map}.png`];

/** How many metres of a surface one tile of a texture covers. */
export const TILE_M: Readonly<Record<Skin, number>> = {
  'painted-steel': 0.5,
  'brushed-metal': 0.4,
  'rubber-belt': 0.5,
  plastic: 0.3,
  cardboard: 0.4,
  floor: 2,
};
