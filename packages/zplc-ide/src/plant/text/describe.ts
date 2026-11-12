import { translatorFor } from '../../i18n';
import type { PlantSceneFile, PlantSnapshot } from '../contracts';

const TOTALS = ['itemsEmitted', 'itemsRemoved', 'itemsDropped', 'itemsCollided'] as const;
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
    ([k, v]) => !k.startsWith('position:') && (typeof v !== 'number' || Number.isInteger(v)),
  );
  for (const n of TOTALS)
    if (typeof snapshot.facts[n] === 'number') parts.push(t(`plant.text.${n}`, { count: snapshot.facts[n] as number }));
  for (const [k, v] of facts) {
    if ((TOTALS as readonly string[]).includes(k)) continue;
    const [kind, name] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (kind === 'delivered' && k.includes(':')) parts.push(t('plant.text.delivered', { name, count: String(v) }));
    else if (kind === 'count' && k.includes(':')) parts.push(t('plant.text.count', { name, count: String(v) }));
    else parts.push(t('plant.text.fact', { name: k, value: String(v) }));
  }
  const active = snapshot.parts.flatMap((p) => (Object.values(p.signals).some((v) => v === true) ? [p.name] : []));
  if (active.length > 0) parts.push(t('plant.text.active', { names: active.join(', ') }));
  for (const it of snapshot.items.slice(0, 5)) parts.push(t('plant.text.item', { id: it.id, x: m(it.p[0]), z: m(it.p[2]) }));
  const key = JSON.stringify([snapshot.items.length, facts.sort(([a], [b]) => (a < b ? -1 : 1)), active]);
  return { text: parts.join(' '), key };
}
