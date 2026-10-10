import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { Edge, Node } from '@xyflow/react';
import { createEmptyFileContent } from '../types';
import { blockNodeData, edgesToConnections, nodesToBlocks } from '../editors/fbd/graphModel';
import { nodesToSteps, nodesToTransitions, stepNodeData, transitionNodeData } from '../editors/sfc/graphModel';
import { parseFBDModel, serializeFBDModel } from './fbd';
import { parseLDModel, serializeLDModel } from './ld';
import { parseSFCModel, serializeSFCModel } from './sfc';
import { isUnchangedVisualDocument, loadFBDFile, loadLDFile, loadSFCFile } from './visualFileLoad';

// LNG-014: opening a Ladder, FBD or SFC file and saving it without a change leaves it byte for byte what it was.
// The files are the ones the repository commits: the bundled projects and the conformance cases.
const repositoryRoot = join(import.meta.dir, '../../../..');
const kinds = [
  { language: 'LD', suffix: '.ld.json', load: loadLDFile, serialize: (text: string) => serializeLDModel(parseLDModel(text)) },
  { language: 'FBD', suffix: '.fbd.json', load: loadFBDFile, serialize: (text: string) => serializeFBDModel(parseFBDModel(text)) },
  { language: 'SFC', suffix: '.sfc.json', load: loadSFCFile, serialize: (text: string) => serializeSFCModel(parseSFCModel(text)) },
] as const;

function committed(suffix: string): string[] {
  return ['conformance', 'packages/zplc-ide/projects', 'examples']
    .flatMap((folder) => [...new Bun.Glob(`**/*${suffix}`).scanSync({ cwd: join(repositoryRoot, folder) })].map((path) => join(folder, path)))
    .sort();
}

describe('LNG-014 the committed visual files', () => {
  it('finds files of each language to check', () => {
    for (const kind of kinds) expect(committed(kind.suffix).length).toBeGreaterThanOrEqual(3);
  });

  for (const kind of kinds) {
    it(`${kind.language}: the model an editor loads and commits again leaves every file that opens as it was`, () => {
      const rewritten: string[] = [];
      let opened = 0;
      for (const path of committed(kind.suffix)) {
        const text = readFileSync(join(repositoryRoot, path), 'utf8');
        if (!kind.load(path, text).ok) continue; // a file the schema rejects never reaches an editor (LNG-011)
        opened += 1;
        if (!isUnchangedVisualDocument(kind.language, text, kind.serialize(text))) rewritten.push(path);
      }
      expect(opened).toBeGreaterThanOrEqual(3);
      expect(rewritten).toEqual([]);
    });
  }

  it('only the files that name a model the editors cannot open are refused, and each says why', () => {
    const refused: string[] = [];
    for (const kind of kinds) {
      for (const path of committed(kind.suffix)) {
        const result = kind.load(path, readFileSync(join(repositoryRoot, path), 'utf8'));
        if (!result.ok) {
          expect(result.error.fileName).toBe(path);
          expect(result.error.violations.length).toBeGreaterThan(0);
          refused.push(relative(repositoryRoot, join(repositoryRoot, path)));
        }
      }
    }
    // Each of these cases is about the compiler refusing a model the editors cannot hold either (an element of a type the Ladder
    // editor does not draw, a wire to a port the block does not have: LNG-002, LNG-008): the file is refused when it is opened
    // and again when it is built.
    expect(refused).toEqual([
      'conformance/lng/lng-002-ld-jump-is-rejected.ld.json',
      'conformance/lng/lng-002-ld-unknown-element.ld.json',
      'conformance/lng/lng-002-fbd-en-input-is-rejected.fbd.json',
      'conformance/lng/lng-008-fbd-calls-a-user-function-block.fbd.json',
      'conformance/lng/lng-008-fbd-calls-a-user-function.fbd.json',
    ]);
  });
});

describe('LNG-014 the one form of a visual file', () => {
  it('is two-space JSON that ends in one newline, whichever editor wrote it', () => {
    for (const text of [serializeLDModel(parseLDModel(createEmptyFileContent('LD'))), serializeFBDModel(parseFBDModel(createEmptyFileContent('FBD'))), serializeSFCModel(parseSFCModel(createEmptyFileContent('SFC')))]) {
      expect(text.endsWith('}\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    }
  });

  it('is a form that serializing again does not move', () => {
    for (const kind of kinds) {
      for (const path of committed(kind.suffix)) {
        const text = readFileSync(join(repositoryRoot, path), 'utf8');
        if (!kind.load(path, text).ok) continue;
        const once = kind.serialize(text);
        expect(kind.serialize(once)).toBe(once);
      }
    }
  });

  it('keeps the file when a commit says what the file already said, and takes a commit that says something else', () => {
    const handWritten = '{"name":"Hand","variables":{"local":[],"outputs":[]},"rungs":[]}';
    const same = serializeLDModel(parseLDModel(handWritten));
    expect(isUnchangedVisualDocument('LD', handWritten, same)).toBe(true);
    const changed = serializeLDModel({ ...parseLDModel(handWritten), description: 'edited' });
    expect(isUnchangedVisualDocument('LD', handWritten, changed)).toBe(false);
    expect(isUnchangedVisualDocument('LD', 'not json', same)).toBe(false);
  });
});

describe('LNG-014 the commit of an editor that changed nothing says what the file says', () => {
  const files = (suffix: string) => committed(suffix).map((path) => ({ path, text: readFileSync(join(repositoryRoot, path), 'utf8') }));

  it('FBD: the blocks and wires an editor rebuilds from its canvas are the file', () => {
    const rewritten: string[] = [];
    for (const { path, text } of files('.fbd.json')) {
      if (!loadFBDFile(path, text).ok) continue;
      const model = parseFBDModel(text);
      // what the canvas holds for a block (FBDEditor blocksToNodes), and for a wire
      const nodes: Node[] = model.blocks.map((block) => ({ id: block.id, type: 'block', position: block.position, data: blockNodeData(block) }));
      const edges: Edge[] = model.connections.map((wire) => ({ id: wire.id, source: wire.from.block, sourceHandle: wire.from.port, target: wire.to.block, targetHandle: wire.to.port }));
      const next = serializeFBDModel({ ...model, blocks: nodesToBlocks(nodes), connections: edgesToConnections(edges) });
      if (!isUnchangedVisualDocument('FBD', text, next)) rewritten.push(path);
    }
    expect(rewritten).toEqual([]);
  });

  it('SFC: the steps and transitions an editor rebuilds from its canvas are the file', () => {
    const rewritten: string[] = [];
    for (const { path, text } of files('.sfc.json')) {
      if (!loadSFCFile(path, text).ok) continue;
      const model = parseSFCModel(text);
      const nodes: Node[] = [
        ...model.steps.map((step) => ({ id: step.id, type: 'step', position: step.position, data: stepNodeData(step) })),
        // the editor places a transition that has no position at a default one: the position is its layout, not an edit
        ...model.transitions.map((transition) => ({ id: transition.id, type: 'transition', position: transition.position ?? { x: 200, y: 150 }, data: transitionNodeData(transition) })),
      ];
      const edges: Edge[] = model.transitions.flatMap((transition) => [
        ...(transition.fromSteps ?? [transition.fromStep]).map((from) => ({ id: `${from}>${transition.id}`, source: from, target: transition.id })),
        ...(transition.toSteps ?? [transition.toStep]).map((to) => ({ id: `${transition.id}>${to}`, source: transition.id, target: to })),
      ]);
      const rebuilt = nodesToTransitions(nodes, edges).map((transition, index) => {
        if (model.transitions[index]!.position !== undefined) return transition;
        return Object.fromEntries(Object.entries(transition).filter(([field]) => field !== 'position')) as typeof transition;
      });
      const next = serializeSFCModel({ ...model, steps: nodesToSteps(nodes), transitions: rebuilt });
      if (!isUnchangedVisualDocument('SFC', text, next)) rewritten.push(path);
    }
    expect(rewritten).toEqual([]);
  });
});
