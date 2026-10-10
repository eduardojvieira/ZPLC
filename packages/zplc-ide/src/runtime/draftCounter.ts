import { ZPLC_CONSTANTS, ZPLC_CONTRACT } from '@zplc/compiler';

/**
 * Draft contract counter (CMP-052). Until the contract freeze, every change of an opcode or layout increments it.
 * The compiler writes it in header word 28 of each artifact, a runtime or firmware image reports its own in its
 * handshake, and a different number is refused with both of them shown. 0 is an artifact built before the counter.
 */

/** The counter bytes of an artifact header: 0 when it has none, null when the bytes are not a ZPLC artifact. */
export function artifactDraftCounter(bytes: Uint8Array): number | null {
  if (bytes.byteLength < ZPLC_CONSTANTS.HEADER_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== ZPLC_CONSTANTS.MAGIC) return null;
  return view.getUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, true);
}

function label(counter: number | null): string {
  return counter === null || counter === 0 ? 'none' : String(counter);
}

/** The one sentence a refusal uses in the loader, the runtime session, the firmware and Studio. */
export function draftMismatchMessage(artifact: number | null, runtime: number | null): string {
  return `Program was built for contract draft ${label(artifact)}, this runtime is draft ${label(runtime)}`;
}

const DRAFT_LOADER_ERROR = ZPLC_CONTRACT.LOADER_ERRORS.find((entry) => entry.name === 'ZPLC_LOADER_ERR_DRAFT')?.code;

/**
 * The text for a failed zplc_core_load() of a runtime that answers only with the loader code (the WASM module).
 * The runtime number is the one of this Studio build, which the module is built together with.
 */
export function describeLoadFailure(result: number, bytecode: Uint8Array): string {
  if (result === DRAFT_LOADER_ERROR) {
    return draftMismatchMessage(artifactDraftCounter(bytecode), ZPLC_CONSTANTS.DRAFT_COUNTER);
  }
  return `Failed to load program: ${result}`;
}
