/**
 * FBD (Function Block Diagram) Model Types
 * 
 * TypeScript types matching the FBD JSON schema used for visual editing.
 * Based on IEC 61131-3 FBD language specification.
 */

// =============================================================================
// Variable Definitions
// =============================================================================

export interface FBDVariable {
  name: string;
  type: string;
  initialValue?: unknown;
  address?: string;        // e.g., "%Q0.0" for physical outputs
  comment?: string;
}

export interface FBDVariables {
  local: FBDVariable[];
  inputs?: FBDVariable[];
  outputs: FBDVariable[];
}

// =============================================================================
// Block Port Definitions
// =============================================================================

export interface FBDPort {
  name: string;
  type: string;
}

// =============================================================================
// Block Types
// =============================================================================

export type FBDBlockType = 
  // Special blocks
  | 'constant'
  | 'variable'
  | 'output'
  | 'input'
  // Logic gates
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'XOR'
  | 'NAND'
  | 'NOR'
  // Timers (from stdlib)
  | 'TON'
  | 'TOF'
  | 'TP'
  // Counters (from stdlib)
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  // Edge detection (from stdlib)
  | 'R_TRIG'
  | 'F_TRIG'
  // Bistables (from stdlib)
  | 'SR'
  | 'RS'
  // Comparison
  | 'EQ'
  | 'NE'
  | 'LT'
  | 'LE'
  | 'GT'
  | 'GE'
  // Math
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'ABS'
  // Functions
  | 'MAX'
  | 'MIN'
  | 'LIMIT'
  | 'SEL'
  | 'MUX';

// =============================================================================
// Block Definition
// =============================================================================

export interface FBDPosition {
  x: number;
  y: number;
}

export interface FBDBlock {
  id: string;
  type: FBDBlockType | string;  // Allow custom types
  instanceName?: string;        // For FBs that need instances (timers, etc.)
  position: FBDPosition;
  inputs?: FBDPort[];
  outputs?: FBDPort[];
  
  // For constant blocks
  dataType?: string;
  value?: unknown;
  
  // For variable/output/input blocks
  variableName?: string;
  
  comment?: string;
}

// =============================================================================
// Connection Definition
// =============================================================================

export interface FBDConnectionEndpoint {
  block: string;   // Block ID
  port: string;    // Port name
}

export interface FBDConnection {
  id: string;
  from: FBDConnectionEndpoint;
  to: FBDConnectionEndpoint;
}

// =============================================================================
// Metadata
// =============================================================================

export interface FBDMetadata {
  author?: string;
  created?: string;
  modified?: string;
  iecStandard?: string;
  blockCategories?: Record<string, string[]>;
}

// =============================================================================
// Complete FBD Model
// =============================================================================

export interface FBDModel {
  $schema?: string;
  name: string;
  description?: string;
  version?: string;
  
  variables: FBDVariables;
  blocks: FBDBlock[];
  connections: FBDConnection[];
  
  metadata?: FBDMetadata;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a JSON string into an FBDModel
 */
export function parseFBDModel(json: string): FBDModel {
  const parsed = JSON.parse(json) as FBDModel;
  // TODO: Add validation
  return parsed;
}

/**
 * Serialize an FBDModel to JSON
 */
export function serializeFBDModel(model: FBDModel): string {
  return JSON.stringify(model, null, 2);
}

/**
 * Check if a block type is a function block (needs instance)
 */
export function isFunctionBlock(type: string): boolean {
  const fbTypes = [
    'TON', 'TOF', 'TP',
    'CTU', 'CTD', 'CTUD',
    'R_TRIG', 'F_TRIG',
    'SR', 'RS'
  ];
  return fbTypes.includes(type);
}

/**
 * Check if a block type is a logic gate
 */
export function isLogicGate(type: string): boolean {
  return ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'].includes(type);
}

/**
 * Check if a block type is a comparison operator
 */
export function isComparison(type: string): boolean {
  return ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(type);
}

/**
 * Check if a block type is a math operator
 */
export function isMathOperator(type: string): boolean {
  return ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'ABS'].includes(type);
}

/**
 * Get the default ports for a block type
 */
export function getDefaultPorts(type: string): { inputs: FBDPort[], outputs: FBDPort[] } {
  switch (type) {
    case 'constant':
      return {
        inputs: [],
        outputs: [{ name: 'OUT', type: 'ANY' }]
      };
    case 'variable':
    case 'input':
      return {
        inputs: [{ name: 'IN', type: 'ANY' }],
        outputs: [{ name: 'OUT', type: 'ANY' }]
      };
    case 'output':
      return {
        inputs: [{ name: 'IN', type: 'ANY' }],
        outputs: []
      };
    case 'NOT':
      return {
        inputs: [{ name: 'IN', type: 'BOOL' }],
        outputs: [{ name: 'OUT', type: 'BOOL' }]
      };
    case 'AND':
    case 'OR':
    case 'XOR':
    case 'NAND':
    case 'NOR':
      return {
        inputs: [
          { name: 'IN1', type: 'BOOL' },
          { name: 'IN2', type: 'BOOL' }
        ],
        outputs: [{ name: 'OUT', type: 'BOOL' }]
      };
    case 'TON':
    case 'TOF':
    case 'TP':
      return {
        inputs: [
          { name: 'IN', type: 'BOOL' },
          { name: 'PT', type: 'TIME' }
        ],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'ET', type: 'TIME' }
        ]
      };
    case 'R_TRIG':
    case 'F_TRIG':
      return {
        inputs: [{ name: 'CLK', type: 'BOOL' }],
        outputs: [{ name: 'Q', type: 'BOOL' }]
      };
    case 'SR':
      return {
        inputs: [
          { name: 'S1', type: 'BOOL' },
          { name: 'R', type: 'BOOL' }
        ],
        outputs: [{ name: 'Q1', type: 'BOOL' }]
      };
    case 'RS':
      return {
        inputs: [
          { name: 'S', type: 'BOOL' },
          { name: 'R1', type: 'BOOL' }
        ],
        outputs: [{ name: 'Q1', type: 'BOOL' }]
      };
    case 'CTU':
      return {
        inputs: [
          { name: 'CU', type: 'BOOL' },
          { name: 'R', type: 'BOOL' },
          { name: 'PV', type: 'INT' }
        ],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'CV', type: 'INT' }
        ]
      };
    case 'CTD':
      return {
        inputs: [
          { name: 'CD', type: 'BOOL' },
          { name: 'LD', type: 'BOOL' },
          { name: 'PV', type: 'INT' }
        ],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'CV', type: 'INT' }
        ]
      };
    case 'CTUD':
      return {
        inputs: [
          { name: 'CU', type: 'BOOL' },
          { name: 'CD', type: 'BOOL' },
          { name: 'R', type: 'BOOL' },
          { name: 'LD', type: 'BOOL' },
          { name: 'PV', type: 'INT' }
        ],
        outputs: [
          { name: 'QU', type: 'BOOL' },
          { name: 'QD', type: 'BOOL' },
          { name: 'CV', type: 'INT' }
        ]
      };
    case 'EQ':
    case 'NE':
    case 'LT':
    case 'LE':
    case 'GT':
    case 'GE':
      return {
        inputs: [
          { name: 'IN1', type: 'ANY' },
          { name: 'IN2', type: 'ANY' }
        ],
        outputs: [{ name: 'OUT', type: 'BOOL' }]
      };
    case 'ADD':
    case 'SUB':
    case 'MUL':
    case 'DIV':
    case 'MOD':
      return {
        inputs: [
          { name: 'IN1', type: 'ANY_NUM' },
          { name: 'IN2', type: 'ANY_NUM' }
        ],
        outputs: [{ name: 'OUT', type: 'ANY_NUM' }]
      };
    case 'ABS':
      return {
        inputs: [{ name: 'IN', type: 'ANY_NUM' }],
        outputs: [{ name: 'OUT', type: 'ANY_NUM' }]
      };
    case 'MAX':
    case 'MIN':
      return {
        inputs: [
          { name: 'IN1', type: 'ANY_NUM' },
          { name: 'IN2', type: 'ANY_NUM' }
        ],
        outputs: [{ name: 'OUT', type: 'ANY_NUM' }]
      };
    case 'LIMIT':
      return {
        inputs: [
          { name: 'MN', type: 'ANY_NUM' },
          { name: 'IN', type: 'ANY_NUM' },
          { name: 'MX', type: 'ANY_NUM' }
        ],
        outputs: [{ name: 'OUT', type: 'ANY_NUM' }]
      };
    case 'SEL':
      return {
        inputs: [
          { name: 'G', type: 'BOOL' },
          { name: 'IN0', type: 'ANY' },
          { name: 'IN1', type: 'ANY' }
        ],
        outputs: [{ name: 'OUT', type: 'ANY' }]
      };
    default:
      return {
        inputs: [{ name: 'IN', type: 'ANY' }],
        outputs: [{ name: 'OUT', type: 'ANY' }]
      };
  }
}
