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
  | 'MUX'
  // Communication
  | 'COMM_PUBLISH'
  | 'COMM_SUBSCRIBE'
  | 'COMM_MODBUS'
  | 'COMM_CONNECT'
  | 'MB_COIL'
  | 'MB_DISCRETE_INPUT'
  | 'MB_INPUT_REGISTER'
  | 'MB_HOLDING_REGISTER';

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
  address?: string;
  
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
  return validateFBDModel(JSON.parse(json));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid FBD ${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid FBD ${label}: expected non-empty string`);
  }
  return value;
}

function endpointKey(block: string, port: string): string {
  return JSON.stringify([block, port]);
}

function ports(value: unknown, label: string): FBDPort[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid FBD ${label}: expected array`);
  }
  const names = new Set<string>();
  return value.map((port, index) => {
    const source = record(port, `${label}[${index}]`);
    const name = nonEmptyString(source.name, `${label}[${index}].name`);
    const type = nonEmptyString(source.type, `${label}[${index}].type`);
    if (names.has(name)) throw new Error(`Invalid FBD ${label}: duplicate port '${name}'`);
    names.add(name);
    return { ...source, name, type } as FBDPort;
  });
}

/** Validate and normalize an untrusted FBD document before it reaches the transpiler. */
export function validateFBDModel(value: unknown): FBDModel {
  const source = record(value, 'top-level object');
  const variables = record(source.variables, 'variables');
  for (const name of ['local', 'outputs'] as const) {
    if (!Array.isArray(variables[name])) throw new Error(`Invalid FBD variables.${name}: expected array`);
  }
  if (variables.inputs !== undefined && !Array.isArray(variables.inputs)) {
    throw new Error('Invalid FBD variables.inputs: expected array');
  }
  if (!Array.isArray(source.blocks)) throw new Error('Invalid FBD blocks: expected array');
  if (!Array.isArray(source.connections)) throw new Error('Invalid FBD connections: expected array');

  const blockIds = new Set<string>();
  const blocks = source.blocks.map((value, index) => {
    const block = record(value, `blocks[${index}]`);
    const id = nonEmptyString(block.id, `blocks[${index}].id`);
    const type = nonEmptyString(block.type, `blocks[${index}].type`);
    if (blockIds.has(id)) throw new Error(`Invalid FBD: duplicate block id '${id}'`);
    blockIds.add(id);
    const position = record(block.position, `blocks[${index}].position`);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error(`Invalid FBD blocks[${index}].position: coordinates must be finite`);
    }
    const defaults = getDefaultPorts(type);
    return {
      ...block,
      id,
      type,
      position: { x: position.x, y: position.y },
      inputs: block.inputs === undefined ? defaults.inputs : ports(block.inputs, `blocks[${index}].inputs`),
      outputs: block.outputs === undefined ? defaults.outputs : ports(block.outputs, `blocks[${index}].outputs`),
    } as FBDBlock;
  });
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  const connectionIds = new Set<string>();
  const writtenInputs = new Set<string>();
  const connections = source.connections.map((value, index) => {
    const connection = record(value, `connections[${index}]`);
    const id = nonEmptyString(connection.id, `connections[${index}].id`);
    if (connectionIds.has(id)) throw new Error(`Invalid FBD: duplicate connection id '${id}'`);
    connectionIds.add(id);
    const from = record(connection.from, `connections[${index}].from`);
    const to = record(connection.to, `connections[${index}].to`);
    const fromBlock = nonEmptyString(from.block, `connections[${index}].from.block`);
    const fromPort = nonEmptyString(from.port, `connections[${index}].from.port`);
    const toBlock = nonEmptyString(to.block, `connections[${index}].to.block`);
    const toPort = nonEmptyString(to.port, `connections[${index}].to.port`);
    const sourceBlock = blocksById.get(fromBlock);
    const destinationBlock = blocksById.get(toBlock);
    if (!sourceBlock) throw new Error(`Invalid FBD connection '${id}': unknown source block '${fromBlock}'`);
    if (!destinationBlock) throw new Error(`Invalid FBD connection '${id}': unknown destination block '${toBlock}'`);
    if (!sourceBlock.outputs!.some((port) => port.name === fromPort)) {
      throw new Error(`Invalid FBD connection '${id}': unknown source output port '${fromBlock}.${fromPort}'`);
    }
    if (!destinationBlock.inputs!.some((port) => port.name === toPort)) {
      throw new Error(`Invalid FBD connection '${id}': unknown destination input port '${toBlock}.${toPort}'`);
    }
    const destination = endpointKey(toBlock, toPort);
    if (writtenInputs.has(destination)) throw new Error(`Invalid FBD connection '${id}': multiple writers for '${toBlock}.${toPort}'`);
    writtenInputs.add(destination);
    return { ...connection, id, from: { block: fromBlock, port: fromPort }, to: { block: toBlock, port: toPort } } as FBDConnection;
  });

  return {
    ...source,
    name: nonEmptyString(source.name, 'name'),
    variables: { ...variables, local: variables.local as FBDVariable[], outputs: variables.outputs as FBDVariable[], inputs: variables.inputs as FBDVariable[] | undefined },
    blocks,
    connections,
  } as FBDModel;
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
    'SR', 'RS',
    'COMM_PUBLISH', 'COMM_SUBSCRIBE', 'COMM_MODBUS', 'COMM_CONNECT'
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
    case 'COMM_PUBLISH':
      return {
        inputs: [
          { name: 'EN', type: 'BOOL' },
          { name: 'IN', type: 'ANY' }
        ],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'DONE', type: 'BOOL' }
        ]
      };
    case 'COMM_SUBSCRIBE':
      return {
        inputs: [
          { name: 'EN', type: 'BOOL' }
        ],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'VALID', type: 'BOOL' }
        ]
      };
    case 'COMM_MODBUS':
      return {
        inputs: [
          { name: 'EN', type: 'BOOL' },
          { name: 'IN', type: 'ANY' }
        ],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'STATUS', type: 'BOOL' }
        ]
      };
    case 'COMM_CONNECT':
      return {
        inputs: [
          { name: 'EN', type: 'BOOL' }
        ],
        outputs: [
          { name: 'CONNECTED', type: 'BOOL' },
          { name: 'ERROR', type: 'BOOL' }
        ]
      };
    case 'MB_COIL':
    case 'MB_DISCRETE_INPUT':
    case 'MB_INPUT_REGISTER':
    case 'MB_HOLDING_REGISTER':
      return {
        inputs: [
          { name: 'EN', type: 'BOOL' },
          { name: 'IN', type: 'ANY' },
          { name: 'ADDR', type: 'UINT' }
        ],
        outputs: [
          { name: 'OUT', type: 'ANY' },
          { name: 'STATUS', type: 'BOOL' }
        ]
      };
    default:
      return {
        inputs: [{ name: 'IN', type: 'ANY' }],
        outputs: [{ name: 'OUT', type: 'ANY' }]
      };
  }
}
