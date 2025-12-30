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

// =============================================================================
// Variable Definitions (shared structure with FBD)
// =============================================================================

export interface LDVariable {
  name: string;
  type: string;
  initialValue?: unknown;
  address?: string;        // e.g., "%Q0.0" for physical outputs
  comment?: string;
}

export interface LDVariables {
  local: LDVariable[];
  inputs?: LDVariable[];
  outputs: LDVariable[];
}

// =============================================================================
// Element Types
// =============================================================================

export type LDContactType = 
  | 'contact_no'      // Normally Open (examines ON)
  | 'contact_nc'      // Normally Closed (examines OFF)
  | 'contact_p'       // Positive transition (rising edge)
  | 'contact_n';      // Negative transition (falling edge)

export type LDCoilType =
  | 'coil'            // Standard coil
  | 'coil_negated'    // Negated coil
  | 'coil_set'        // Set/Latch coil (S)
  | 'coil_reset'      // Reset/Unlatch coil (R)
  | 'coil_p'          // Positive transition coil
  | 'coil_n';         // Negative transition coil

export type LDElementType = 
  // Power rails (auto-generated, not placed by user)
  | 'left_rail'
  | 'right_rail'
  // Contacts (inputs)
  | LDContactType
  // Coils (outputs)
  | LDCoilType
  // Function blocks embedded in rungs
  | 'function_block';

// =============================================================================
// Grid-Based Types (NEW)
// =============================================================================

/**
 * A cell in the LD grid. Each cell can contain one element or be empty (wire).
 * Empty cells in a connected path become horizontal wires.
 */
export interface LDCell {
  /** Element in this cell, null = wire/empty */
  element: LDElement | null;
  /** Whether this cell has a wire passing through it */
  hasWire?: boolean;
}

/**
 * Vertical link connecting two rows at a specific column.
 * Creates OR logic (parallel branch).
 * 
 * Visual representation:
 *   Row 0: ─┬─
 *          │
 *   Row 1: ─┴─
 */
export interface LDVerticalLink {
  /** Column where the vertical link is placed */
  col: number;
  /** Starting row (top of the branch) */
  fromRow: number;
  /** Ending row (bottom of the branch) */
  toRow: number;
}

/**
 * A parallel branch region in the ladder rung.
 * Defines where power splits into multiple parallel paths and rejoins.
 * 
 * Visual representation:
 *        startCol              endCol
 *           │                    │
 *           v                    v
 *   ────────┬────[C1]────[C2]───┬────────
 *           │                    │
 *           └────[C3]───────────┘
 *           
 * The branch spans from startCol to endCol, with paths on different rows.
 */
export interface LDBranch {
  /** Unique identifier */
  id: string;
  /** Column where the branch starts (split point) */
  startCol: number;
  /** Column where the branch ends (join point) */
  endCol: number;
  /** Row indices that are part of this branch */
  rows: number[];
  /** Parent branch ID if this is a nested branch */
  parentBranchId?: string;
}

/**
 * Grid dimensions and configuration
 */
export interface LDGridConfig {
  /** Number of columns (excluding power rails) */
  cols: number;
  /** Number of rows (for parallel branches) */
  rows: number;
  /** Cell width in pixels */
  cellWidth: number;
  /** Cell height in pixels */
  cellHeight: number;
}

// Default grid configuration
export const DEFAULT_GRID_CONFIG: LDGridConfig = {
  cols: 8,
  rows: 1,
  cellWidth: 80,
  cellHeight: 60,
};

// =============================================================================
// Position (for legacy compatibility)
// =============================================================================

export interface LDPosition {
  x: number;
  y: number;
}

// =============================================================================
// Element Definition
// =============================================================================

export interface LDElement {
  id: string;
  type: LDElementType;
  
  // Grid position (new grid-based model)
  row?: number;
  col?: number;
  
  // Legacy position (for backward compatibility)
  position?: LDPosition;
  
  // For contacts and coils
  variable?: string;
  
  // For function blocks
  fbType?: string;       // e.g., 'TON', 'CTU'
  instance?: string;     // Instance name
  parameters?: Record<string, string>;  // Input parameter values
  outputs?: Record<string, string>;     // Output variable bindings
  
  // For function blocks: how many rows it spans
  rowSpan?: number;
  
  comment?: string;
}

// =============================================================================
// Connection (legacy - for backward compatibility)
// =============================================================================

export interface LDConnection {
  from: string;   // Element ID (or "elementId.port" for FBs)
  to: string;     // Element ID (or "elementId.port" for FBs)
}

// =============================================================================
// Rung Definition
// =============================================================================

/**
 * A ladder rung - one horizontal "line" of logic.
 * 
 * Supports two modes:
 * 1. Grid-based (new): Uses `grid` and `verticalLinks` for visual editing
 * 2. Linear (legacy): Uses `elements` and `connections` arrays
 */
export interface LDRung {
  id: string;
  number: number;
  comment?: string;
  
  // Grid-based model (NEW - preferred)
  grid?: LDCell[][];                  // 2D array: grid[row][col]
  verticalLinks?: LDVerticalLink[];   // OR branches between rows (legacy, auto-generated)
  branches?: LDBranch[];              // Parallel branch regions (NEW)
  gridConfig?: LDGridConfig;          // Grid dimensions
  
  // Linear model (LEGACY - for backward compatibility)
  elements?: LDElement[];
  connections?: LDConnection[];
}

// =============================================================================
// Metadata
// =============================================================================

export interface LDMetadata {
  author?: string;
  created?: string;
  modified?: string;
  iecStandard?: string;
  elementTypes?: Record<string, string>;
}

// =============================================================================
// Complete LD Model
// =============================================================================

export interface LDModel {
  $schema?: string;
  name: string;
  description?: string;
  version?: string;
  
  variables: LDVariables;
  rungs: LDRung[];
  
  // Default grid configuration for all rungs
  defaultGridConfig?: LDGridConfig;
  
  metadata?: LDMetadata;
}

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
      return '| |';      // --| |--
    case 'contact_nc':
      return '|/|';      // --|/|--
    case 'contact_p':
      return '|P|';      // --|P|--
    case 'contact_n':
      return '|N|';      // --|N|--
    case 'coil':
      return '( )';      // --( )--
    case 'coil_negated':
      return '(/)';      // --(/)--
    case 'coil_set':
      return '(S)';      // --(S)--
    case 'coil_reset':
      return '(R)';      // --(R)--
    case 'coil_p':
      return '(P)';      // --(P)--
    case 'coil_n':
      return '(N)';      // --(N)--
    case 'function_block':
      return '[FB]';
    default:
      return '???';
  }
}

/**
 * Get element description for tooltips
 */
export function getElementDescription(type: LDElementType): string {
  switch (type) {
    case 'left_rail':
      return 'Left Power Rail (L1)';
    case 'right_rail':
      return 'Right Power Rail (L2/N)';
    case 'contact_no':
      return 'Normally Open Contact (XIC - Examine If Closed)';
    case 'contact_nc':
      return 'Normally Closed Contact (XIO - Examine If Open)';
    case 'contact_p':
      return 'Positive Transition Contact (Rising Edge)';
    case 'contact_n':
      return 'Negative Transition Contact (Falling Edge)';
    case 'coil':
      return 'Standard Coil (OTE - Output Energize)';
    case 'coil_negated':
      return 'Negated Coil (Output when rung is false)';
    case 'coil_set':
      return 'Set/Latch Coil (OTL - Output Latch)';
    case 'coil_reset':
      return 'Reset/Unlatch Coil (OTU - Output Unlatch)';
    case 'coil_p':
      return 'Positive Transition Coil (Pulse on rising edge)';
    case 'coil_n':
      return 'Negative Transition Coil (Pulse on falling edge)';
    case 'function_block':
      return 'Embedded Function Block (Timer, Counter, etc.)';
    default:
      return 'Unknown Element';
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
export function createContact(
  type: LDContactType,
  variable: string,
  row: number = 0,
  col: number = 0
): LDElement {
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
export function createCoil(
  type: LDCoilType,
  variable: string,
  row: number = 0,
  col: number = 0
): LDElement {
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
  rowSpan: number = 2
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
  const newGrid = rung.grid.map(r => [...r]);
  
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
  
  const newGrid = rung.grid.map(r => [...r]);
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
  const isDuplicate = existingLinks.some(
    l => l.col === col && l.fromRow === fromRow && l.toRow === toRow
  );
  
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
export function createBranch(
  rung: LDRung,
  startCol: number,
  endCol: number,
  sourceRow: number = 0
): LDRung {
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
export function createNestedBranch(
  rung: LDRung,
  parentBranchId: string,
  startCol: number,
  endCol: number,
  sourceRow: number
): LDRung {
  if (!rung.grid || !rung.gridConfig || !rung.branches) {
    return rung;
  }
  
  const parentBranch = rung.branches.find(b => b.id === parentBranchId);
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
  const updatedBranches = rung.branches.map(b => {
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
  
  const branch = rung.branches.find(b => b.id === branchId);
  if (!branch) {
    return rung;
  }
  
  // Remove nested branches first
  const nestedBranches = rung.branches.filter(b => b.parentBranchId === branchId);
  let result = rung;
  for (const nested of nestedBranches) {
    result = removeBranch(result, nested.id);
  }
  
  // Remove the branch from the list
  const updatedBranches = (result.branches || []).filter(b => b.id !== branchId);
  
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
  
  return rung.branches.filter(branch => 
    branch.rows.includes(row) &&
    col >= branch.startCol &&
    col <= branch.endCol
  );
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
  const realElements = elements.filter(e => !isPowerRail(e.type));
  
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
 * Parse a JSON string into an LDModel
 */
export function parseLDModel(json: string): LDModel {
  const parsed = JSON.parse(json) as LDModel;
  
  // Auto-convert legacy rungs to grid-based
  if (parsed.rungs) {
    parsed.rungs = parsed.rungs.map(rung => {
      if (!isGridBasedRung(rung) && rung.elements) {
        return convertToGridRung(rung);
      }
      return rung;
    });
  }
  
  return parsed;
}

/**
 * Serialize an LDModel to JSON
 */
export function serializeLDModel(model: LDModel): string {
  return JSON.stringify(model, null, 2);
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
 * Get all available toolbox items
 */
export function getToolboxItems(): LDToolboxItem[] {
  return [
    // Contacts
    { type: 'contact_no', label: 'NO Contact', symbol: '| |', category: 'contact' },
    { type: 'contact_nc', label: 'NC Contact', symbol: '|/|', category: 'contact' },
    { type: 'contact_p', label: 'P Contact', symbol: '|P|', category: 'contact' },
    { type: 'contact_n', label: 'N Contact', symbol: '|N|', category: 'contact' },
    // Coils
    { type: 'coil', label: 'Coil', symbol: '( )', category: 'coil' },
    { type: 'coil_negated', label: 'Neg Coil', symbol: '(/)', category: 'coil' },
    { type: 'coil_set', label: 'Set Coil', symbol: '(S)', category: 'coil' },
    { type: 'coil_reset', label: 'Reset Coil', symbol: '(R)', category: 'coil' },
    // Structure
    { type: 'branch', label: 'Branch', symbol: '├┤', category: 'structure' },
    // Function Blocks
    { type: 'function_block', label: 'TON', symbol: 'TON', category: 'function_block', fbType: 'TON' },
    { type: 'function_block', label: 'TOF', symbol: 'TOF', category: 'function_block', fbType: 'TOF' },
    { type: 'function_block', label: 'TP', symbol: 'TP', category: 'function_block', fbType: 'TP' },
    { type: 'function_block', label: 'CTU', symbol: 'CTU', category: 'function_block', fbType: 'CTU' },
    { type: 'function_block', label: 'CTD', symbol: 'CTD', category: 'function_block', fbType: 'CTD' },
    { type: 'function_block', label: 'R_TRIG', symbol: 'R↑', category: 'function_block', fbType: 'R_TRIG' },
    { type: 'function_block', label: 'F_TRIG', symbol: 'F↓', category: 'function_block', fbType: 'F_TRIG' },
    // Bistables
    { type: 'function_block', label: 'RS', symbol: 'RS', category: 'function_block', fbType: 'RS' },
    { type: 'function_block', label: 'SR', symbol: 'SR', category: 'function_block', fbType: 'SR' },
    // Counters (extended)
    { type: 'function_block', label: 'CTUD', symbol: 'CTUD', category: 'function_block', fbType: 'CTUD' },
    // Generators
    { type: 'function_block', label: 'BLINK', symbol: 'BLNK', category: 'function_block', fbType: 'BLINK' },
    { type: 'function_block', label: 'PWM', symbol: 'PWM', category: 'function_block', fbType: 'PWM' },
    { type: 'function_block', label: 'PULSE', symbol: 'PLS', category: 'function_block', fbType: 'PULSE' },
    // Process Control
    { type: 'function_block', label: 'HYSTERESIS', symbol: 'HYST', category: 'function_block', fbType: 'HYSTERESIS' },
    { type: 'function_block', label: 'DEADBAND', symbol: 'DEAD', category: 'function_block', fbType: 'DEADBAND' },
    { type: 'function_block', label: 'LAG_FILTER', symbol: 'LAG', category: 'function_block', fbType: 'LAG_FILTER' },
    { type: 'function_block', label: 'RAMP_REAL', symbol: 'RAMP', category: 'function_block', fbType: 'RAMP_REAL' },
    { type: 'function_block', label: 'INTEGRAL', symbol: '∫', category: 'function_block', fbType: 'INTEGRAL' },
    { type: 'function_block', label: 'DERIVATIVE', symbol: 'd/dt', category: 'function_block', fbType: 'DERIVATIVE' },
    { type: 'function_block', label: 'PID', symbol: 'PID', category: 'function_block', fbType: 'PID_Compact' },
    // System Buffers
    { type: 'function_block', label: 'FIFO', symbol: 'FIFO', category: 'function_block', fbType: 'FIFO' },
    { type: 'function_block', label: 'LIFO', symbol: 'LIFO', category: 'function_block', fbType: 'LIFO' },
  ];
}
