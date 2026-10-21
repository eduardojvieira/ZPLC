import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { Cell, CellType, ConformanceCase, TaskSpec } from './cases';

// What the runners of the conformance suite share: the project a case is built from, and how a value of each type is
// written to and read from the bytes of VM memory. The runner of the native runtime is conformance.test.ts; the runner of
// the core in WebAssembly is runtime/wasmParity.test.ts.

export type Access = [read: (view: DataView) => number, write: (view: DataView, value: number) => void];
export const ACCESS: Record<Exclude<CellType, 'BOOL'>, Access> = {
  SINT: [(v) => v.getInt8(0), (v, x) => v.setInt8(0, x)],
  USINT: [(v) => v.getUint8(0), (v, x) => v.setUint8(0, x)],
  BYTE: [(v) => v.getUint8(0), (v, x) => v.setUint8(0, x)],
  INT: [(v) => v.getInt16(0, true), (v, x) => v.setInt16(0, x, true)],
  UINT: [(v) => v.getUint16(0, true), (v, x) => v.setUint16(0, x, true)],
  WORD: [(v) => v.getUint16(0, true), (v, x) => v.setUint16(0, x, true)],
  DINT: [(v) => v.getInt32(0, true), (v, x) => v.setInt32(0, x, true)],
  UDINT: [(v) => v.getUint32(0, true), (v, x) => v.setUint32(0, x, true)],
  DWORD: [(v) => v.getUint32(0, true), (v, x) => v.setUint32(0, x, true)],
  REAL: [(v) => v.getFloat32(0, true), (v, x) => v.setFloat32(0, x, true)],
};

export const label = (cell: Cell) => `${cell.at ?? cell.var} (${cell.type})`;

export async function workspace(
  found: Pick<ConformanceCase, 'source' | 'extension' | 'extras'> & { tasks: TaskSpec[] },
  scanMs: number,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-conformance-'));
  await mkdir(join(root, 'src'));
  const program = `main${found.extension}`;
  await copyFile(found.source, join(root, 'src', program));
  for (const extra of found.extras) await copyFile(extra, join(root, 'src', basename(extra)));
  const tasks =
    found.tasks.length > 0 ? found.tasks : [{ name: 'MainTask', trigger: 'cyclic', interval_ms: scanMs, priority: 1, programs: [program] }];
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({ schemaVersion: 2, name: 'conformance', version: '1.0.0', target: { board: 'posix' }, tasks }),
  );
  return root;
}
