/** The text of the plant view, in English and in Spanish. Keys `plantView.*`: `plant.text.*` (V3), `plant.panel.*` (V4), `plant.cue.*` (V2). */
export const plantViewEn = {
  'plant.text.summary': '{scene}: {count} items on the plant.',
  'plant.text.itemsEmitted': 'Emitted: {count}.',
  'plant.text.itemsRemoved': 'Removed: {count}.',
  'plant.text.delivered': 'Delivered at {name}: {count}.',
  'plant.text.count': '{name}: {count} pulses.',
  'plant.text.itemsDropped': 'Dropped: {count}.',
  'plant.text.itemsCollided': 'Collided: {count}.',
  'plant.text.fact': '{name}: {value}.',
  'plant.text.active': 'Active: {names}.',
  'plant.text.item': 'Item {id} at x {x} m, z {z} m.',
} as const;
export const plantViewEs: Record<keyof typeof plantViewEn, string> = {
  'plant.text.summary': '{scene}: {count} elementos en la planta.',
  'plant.text.itemsEmitted': 'Emitidos: {count}.',
  'plant.text.itemsRemoved': 'Retirados: {count}.',
  'plant.text.delivered': 'Entregados en {name}: {count}.',
  'plant.text.count': '{name}: {count} pulsos.',
  'plant.text.itemsDropped': 'Caídos: {count}.',
  'plant.text.itemsCollided': 'Con colisión: {count}.',
  'plant.text.fact': '{name}: {value}.',
  'plant.text.active': 'Activos: {names}.',
  'plant.text.item': 'Elemento {id} en x {x} m, z {z} m.',
};
