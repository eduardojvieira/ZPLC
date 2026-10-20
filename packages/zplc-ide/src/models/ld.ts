/**
 * LD (Ladder Diagram) Model Types
 * 
 * TypeScript types matching the LD JSON schema used for visual editing.
 * Based on IEC 61131-3 LD language specification.
 * 
 * This model supports:
 * - Grid-based rung layout (rows x columns)
 * - Parallel branches (OR logic via vertical links)
 * - Series connections (AND logic via horizontal adjacency)
 * - Backward compatibility with legacy linear models
 */

import { serializeVisualDocument } from './visualFileFormat';
export * from './ldTypes';
export * from './ldGrid';
import type { LDElementType, LDModel } from './ldTypes';
import { convertToGridRung, isGridBasedRung, normalizeGridRung } from './ldGrid';
import { LD_COIL_TYPES, LD_CONTACT_TYPES, ldPaletteFunctionBlocks } from './ldSupport';
import type { ProjectBlock } from './projectBlocks';
import { t } from '../i18n';

/**
 * Parse a JSON string into an LDModel
 */
export function parseLDModel(json: string): LDModel {
  const parsed = JSON.parse(json) as LDModel;
  
  // Auto-convert and normalize rungs
  if (parsed.rungs) {
    parsed.rungs = parsed.rungs.map(rung => {
      if (!isGridBasedRung(rung) && rung.elements) {
        return normalizeGridRung(convertToGridRung(rung));
      }
      // Normalize existing grid-based rungs
      return normalizeGridRung(rung);
    });
  }
  
  return parsed;
}

/**
 * Serialize an LDModel to JSON
 */
export function serializeLDModel(model: LDModel): string {
  return serializeVisualDocument(model);
}

// =============================================================================
// Helper Functions - Toolbox Categories
// =============================================================================

export interface LDToolboxItem {
  type: LDElementType | string;
  label: string;
  symbol: string;
  category: 'contact' | 'coil' | 'function_block' | 'structure';
  fbType?: string;
}

/**
 * Get all available toolbox items. `blocks` are the function blocks and functions the project declares: the
 * function blocks among them are placeable like the standard ones (LNG-008); a function is not, a rung has
 * no value to pass to it.
 */
export function getToolboxItems(blocks: readonly ProjectBlock[] = []): LDToolboxItem[] {
  // the function blocks a rung can hold, from the table the transpiler reads (LNG-007)
  const functionBlocks = ldPaletteFunctionBlocks(blocks).map((fbType) => ({
    type: 'function_block' as const,
    label: fbType,
    symbol: fbType.length > 6 ? fbType.slice(0, 6) : fbType,
    category: 'function_block' as const,
    fbType,
  }));

  return [
    ...LD_CONTACT_TYPES.map((type) => ({ type, ...paletteFace()[type], category: 'contact' as const })),
    ...LD_COIL_TYPES.map((type) => ({ type, ...paletteFace()[type], category: 'coil' as const })),
    // Structure
    { type: 'branch', label: t('ld.face.branch'), symbol: '├┤', category: 'structure' },
    ...functionBlocks,
  ];
}

/** What the palette shows for each contact and coil: a face for every type of the table, or it does not compile. */
const paletteFace = (): Record<(typeof LD_CONTACT_TYPES)[number] | (typeof LD_COIL_TYPES)[number], { label: string; symbol: string }> => ({
  contact_no: { label: t('ld.face.contact_no'), symbol: '| |' },
  contact_nc: { label: t('ld.face.contact_nc'), symbol: '|/|' },
  contact_p: { label: t('ld.face.contact_p'), symbol: '|P|' },
  contact_n: { label: t('ld.face.contact_n'), symbol: '|N|' },
  coil: { label: t('ld.face.coil'), symbol: '( )' },
  coil_negated: { label: t('ld.face.coil_negated'), symbol: '(/)' },
  coil_set: { label: t('ld.face.coil_set'), symbol: '(S)' },
  coil_reset: { label: t('ld.face.coil_reset'), symbol: '(R)' },
  coil_p: { label: t('ld.face.coil_p'), symbol: '(P)' },
  coil_n: { label: t('ld.face.coil_n'), symbol: '(N)' },
});
