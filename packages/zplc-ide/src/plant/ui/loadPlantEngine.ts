/** The one place the plant engine (three.js and Jolt) is imported: a dynamic import, so no start chunk holds it (VIS-012). */
export const loadPlantEngine = () => Promise.all([import('three'), import('jolt-physics/wasm-compat')]);
