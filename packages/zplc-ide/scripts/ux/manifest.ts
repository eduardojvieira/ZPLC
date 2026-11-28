/**
 * Names, conditions and the manifest of a capture run (UXV-003). A capture is `<surface>--<state>--<condition>`, with the
 * surface ids and states of specs/014-zplc-2-1-release-quality/screens.md, and the manifest of a run lists every capture with
 * its measures and defects. Nothing in it depends on the clock or the machine, so one page measured twice gives one text.
 */
import { detectDefects, visibleRect, type Defect } from './detectors';
import type { Measurement } from './measurement';

export interface Surface {
  id: string;
  /** The section of screens.md the surface is listed under. */
  area: string;
  states: string[];
  /** The registered command ids that open it. */
  reachedBy: string[];
  /** The journeys or pictures that show it today (J6, Q2, shots, doc:..., none), from the last column of screens.md. */
  shownBy?: string[];
}

export interface Condition {
  width: number;
  height: number;
  theme: 'light' | 'dark' | 'high-contrast';
  locale: 'en' | 'es';
  density: 'comfortable' | 'compact';
  /** The display scale (Electron deviceScaleFactor); 1 when absent. */
  scale?: number;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

export function parseScreens(markdown: string): Surface[] {
  const surfaces: Surface[] = [];
  let area = '';
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) area = heading[1]!.trim();
    if (!line.startsWith('|')) continue;
    const row = cells(line);
    const id = /^`([^`]+)`$/.exec(row[0] ?? '');
    if (!id || row.length < 7) continue;
    surfaces.push({
      id: id[1]!,
      area,
      states: row[4]!
        .split(',')
        .map((state) => state.trim())
        .filter(Boolean),
      reachedBy: [...row[5]!.matchAll(/`([^`]+)`/g)].map((match) => match[1]!),
      shownBy: [...(row[6] ?? '').matchAll(/\b([JQ]\d+[a-z]?)\b/g)].map((match) => match[1]!),
    });
  }
  return surfaces;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const conditionName = (condition: Condition): string => {
  const scale = condition.scale && condition.scale !== 1 ? `-x${Math.round(condition.scale * 100)}` : '';
  const compact = condition.density === 'compact' ? '-compact' : '';
  return `${condition.width}x${condition.height}-${condition.theme}-${condition.locale}${compact}${scale}`;
};

export function captureName(surfaces: Surface[], surface: string, state: string, condition: Condition): string {
  const found = surfaces.find((candidate) => candidate.id === surface);
  if (!found) throw new Error(`${surface} is not a surface of screens.md`);
  if (!found.states.includes(state)) throw new Error(`${surface} has no state "${state}" in screens.md (${found.states.join(', ')})`);
  return `${surface}--${slug(state)}--${conditionName(condition)}`;
}

/**
 * The covering set of decision D-36 that every surface gets: 1440 by 900 light and dark in both languages, 1024 by 768 in
 * Spanish, high contrast in English, and the compact density. The surfaces of the golden journeys get the other sizes and the
 * 150 % scale too; the conditions of the 3D view are not here (see the header of capture.ts).
 */
export function conditionsFor(surface: Surface): Condition[] {
  const at = (
    width: number,
    height: number,
    theme: Condition['theme'],
    locale: Condition['locale'],
    density: Condition['density'] = 'comfortable',
    scale = 1,
  ): Condition => ({
    width,
    height,
    theme,
    locale,
    density,
    ...(scale === 1 ? {} : { scale }),
  });
  const set: Condition[] = [
    at(1440, 900, 'light', 'en'),
    at(1440, 900, 'light', 'es'),
    at(1440, 900, 'dark', 'en'),
    at(1440, 900, 'dark', 'es'),
    at(1024, 768, 'light', 'es'),
    at(1440, 900, 'high-contrast', 'en'),
  ];
  if (surface.area !== 'Outside Studio') set.push(at(1440, 900, 'light', 'en', 'compact'));
  // the surfaces of the golden journeys (a J or Q number in screens.md): the other sizes, the 150 % scale, and a usable area under
  // the minimum window of 1024 by 768 (electron/main.ts), which the window cannot be smaller than but a screen can be
  if ((surface.shownBy ?? []).length > 0)
    set.push(
      at(1366, 768, 'light', 'en'),
      at(1920, 1080, 'light', 'en'),
      at(1440, 900, 'light', 'en', 'comfortable', 1.5),
      at(1024, 600, 'light', 'en'),
    );
  return set;
}

export type LessonKind = 'reading' | 'exercise';

/** The lessons in course order (module, then order in the module), each with the surfaces it has: a reading only when it has one. */
export function lessonPlan(
  lessons: Array<{ id: string; module: number; order: number; reading: boolean }>,
): Array<{ id: string; kinds: LessonKind[] }> {
  return [...lessons]
    .sort((a, b) => a.module - b.module || a.order - b.order || (a.id < b.id ? -1 : 1))
    .map((lesson) => ({ id: lesson.id, kinds: lesson.reading ? ['reading', 'exercise'] : ['exercise'] }));
}

export const lessonCaptureName = (id: string, kind: LessonKind, condition: Condition): string =>
  `lesson.${id}.${kind}--${conditionName(condition)}`;

/** UXV-007: both languages at 1440 by 900, and a reading also in the longest language at the smallest window (D-36). */
export function lessonConditions(kind: LessonKind): Condition[] {
  const at = (width: number, height: number, locale: Condition['locale']): Condition => ({
    width,
    height,
    theme: 'light',
    locale,
    density: 'comfortable',
  });
  return [at(1440, 900, 'en'), at(1440, 900, 'es'), ...(kind === 'reading' ? [at(1024, 768, 'es')] : [])];
}

export interface CaptureRecord {
  name: string;
  surface: string;
  state: string;
  condition: string;
  file: string;
  measures: { elements: number; controls: number; texts: number; focusChecked: number; focusUnchecked: number; scene: string };
  defects: Defect[];
  /** The texts and controls a person cannot see or reach (under a modal, inert, hidden by a scroller or the window), left out. */
  unchecked: Array<{ where: string; reason: string }>;
}

export function captureRecord(name: string, surface: string, state: string, condition: Condition, measurement: Measurement): CaptureRecord {
  const controls = measurement.elements.filter((element) => element.control && !element.disabled);
  return {
    name,
    surface,
    state,
    condition: conditionName(condition),
    file: `${name}.png`,
    measures: {
      elements: measurement.elements.length,
      controls: controls.length,
      texts: measurement.elements.filter((element) => element.text).length,
      focusChecked: controls.filter((element) => element.focusRing !== null).length,
      focusUnchecked: controls.filter((element) => element.focusRing === null).length,
      scene: measurement.scene === null ? 'none' : measurement.scene === 'unmeasured' ? 'unmeasured' : 'measured',
    },
    defects: detectDefects(measurement),
    unchecked: measurement.elements
      .filter((element) => element.control || element.text)
      .flatMap((element) => {
        const reason = element.blocked ?? (visibleRect(element, measurement) ? null : 'hidden by its scroller or outside the window');
        return reason ? [{ where: element.name, reason }] : [];
      }),
  };
}

/** One defect per condition, selector and kind: fixed chrome repeats on every surface of a condition and counts once. */
export function defectSummary(captures: CaptureRecord[]): { defects: number; byKind: Record<string, number> } {
  const seen = new Set<string>();
  const byKind: Record<string, number> = {};
  for (const capture of captures)
    for (const defect of capture.defects) {
      const key = JSON.stringify([capture.condition, defect.where, defect.kind]);
      if (seen.has(key)) continue;
      seen.add(key);
      byKind[defect.kind] = (byKind[defect.kind] ?? 0) + 1;
    }
  const sortedKinds = Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { defects: seen.size, byKind: sortedKinds };
}

/** Per surface that has a capture, its states in screens.md that no capture shows. */
export function statesNotProduced(surfaces: Surface[], captures: CaptureRecord[]): Record<string, string[]> {
  const shown = new Map<string, Set<string>>();
  for (const capture of captures) shown.set(capture.surface, (shown.get(capture.surface) ?? new Set()).add(capture.state));
  const missing: Record<string, string[]> = {};
  for (const surface of surfaces) {
    const have = shown.get(surface.id);
    if (!have) continue;
    const rest = surface.states.filter((state) => !have.has(state));
    if (rest.length > 0) missing[surface.id] = rest;
  }
  return missing;
}

export function manifestText(
  captures: CaptureRecord[],
  unreached: Array<{ surface: string; reason: string }>,
  failedConditions: Array<{ condition: string; error: string }> = [],
  notes: string[] = [],
  notProduced: Record<string, string[]> = {},
): string {
  const sorted = [...captures].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const manifest = {
    what: 'The captures of a UXV run (spec 014 UXV-003) with the defects a machine measured on each (UXV-004)',
    captures: sorted,
    defects: sorted.reduce((total, capture) => total + capture.defects.length, 0),
    summary: defectSummary(sorted),
    unreached: [...unreached].sort((a, b) => (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0)),
    /** Conditions that stopped before their last capture: what they captured is above, the error is here. */
    /** What the run had to do that a person would not, such as clicking Retry on a failure screen. */
    notes: [...notes].sort(),
    /** Per surface, the states screens.md lists that no capture of this run shows (a fixture would be needed to produce them). */
    statesNotProduced: notProduced,
    failedConditions: [...failedConditions].sort((a, b) => (a.condition < b.condition ? -1 : a.condition > b.condition ? 1 : 0)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
