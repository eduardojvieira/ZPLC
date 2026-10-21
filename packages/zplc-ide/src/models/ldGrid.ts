/**
 * Operations on LD rungs: placing and removing elements, branches and vertical links, and the conversions between the
 * legacy linear and the grid-based layouts (IDE-014: split out of ld.ts).
 */

import { t } from '../i18n';
import type {
  LDBranch,
  LDCell,
  LDCoilType,
  LDConnection,
  LDContactType,
  LDElement,
  LDElementType,
  LDGridConfig,
  LDRung,
  LDVerticalLink,
} from './ldTypes';
import { DEFAULT_GRID_CONFIG } from './ldTypes';

// =============================================================================
// Helper Functions - Type Guards
// =============================================================================

/**
 * Check if element is a power rail
 */
export function isPowerRail(type: LDElementType): boolean {
  return type === 'left_rail' || type === 'right_rail';
}

/**
 * Check if element is a contact (input)
 */
export function isContact(type: LDElementType): boolean {
  return type.startsWith('contact_');
}

/**
 * Check if element is a coil (output)
 */
export function isCoil(type: LDElementType): boolean {
  return type.startsWith('coil');
}

/**
 * Check if element is a function block
 */
export function isFunctionBlock(type: LDElementType): boolean {
  return type === 'function_block';
}

/**
 * Check if rung uses grid-based model
 */
export function isGridBasedRung(rung: LDRung): boolean {
  return rung.grid !== undefined && rung.grid.length > 0;
}

// =============================================================================
// Helper Functions - Display
// =============================================================================

/**
 * Get display symbol for element type (ASCII representation)
 */
export function getElementSymbol(type: LDElementType): string {
  switch (type) {
    case 'left_rail':
    case 'right_rail':
      return '|';
    case 'contact_no':
      return '| |'; // --| |--
    case 'contact_nc':
      return '|/|'; // --|/|--
    case 'contact_p':
      return '|P|'; // --|P|--
    case 'contact_n':
      return '|N|'; // --|N|--
    case 'coil':
      return '( )'; // --( )--
    case 'coil_negated':
      return '(/)'; // --(/)--
    case 'coil_set':
      return '(S)'; // --(S)--
    case 'coil_reset':
      return '(R)'; // --(R)--
    case 'coil_p':
      return '(P)'; // --(P)--
    case 'coil_n':
      return '(N)'; // --(N)--
    case 'function_block':
      return '[FB]';
    default:
      return '???';
  }
}

/** Get element description for tooltips */
export function getElementDescription(type: LDElementType): string {
  switch (type) {
    case 'left_rail':
      return t('ld.desc.left_rail');
    case 'right_rail':
      return t('ld.desc.right_rail');
    case 'contact_no':
      return t('ld.desc.contact_no');
    case 'contact_nc':
      return t('ld.desc.contact_nc');
    case 'contact_p':
      return t('ld.desc.contact_p');
    case 'contact_n':
      return t('ld.desc.contact_n');
    case 'coil':
      return t('ld.desc.coil');
    case 'coil_negated':
      return t('ld.desc.coil_negated');
    case 'coil_set':
      return t('ld.desc.coil_set');
    case 'coil_reset':
      return t('ld.desc.coil_reset');
    case 'coil_p':
      return t('ld.desc.coil_p');
    case 'coil_n':
      return t('ld.desc.coil_n');
    case 'function_block':
      return t('ld.desc.function_block');
    default:
      return t('ld.desc.unknown');
  }
}

// =============================================================================
// Helper Functions - Creation
// =============================================================================

/**
 * Create a new empty grid-based rung
 */
export function createEmptyRung(number: number, config?: Partial<LDGridConfig>): LDRung {
  const gridConfig: LDGridConfig = {
    ...DEFAULT_GRID_CONFIG,
    ...config,
  };

  // Create empty grid
  const grid: LDCell[][] = [];
  for (let row = 0; row < gridConfig.rows; row++) {
    const rowCells: LDCell[] = [];
    for (let col = 0; col < gridConfig.cols; col++) {
      rowCells.push({ element: null, hasWire: row === 0 }); // First row has default wire
    }
    grid.push(rowCells);
  }

  return {
    id: `rung_${number}`,
    number,
    grid,
    gridConfig,
    verticalLinks: [],
  };
}

/**
 * Create a contact element
 */
export function createContact(type: LDContactType, variable: string, row: number = 0, col: number = 0): LDElement {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    variable,
    row,
    col,
  };
}

/**
 * Create a coil element
 */
export function createCoil(type: LDCoilType, variable: string, row: number = 0, col: number = 0): LDElement {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    variable,
    row,
    col,
  };
}

/**
 * Create a function block element
 */
export function createFunctionBlock(
  fbType: string,
  instanceName: string,
  row: number = 0,
  col: number = 0,
  rowSpan: number = 2,
): LDElement {
  return {
    id: `fb_${fbType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'function_block',
    fbType,
    instance: instanceName,
    row,
    col,
    rowSpan,
    parameters: {},
    outputs: {},
  };
}

// =============================================================================
// Helper Functions - Grid Operations
// =============================================================================

/**
 * Get element at a specific grid position
 */
export function getElementAt(rung: LDRung, row: number, col: number): LDElement | null {
  if (!rung.grid || row >= rung.grid.length || col >= rung.grid[0]?.length) {
    return null;
  }
  return rung.grid[row][col].element;
}

/**
 * Place element at a specific grid position
 */
export function placeElement(rung: LDRung, element: LDElement, row: number, col: number): LDRung {
  if (!rung.grid) {
    return rung; // Not a grid-based rung
  }

  // Ensure grid is large enough
  const newGrid = rung.grid.map((r) => [...r]);

  // Expand rows if needed
  while (newGrid.length <= row) {
    const newRow: LDCell[] = [];
    for (let c = 0; c < (rung.gridConfig?.cols || DEFAULT_GRID_CONFIG.cols); c++) {
      newRow.push({ element: null, hasWire: false });
    }
    newGrid.push(newRow);
  }

  // Place element
  const elementWithPosition: LDElement = { ...element, row, col };
  newGrid[row][col] = { element: elementWithPosition, hasWire: true };

  return {
    ...rung,
    grid: newGrid,
    gridConfig: {
      ...rung.gridConfig!,
      rows: Math.max(rung.gridConfig?.rows || 1, row + 1),
    },
  };
}

/**
 * Remove element from a specific grid position
 */
export function removeElementAt(rung: LDRung, row: number, col: number): LDRung {
  if (!rung.grid || row >= rung.grid.length || col >= rung.grid[0]?.length) {
    return rung;
  }

  const newGrid = rung.grid.map((r) => [...r]);
  newGrid[row][col] = { element: null, hasWire: newGrid[row][col].hasWire };

  return {
    ...rung,
    grid: newGrid,
  };
}

/**
 * Add a vertical link (parallel branch) between rows
 */
export function addVerticalLink(rung: LDRung, col: number, fromRow: number, toRow: number): LDRung {
  const link: LDVerticalLink = { col, fromRow, toRow };
  const existingLinks = rung.verticalLinks || [];

  // Check for duplicate
  const isDuplicate = existingLinks.some((l) => l.col === col && l.fromRow === fromRow && l.toRow === toRow);

  if (isDuplicate) return rung;

  return {
    ...rung,
    verticalLinks: [...existingLinks, link],
  };
}

/**
 * Add a new row to the rung (for parallel branches)
 */
export function addRow(rung: LDRung): LDRung {
  if (!rung.grid || !rung.gridConfig) {
    return rung;
  }

  const cols = rung.gridConfig.cols;
  const newRow: LDCell[] = [];
  for (let c = 0; c < cols; c++) {
    newRow.push({ element: null, hasWire: false });
  }

  return {
    ...rung,
    grid: [...rung.grid, newRow],
    gridConfig: {
      ...rung.gridConfig,
      rows: rung.gridConfig.rows + 1,
    },
  };
}

// =============================================================================
// Helper Functions - Branch Operations
// =============================================================================

/**
 * Create a new parallel branch in the rung.
 * This adds a new row and creates a branch structure connecting them.
 *
 * @param rung - The rung to modify
 * @param startCol - Column where the branch starts (split point)
 * @param endCol - Column where the branch ends (join point)
 * @param sourceRow - The row to branch from (default 0)
 * @returns Updated rung with new branch
 */
export function createBranch(rung: LDRung, startCol: number, endCol: number, sourceRow: number = 0): LDRung {
  if (!rung.grid || !rung.gridConfig) {
    return rung;
  }

  // Add a new row for the branch
  const newRowIndex = rung.grid.length;
  const cols = rung.gridConfig.cols;
  const newRow: LDCell[] = [];

  // The new row has wires only within the branch region
  for (let c = 0; c < cols; c++) {
    const isInBranch = c >= startCol && c <= endCol;
    newRow.push({ element: null, hasWire: isInBranch });
  }

  const newGrid = [...rung.grid, newRow];

  // Create the branch definition
  const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newBranch: LDBranch = {
    id: branchId,
    startCol,
    endCol,
    rows: [sourceRow, newRowIndex],
  };

  const existingBranches = rung.branches || [];

  return {
    ...rung,
    grid: newGrid,
    branches: [...existingBranches, newBranch],
    gridConfig: {
      ...rung.gridConfig,
      rows: rung.gridConfig.rows + 1,
    },
  };
}

/**
 * Create a nested branch (sub-branch inside an existing branch).
 *
 * @param rung - The rung to modify
 * @param parentBranchId - ID of the parent branch
 * @param startCol - Column where the sub-branch starts
 * @param endCol - Column where the sub-branch ends
 * @param sourceRow - The row within the parent to branch from
 * @returns Updated rung with nested branch
 */
export function createNestedBranch(rung: LDRung, parentBranchId: string, startCol: number, endCol: number, sourceRow: number): LDRung {
  if (!rung.grid || !rung.gridConfig || !rung.branches) {
    return rung;
  }

  const parentBranch = rung.branches.find((b) => b.id === parentBranchId);
  if (!parentBranch) {
    console.warn('Parent branch not found:', parentBranchId);
    return rung;
  }

  // Validate that the sub-branch fits within the parent
  if (startCol < parentBranch.startCol || endCol > parentBranch.endCol) {
    console.warn('Sub-branch exceeds parent branch bounds');
    return rung;
  }

  // Add a new row for the sub-branch
  const newRowIndex = rung.grid.length;
  const cols = rung.gridConfig.cols;
  const newRow: LDCell[] = [];

  for (let c = 0; c < cols; c++) {
    const isInBranch = c >= startCol && c <= endCol;
    newRow.push({ element: null, hasWire: isInBranch });
  }

  const newGrid = [...rung.grid, newRow];

  // Create the nested branch definition
  const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newBranch: LDBranch = {
    id: branchId,
    startCol,
    endCol,
    rows: [sourceRow, newRowIndex],
    parentBranchId,
  };

  // Update parent branch to include the new row
  const updatedBranches = rung.branches.map((b) => {
    if (b.id === parentBranchId) {
      return { ...b, rows: [...b.rows, newRowIndex] };
    }
    return b;
  });

  return {
    ...rung,
    grid: newGrid,
    branches: [...updatedBranches, newBranch],
    gridConfig: {
      ...rung.gridConfig,
      rows: rung.gridConfig.rows + 1,
    },
  };
}

/**
 * Remove a branch and its associated row (if empty).
 */
export function removeBranch(rung: LDRung, branchId: string): LDRung {
  if (!rung.branches) {
    return rung;
  }

  const branch = rung.branches.find((b) => b.id === branchId);
  if (!branch) {
    return rung;
  }

  // Remove nested branches first
  const nestedBranches = rung.branches.filter((b) => b.parentBranchId === branchId);
  let result = rung;
  for (const nested of nestedBranches) {
    result = removeBranch(result, nested.id);
  }

  // Remove the branch from the list
  const updatedBranches = (result.branches || []).filter((b) => b.id !== branchId);

  return {
    ...result,
    branches: updatedBranches,
  };
}

/**
 * Get all branches that include a specific cell.
 */
export function getBranchesAtCell(rung: LDRung, row: number, col: number): LDBranch[] {
  if (!rung.branches) {
    return [];
  }

  return rung.branches.filter((branch) => branch.rows.includes(row) && col >= branch.startCol && col <= branch.endCol);
}

/**
 * Generate vertical links from branch definitions.
 * This is used for backward compatibility and rendering.
 */
export function generateVerticalLinksFromBranches(rung: LDRung): LDVerticalLink[] {
  if (!rung.branches) {
    return rung.verticalLinks || [];
  }

  const links: LDVerticalLink[] = [];

  for (const branch of rung.branches) {
    const rows = [...branch.rows].sort((a, b) => a - b);
    const minRow = rows[0];
    const maxRow = rows[rows.length - 1];

    // Add vertical link at start column
    links.push({
      col: branch.startCol,
      fromRow: minRow,
      toRow: maxRow,
    });

    // Add vertical link at end column
    links.push({
      col: branch.endCol,
      fromRow: minRow,
      toRow: maxRow,
    });
  }

  return links;
}

// =============================================================================
// Helper Functions - Conversion
// =============================================================================

/**
 * Convert legacy linear rung to grid-based rung
 *
 * Takes a rung with elements/connections arrays and converts to grid format.
 */
export function convertToGridRung(rung: LDRung): LDRung {
  if (isGridBasedRung(rung)) {
    return rung; // Already grid-based
  }

  const elements = rung.elements || [];

  // Filter out power rails (they're auto-generated in grid view)
  const realElements = elements.filter((e) => !isPowerRail(e.type));

  // Sort by X position
  realElements.sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0));

  // Determine grid size
  const numCols = Math.max(8, realElements.length);

  // Create grid
  const grid: LDCell[][] = [[]];
  for (let col = 0; col < numCols; col++) {
    grid[0].push({ element: null, hasWire: true });
  }

  // Place elements in grid based on their X position
  realElements.forEach((element, idx) => {
    const col = Math.min(idx, numCols - 1);
    grid[0][col] = {
      element: { ...element, row: 0, col },
      hasWire: true,
    };
  });

  return {
    id: rung.id,
    number: rung.number,
    comment: rung.comment,
    grid,
    gridConfig: {
      cols: numCols,
      rows: 1,
      cellWidth: DEFAULT_GRID_CONFIG.cellWidth,
      cellHeight: DEFAULT_GRID_CONFIG.cellHeight,
    },
    verticalLinks: [],
  };
}

/**
 * Convert grid-based rung back to legacy format (for export/compatibility)
 */
export function convertToLegacyRung(rung: LDRung): LDRung {
  if (!isGridBasedRung(rung)) {
    return rung; // Already legacy
  }

  const elements: LDElement[] = [];
  const connections: LDConnection[] = [];

  const cellWidth = rung.gridConfig?.cellWidth || DEFAULT_GRID_CONFIG.cellWidth;
  const cellHeight = rung.gridConfig?.cellHeight || DEFAULT_GRID_CONFIG.cellHeight;

  // Add left rail
  const leftRailId = `${rung.id}_left_rail`;
  elements.push({
    id: leftRailId,
    type: 'left_rail',
    position: { x: 0, y: 0 },
  });

  let prevElementId = leftRailId;

  // Collect elements from grid
  rung.grid?.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      if (cell.element) {
        const element: LDElement = {
          ...cell.element,
          position: {
            x: (colIdx + 1) * cellWidth,
            y: rowIdx * cellHeight,
          },
        };
        elements.push(element);

        // Add connection from previous element (simplified - series only)
        if (rowIdx === 0) {
          connections.push({ from: prevElementId, to: element.id });
          prevElementId = element.id;
        }
      }
    });
  });

  // Add right rail
  const rightRailId = `${rung.id}_right_rail`;
  const numCols = rung.gridConfig?.cols || DEFAULT_GRID_CONFIG.cols;
  elements.push({
    id: rightRailId,
    type: 'right_rail',
    position: { x: (numCols + 1) * cellWidth, y: 0 },
  });

  connections.push({ from: prevElementId, to: rightRailId });

  return {
    id: rung.id,
    number: rung.number,
    comment: rung.comment,
    elements,
    connections,
  };
}

// =============================================================================
// Helper Functions - Serialization
// =============================================================================

/**
 * Normalize a grid-based rung to ensure proper sizing and wire flags.
 *
 * This function:
 * 1. Pads the grid to the expected number of columns
 * 2. Filters out power rails from the grid (they're auto-generated)
 * 3. Ensures row 0 has hasWire=true for all cells
 * 4. Sets proper hasWire flags based on element positions
 */
export function normalizeGridRung(rung: LDRung): LDRung {
  if (!rung.grid || rung.grid.length === 0) {
    return rung;
  }

  const config = rung.gridConfig || DEFAULT_GRID_CONFIG;
  const targetCols = config.cols;

  // Create normalized grid
  const newGrid: LDCell[][] = [];

  for (let rowIdx = 0; rowIdx < rung.grid.length; rowIdx++) {
    const sourceRow = rung.grid[rowIdx] || [];
    const newRow: LDCell[] = [];

    // Filter out power rails and track element positions
    const elementsInRow: { element: LDElement; col: number }[] = [];

    let colOffset = 0;
    for (let colIdx = 0; colIdx < sourceRow.length; colIdx++) {
      const cell = sourceRow[colIdx];
      if (cell.element) {
        // Skip power rails - they're auto-generated
        if (isPowerRail(cell.element.type)) {
          continue;
        }
        elementsInRow.push({ element: cell.element, col: colIdx - colOffset });
      }
      // Track how many power rails we've skipped to adjust positions
      if (cell.element && isPowerRail(cell.element.type)) {
        colOffset++;
      }
    }

    // Build the new row with proper sizing
    for (let colIdx = 0; colIdx < targetCols; colIdx++) {
      // Check if there's an element at this position
      const elementEntry = elementsInRow.find((e) => e.col === colIdx);

      if (elementEntry) {
        // Cell with element - ensure row/col are set correctly
        const elementWithPosition: LDElement = {
          ...elementEntry.element,
          row: rowIdx,
          col: colIdx,
        };
        newRow.push({ element: elementWithPosition, hasWire: true });
      } else {
        // Empty cell - main row (0) should always have wire for continuity
        // Branch rows only have wire within the branch region
        const hasWire = rowIdx === 0;
        newRow.push({ element: null, hasWire });
      }
    }

    newGrid.push(newRow);
  }

  // If grid is empty, create a single row with wires
  if (newGrid.length === 0) {
    const emptyRow: LDCell[] = [];
    for (let col = 0; col < targetCols; col++) {
      emptyRow.push({ element: null, hasWire: true });
    }
    newGrid.push(emptyRow);
  }

  // Update branch row wires
  if (rung.branches) {
    for (const branch of rung.branches) {
      for (const rowIdx of branch.rows) {
        if (rowIdx > 0 && rowIdx < newGrid.length) {
          // Set hasWire for cells within the branch region
          for (let col = branch.startCol; col <= branch.endCol && col < targetCols; col++) {
            if (newGrid[rowIdx][col]) {
              newGrid[rowIdx][col].hasWire = true;
            }
          }
        }
      }
    }
  }

  return {
    ...rung,
    grid: newGrid,
    gridConfig: {
      ...config,
      rows: newGrid.length,
    },
  };
}
