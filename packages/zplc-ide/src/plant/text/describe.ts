import { translatorFor } from '../../i18n';
import type { PlantSceneFile, PlantSnapshot } from '../contracts';

const TOTALS = ['itemsEmitted', 'itemsRemoved', 'itemsDropped', 'itemsCollided'] as const;
// Continuous measurements of a tank or an axis: whole numbers only by chance, so they are never a change of situation. The tank is told
// by its level band and `spilling` below.
const CONTINUOUS = ['level:', 'volume:', 'spilledL:', 'axis:'];
// The support facts (K5) and a tank's high-mark count are told in words and stay silent at 0, so a scene that assembles or stacks nothing
// reads as it did before them.
const SUPPORT = /^(itemsAssembled|stacked:pallet:\d+|layers:pallet:\d+|highs:.+)$/;
const kindOf = (k: string) => (k.startsWith('layers:pallet:') ? 'layers' : '');
const m = (n: number) => String(Math.round(n * 10) / 10);

/**
 * The plant facts as a sentence (VIS-008, PLT-010). `key` holds only what is a change of situation (item count, integer
 * facts, active signals), never a position, so announcing on key change does not announce every scan.
 */
export function describePlant(snapshot: PlantSnapshot, scene: PlantSceneFile, locale: 'en' | 'es'): { text: string; key: string } {
  const { t } = translatorFor(locale);
  const parts = [t('plant.text.summary', { scene: scene.name, count: snapshot.items.length })];
  // position:<kind>:<index> facts are positions, never part of a change of situation.
  const facts = Object.entries(snapshot.facts).filter(
    ([k, v]) =>
      !k.startsWith('position:') &&
      !CONTINUOUS.some((c) => k.startsWith(c)) &&
      (typeof v !== 'number' || Number.isInteger(v)) &&
      !(SUPPORT.test(k) && v === 0),
  );
  for (const n of TOTALS)
    if (typeof snapshot.facts[n] === 'number') parts.push(t(`plant.text.${n}`, { count: snapshot.facts[n] as number }));
  for (const [k, v] of facts) {
    if ((TOTALS as readonly string[]).includes(k) || kindOf(k) === 'layers') continue;
    const pallet = /^stacked:pallet:(\d+)$/.exec(k);
    if (k === 'itemsAssembled') {
      parts.push(t('plant.text.itemsAssembled', { count: String(v) }));
      continue;
    }
    if (pallet) {
      const layers = snapshot.facts[`layers:pallet:${pallet[1]}`] ?? 0;
      parts.push(t('plant.text.pallet', { number: String(Number(pallet[1]) + 1), boxes: String(v), layers: String(layers) }));
      continue;
    }
    const [kind, name] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (kind === 'delivered' && k.includes(':')) parts.push(t('plant.text.delivered', { name, count: String(v) }));
    else if (kind === 'count' && k.includes(':')) parts.push(t('plant.text.count', { name, count: String(v) }));
    else if ((kind === 'picked' || kind === 'placed' || kind === 'drops') && k.includes(':'))
      parts.push(t(`plant.text.${kind}`, { name, count: String(v) }));
    else if (kind === 'highs' && k.includes(':')) parts.push(t('plant.text.highs', { name, count: String(v) }));
    else if (kind === 'inBand' && k.includes(':')) parts.push(t(v ? 'plant.text.inBand' : 'plant.text.outOfBand', { name }));
    else parts.push(t('plant.text.fact', { name: k, value: String(v) }));
  }
  const active = snapshot.parts.flatMap((p) => (Object.values(p.signals).some((v) => v === true) ? [p.name] : []));
  if (active.length > 0) parts.push(t('plant.text.active', { names: active.join(', ') }));
  for (const it of snapshot.items.slice(0, 5)) parts.push(t('plant.text.item', { id: it.id, x: m(it.p[0]), z: m(it.p[2]) }));
  // A tank's level is told by its tenth of the height (and whether it spills), so a screen reader hears 40 percent, not every scan.
  const tanks = snapshot.parts.flatMap((p) => {
    const fraction = p.part === 'tank' && typeof p.state.fraction === 'number' ? p.state.fraction : undefined;
    return fraction === undefined ? [] : [{ name: p.name, fraction, spilling: p.state.spilling === true }];
  });
  for (const tk of tanks) parts.push(t('plant.text.level', { name: tk.name, percent: Math.round(tk.fraction * 100) }));
  const bands = tanks.map((tk) => [tk.name, Math.min(10, Math.max(0, Math.floor(tk.fraction * 10 + 1e-9))), tk.spilling]);
  const key = JSON.stringify([snapshot.items.length, facts.sort(([a], [b]) => (a < b ? -1 : 1)), active, bands]);
  return { text: parts.join(' '), key };
}
