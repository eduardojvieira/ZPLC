/**
 * Variables of one program of a debug map (LNG-006).
 *
 * The map has a program of each source file, and a name such as `_rung1_result` or `X_s1` is in more than one of them.
 * A display of a diagram reads the variables of its own file's program, so a name is looked for there; a variable that
 * is not there is looked for among the globals of the project, which the map lists once, in the file that declares them,
 * and nowhere else. What is in neither is not read: it is unavailable, and no other name stands in for it.
 */

import type { DebugMap, DebugPOUInfo, DebugVarInfo } from '@zplc/compiler';
import { debugPouOf } from '../compiler/debugElements';

export interface ResolvedVariable {
  /** The key the runtime read is made for: `address` and `bitOffset` say where. */
  path: string;
  address: number;
  type: string;
  region: string;
  size: number;
  bitOffset?: number;
}

function inside(pou: DebugPOUInfo, path: string): ResolvedVariable | undefined {
  const direct = pou.vars[path];
  if (direct)
    return {
      path,
      address: direct.addr,
      type: direct.type,
      region: direct.region,
      size: direct.size,
      ...(direct.bitOffset === undefined ? {} : { bitOffset: direct.bitOffset }),
    };
  const [root, ...rest] = path.split('.');
  const variable: DebugVarInfo | undefined = root === undefined ? undefined : pou.vars[root];
  if (!variable || rest.length === 0) return undefined;
  let address = variable.addr;
  let children = variable.children;
  for (const [index, name] of rest.entries()) {
    const member = children?.[name];
    if (!member) return undefined;
    address += member.offset;
    if (index === rest.length - 1) {
      return {
        path,
        address,
        type: member.type,
        region: variable.region,
        size: member.size,
        ...(variable.bitOffset === undefined ? {} : { bitOffset: variable.bitOffset }),
      };
    }
    children = undefined;
  }
  return undefined;
}

/** The variable `path` of the program of `sourceRef`, or of the globals of the project; undefined when the map has none. */
export function resolveVariable(debugMap: DebugMap | null | undefined, sourceRef: string, path: string): ResolvedVariable | undefined {
  if (!debugMap) return undefined;
  const own = debugPouOf(debugMap, sourceRef);
  const found = own ? inside(own, path) : undefined;
  if (found) return found;
  // a global is declared once, in one POU of the map
  const root = path.split('.')[0]!;
  for (const pou of Object.values(debugMap.pou)) {
    if (pou === own) continue;
    if (pou.vars[root]?.scope === 'global') return inside(pou, path);
  }
  return undefined;
}

/**
 * The key a variable of a file is polled and cached by: the name alone would be the same for two programs. A name of
 * the language has no `@`, so the last `@` ends the file.
 */
export function monitorKey(sourceRef: string, variable: string): string {
  return `${sourceRef}@${variable}`;
}

export function parseMonitorKey(key: string): { sourceRef: string; variable: string } | null {
  const at = key.lastIndexOf('@');
  return at <= 0 ? null : { sourceRef: key.slice(0, at), variable: key.slice(at + 1) };
}
