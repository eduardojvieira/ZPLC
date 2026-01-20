/**
 * SFC (Sequential Function Chart) Model Types
 * 
 * TypeScript types matching the SFC JSON schema used for visual editing.
 * Based on IEC 61131-3 SFC language specification.
 * 
 * SFC represents sequential control flow as a state machine:
 * - Steps: States with associated actions
 * - Transitions: Conditions to move between steps
 * - Actions: Code blocks executed when steps are active
 */

// =============================================================================
// Variable Definitions
// =============================================================================

export interface SFCVariable {
  name: string;
  type: string;
  initialValue?: unknown;
  address?: string;        // e.g., "%Q0.0" for physical outputs
  comment?: string;
}

export interface SFCVariables {
  local: SFCVariable[];
  inputs?: SFCVariable[];
  outputs: SFCVariable[];
}

// =============================================================================
// Position for visual placement
// =============================================================================

export interface Position {
  x: number;
  y: number;
}

// =============================================================================
// Step Definition
// =============================================================================

/**
 * Action qualifier codes per IEC 61131-3
 */
export type ActionQualifier = 
  | 'N'  // Non-stored (action runs while step is active)
  | 'S'  // Set (action is set/latched on step entry)
  | 'R'  // Reset (action is reset on step entry)
  | 'L'  // Time Limited
  | 'D'  // Time Delayed
  | 'P'  // Pulse (single scan)
  | 'SD' // Stored and time Delayed
  | 'DS' // Delayed and Stored
  | 'SL' // Stored and time Limited
  | 'P0' // Pulse on rising edge
  | 'P1' // Pulse on falling edge
;

/**
 * Action association within a step
 */
export interface StepAction {
  qualifier: ActionQualifier;
  actionName: string;
  time?: string;       // For timed qualifiers (L, D, SD, DS, SL)
  comment?: string;
}

/**
 * A step in the SFC - represents a state
 */
export interface SFCStep {
  id: string;
  name: string;
  isInitial: boolean;
  position: Position;
  actions?: StepAction[];
  comment?: string;
}

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * A transition between steps - defines when to change state
 */
export interface SFCTransition {
  id: string;
  fromStep: string;    // Step ID
  toStep: string;      // Step ID
  condition: string;   // Boolean expression in ST syntax
  position?: Position;
  comment?: string;
}

// =============================================================================
// Action Definition
// =============================================================================

/**
 * Action type - what language the action body uses
 */
export type ActionType = 'ST' | 'IL' | 'FBD' | 'LD';

/**
 * An action definition - the actual code to execute
 */
export interface SFCAction {
  id: string;
  name: string;
  type: ActionType;
  body: string;        // Code in the specified language
  comment?: string;
}

// =============================================================================
// Complete SFC Model
// =============================================================================

/**
 * Metadata about the SFC diagram
 */
export interface SFCMetadata {
  author?: string;
  created?: string;
  modified?: string;
  iecStandard?: string;
  notes?: string[];
}

/**
 * Complete SFC model representing a sequential function chart
 */
export interface SFCModel {
  name: string;
  description?: string;
  version?: string;
  
  variables?: SFCVariables;
  
  steps: SFCStep[];
  transitions: SFCTransition[];
  actions?: SFCAction[];
  
  metadata?: SFCMetadata;
}

// =============================================================================
// Model Parsing/Validation
// =============================================================================

/**
 * Parse and validate a JSON string as an SFC model.
 */
export function parseSFCModel(jsonString: string): SFCModel {
  try {
    const parsed = JSON.parse(jsonString);
    return validateSFCModel(parsed);
  } catch (e) {
    if (e instanceof Error) {
      throw new Error(`Failed to parse SFC model: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Validate an object as a valid SFC model.
 */
export function validateSFCModel(obj: unknown): SFCModel {
  if (!obj || typeof obj !== 'object') {
    throw new Error('SFC model must be an object');
  }
  
  const model = obj as Record<string, unknown>;
  
  // Required fields
  if (typeof model.name !== 'string') {
    throw new Error('SFC model must have a name');
  }
  
  if (!Array.isArray(model.steps)) {
    throw new Error('SFC model must have steps array');
  }
  
  if (!Array.isArray(model.transitions)) {
    throw new Error('SFC model must have transitions array');
  }
  
  // Validate steps
  for (const step of model.steps) {
    if (!step || typeof step !== 'object') {
      throw new Error('Each step must be an object');
    }
    const s = step as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.name !== 'string') {
      throw new Error('Each step must have id and name');
    }
  }
  
  // Validate transitions
  for (const trans of model.transitions) {
    if (!trans || typeof trans !== 'object') {
      throw new Error('Each transition must be an object');
    }
    const t = trans as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.fromStep !== 'string' || typeof t.toStep !== 'string') {
      throw new Error('Each transition must have id, fromStep, and toStep');
    }
  }
  
  // Check for at least one initial step
  const initialSteps = (model.steps as SFCStep[]).filter(s => s.isInitial);
  if (initialSteps.length === 0) {
    throw new Error('SFC model must have at least one initial step');
  }
  
  return model as unknown as SFCModel;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the initial step(s) in an SFC model.
 */
export function getInitialSteps(model: SFCModel): SFCStep[] {
  return model.steps.filter(s => s.isInitial);
}

/**
 * Get all transitions from a specific step.
 */
export function getTransitionsFromStep(model: SFCModel, stepId: string): SFCTransition[] {
  return model.transitions.filter(t => t.fromStep === stepId);
}

/**
 * Get all transitions to a specific step.
 */
export function getTransitionsToStep(model: SFCModel, stepId: string): SFCTransition[] {
  return model.transitions.filter(t => t.toStep === stepId);
}

/**
 * Find an action by name.
 */
export function findAction(model: SFCModel, actionName: string): SFCAction | undefined {
  return model.actions?.find(a => a.name === actionName || a.id === actionName);
}

/**
 * Serialize an SFC model to JSON string.
 */
export function serializeSFCModel(model: SFCModel): string {
  return JSON.stringify(model, null, 2);
}

/**
 * Create an empty SFC model with default initial step.
 */
export function createEmptySFCModel(name: string = 'NewProgram'): SFCModel {
  return {
    name,
    description: 'New Sequential Function Chart',
    version: '1.0.0',
    variables: {
      local: [],
      outputs: [],
    },
    steps: [
      {
        id: 'step_init',
        name: 'Init',
        isInitial: true,
        position: { x: 200, y: 100 },
        actions: [],
      },
    ],
    transitions: [],
    actions: [],
    metadata: {
      created: new Date().toISOString().split('T')[0],
      iecStandard: 'IEC 61131-3',
    },
  };
}
