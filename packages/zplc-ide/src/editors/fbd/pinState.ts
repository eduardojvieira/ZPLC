/**
 * What each pin of each block shows online (LNG-006, UX-009): the value it holds and whether the user forces its
 * variable or the poll could not read it. An input pin shows what is wired to it.
 */

import type { FBDBlock, FBDConnection } from '../../models/fbd';
import { blockElement } from '../../models/sourceElements';
import type { ElementState, Reading, SignalFlags } from '../../monitoring/elementStates';

/** The pin of a variable block that stands for the variable: the output of a block that is read, the input of one that is written. */
const variablePin = (state: ElementState): string => ('OUT' in state.pins ? 'OUT' : 'IN');

/** The value of each pin of each block online, by block id: its outputs, and its inputs as what is wired to them. */
export function pinValuesOf(
  blocks: readonly FBDBlock[],
  connections: readonly FBDConnection[],
  states: ReadonlyMap<string, ElementState>,
): Map<string, Record<string, Reading>> {
  const outputs = (blockId: string): Record<string, Reading> => states.get(blockElement(blockId))?.pins ?? {};
  const constants = new Map(blocks.filter((block) => block.type === 'constant').map((block) => [block.id, block.value as Reading] as const));
  const sourceValue = (connection: FBDConnection): Reading =>
    constants.has(connection.from.block) ? constants.get(connection.from.block) : outputs(connection.from.block)[connection.from.port];
  const pins = new Map<string, Record<string, Reading>>(blocks.map((block) => [block.id, { ...outputs(block.id) }]));
  for (const connection of connections) {
    const own = pins.get(connection.to.block);
    if (own && !(connection.to.port in own)) own[connection.to.port] = sourceValue(connection);
  }
  // a variable block shows the variable itself, which a force makes differ from what is wired to it
  for (const block of blocks) {
    const state = states.get(blockElement(block.id));
    if (state?.value !== undefined) pins.get(block.id)![variablePin(state)] = state.value;
  }
  return pins;
}

/**
 * The flags of each pin of each block online, by block id: the ones of the variable an output pin names, and for an
 * input pin the ones of the output wired to it. A block with no flagged pin has no entry.
 */
export function pinFlagsOf(
  blocks: readonly FBDBlock[],
  connections: readonly FBDConnection[],
  states: ReadonlyMap<string, ElementState>,
): Map<string, Record<string, SignalFlags>> {
  const outputs = (blockId: string): Record<string, SignalFlags> => states.get(blockElement(blockId))?.pinFlags ?? {};
  const flags = new Map<string, Record<string, SignalFlags>>();
  for (const block of blocks) {
    const own = outputs(block.id);
    if (Object.keys(own).length > 0) flags.set(block.id, { ...own });
  }
  for (const connection of connections) {
    const source = outputs(connection.from.block)[connection.from.port];
    if (!source) continue;
    const own = flags.get(connection.to.block) ?? {};
    if (!(connection.to.port in own)) own[connection.to.port] = source;
    flags.set(connection.to.block, own);
  }
  // and a variable block is flagged by its own variable, whichever way it is wired
  for (const block of blocks) {
    const state = states.get(blockElement(block.id));
    if (state?.flags) flags.set(block.id, { ...flags.get(block.id), [variablePin(state)]: state.flags });
  }
  return flags;
}
