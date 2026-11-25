/**
 * Control stations (plan-vis C4): operator controls that stand together share one stand. Pure, like `sensorMount`: it reads the part
 * view and all part views, and the next unit draws what it returns.
 */
import type { PartView } from '../contracts';
import { OPERATOR } from './models/operator';

/** Two controls whose planar distance is at most this stand in one station. */
export const STATION_REACH_M = 0.6;

/** What a station widens its members' footprint by, per side. */
const MARGIN_M = 0.08;
/** The underside of a control box below the pose: the enclosure top (-0.02) less its height (0.12), as in `operator.ts`. */
const BOX_UNDERSIDE_M = -0.14;

export interface ControlStation {
  /** The lowest member id (string order). */
  id: string;
  /** Member part ids, sorted. */
  members: readonly string[];
  /** The planar (x, z) footprint of the members, widened by 0.08 m on each side. */
  min: [number, number];
  max: [number, number];
  /** The floor under the station: world y 0, where the push-button pedestal stands (its floor is `-pose.p[1]` from the pose). */
  floor: number;
  /** The lowest underside of the members' control boxes: where the shared body must reach. */
  top: number;
}

/** The stations of a snapshot's parts by member id; a control alone is absent. Single linkage, so the order of `parts` is irrelevant. */
export function groupControls(parts: readonly PartView[]): ReadonlyMap<string, ControlStation> {
  const ops = parts.filter((p) => Object.hasOwn(OPERATOR, p.part)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const near = (a: PartView, b: PartView) => Math.hypot(a.pose.p[0] - b.pose.p[0], a.pose.p[2] - b.pose.p[2]) <= STATION_REACH_M;
  const result = new Map<string, ControlStation>();
  const seen = new Set<string>();
  for (const first of ops) {
    if (seen.has(first.id)) continue;
    const group = [first];
    seen.add(first.id);
    for (let i = 0; i < group.length; i++)
      for (const o of ops)
        if (!seen.has(o.id) && near(group[i]!, o)) {
          seen.add(o.id);
          group.push(o);
        }
    if (group.length < 2) continue;
    const xs = group.map((p) => p.pose.p[0]);
    const zs = group.map((p) => p.pose.p[2]);
    const members = group.map((p) => p.id).sort();
    const station: ControlStation = {
      id: members[0]!,
      members,
      min: [Math.min(...xs) - MARGIN_M, Math.min(...zs) - MARGIN_M],
      max: [Math.max(...xs) + MARGIN_M, Math.max(...zs) + MARGIN_M],
      floor: 0,
      top: Math.min(...group.map((p) => p.pose.p[1] + BOX_UNDERSIDE_M)),
    };
    for (const id of members) result.set(id, station);
  }
  return result;
}

/** The station of `view` among `parts`, or null when it stands alone or is no operator control. */
export const controlStation = (view: PartView, parts: readonly PartView[]): ControlStation | null =>
  groupControls(parts).get(view.id) ?? null;
