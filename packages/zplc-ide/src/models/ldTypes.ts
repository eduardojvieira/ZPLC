/**
 * LD (Ladder Diagram) model types: the shapes of the JSON used for visual editing (IDE-014: split out of ld.ts).
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
