/** The text of the plant view, in English and in Spanish. Keys `plantView.*`: `plant.text.*` (V3), `plant.panel.*` (V4), `plant.cue.*` (V2). */
export const plantViewEn = {
  'plant.text.summary': '{scene}: {count} items on the plant.',
  'plant.text.produced': 'Produced: {count}.',
  'plant.text.delivered': 'Delivered: {count}.',
  'plant.text.dropped': 'Dropped: {count}.',
  'plant.text.collided': 'Collided: {count}.',
  'plant.text.fact': '{name}: {value}.',
  'plant.text.active': 'Active: {names}.',
  'plant.text.item': 'Item {id} at x {x} m, z {z} m.',
} as const;
export const plantViewEs: Record<keyof typeof plantViewEn, string> = {
  'plant.text.summary': '{scene}: {count} elementos en la planta.',
  'plant.text.produced': 'Producidos: {count}.',
  'plant.text.delivered': 'Entregados: {count}.',
  'plant.text.dropped': 'Caídos: {count}.',
  'plant.text.collided': 'Con colisión: {count}.',
  'plant.text.fact': '{name}: {value}.',
  'plant.text.active': 'Activos: {names}.',
  'plant.text.item': 'Elemento {id} en x {x} m, z {z} m.',
};
