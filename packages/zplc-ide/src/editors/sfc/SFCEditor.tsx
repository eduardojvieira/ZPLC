/**
 * SFCEditor - Main ReactFlow-based Sequential Function Chart Editor
 * 
 * Visual editor for IEC 61131-3 SFC programs.
 * Converts SFCModel <-> ReactFlow nodes/edges.
 * 
 * Debug Mode Features:
 * - Highlights active steps with green glow
 * - Shows time spent in each step
 * - Displays transition condition evaluation results
 * - Shows "armed" transitions (ready to fire)
 */

import { useCallback, useMemo, useRef, useEffect, useReducer, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  MarkerType,
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type SFCModel, type SFCStep, type SFCTransition } from '../../models/sfc';
import { copySFCFragment, hasCanonicalEdgeChanges, hasCanonicalNodeChanges, isCanonicalSFCConnection, nodesToSteps, nodesToTransitions, pasteSFCFragment, uniqueNodeId, type SFCClipboardFragment } from './graphModel';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import SFCToolbox from './SFCToolbox';
import { useIDEStore } from '../../store/useIDEStore';
import { useDebugValues } from '../../hooks/useDebugValue';

// =============================================================================
// Props
// =============================================================================

interface SFCEditorProps {
  model: SFCModel;
  onChange?: (model: SFCModel) => void;
  readOnly?: boolean;
}

// =============================================================================
// Model <-> ReactFlow Conversion with Debug Data
// =============================================================================

interface DebugStepInfo {
  isActive: boolean;
  timeInStep?: number;
  activationCount?: number;
}

interface DebugTransitionInfo {
  conditionResult?: boolean;
  isArmed: boolean;
  wasFired?: boolean;
}

/**
 * Convert SFC steps to ReactFlow nodes with debug data
 */
function stepsToNodes(
  steps: SFCStep[], 
  debugActive: boolean,
  stepDebugInfo: Map<string, DebugStepInfo>
): Node[] {
  return steps.map((step) => {
    const debugInfo = stepDebugInfo.get(step.name) || stepDebugInfo.get(step.id);
    
    return {
      id: step.id,
      type: 'step',
      position: step.position,
      data: {
        name: step.name,
        isInitial: step.isInitial,
        actions: step.actions,
        comment: step.comment,
        // Debug properties
        debugActive,
        isActive: debugInfo?.isActive || false,
        timeInStep: debugInfo?.timeInStep,
        activationCount: debugInfo?.activationCount,
      },
    };
  });
}

/**
 * Convert SFC transitions to ReactFlow nodes with debug data
 */
function transitionsToNodes(
  transitions: SFCTransition[],
  debugActive: boolean,
  transitionDebugInfo: Map<string, DebugTransitionInfo>
): Node[] {
  return transitions.map((trans) => {
    const debugInfo = transitionDebugInfo.get(trans.id);
    
    return {
      id: trans.id,
      type: 'transition',
      position: trans.position || { x: 200, y: 150 },
      data: {
        condition: trans.condition,
        fromStep: trans.fromStep,
        toStep: trans.toStep,
        comment: trans.comment,
        // Debug properties
        debugActive,
        conditionResult: debugInfo?.conditionResult,
        isArmed: debugInfo?.isArmed || false,
        wasFired: debugInfo?.wasFired || false,
      },
    };
  });
}

/**
 * Create edges from SFC transitions (step -> transition -> step)
 */
function transitionsToEdges(
  transitions: SFCTransition[],
  debugActive: boolean,
  activeSteps: Set<string>
): Edge[] {
  const edges: Edge[] = [];
  
  for (const trans of transitions) {
    const fromStepActive = activeSteps.has(trans.fromStep);
    
    if (trans.fromStep) edges.push({
      id: `${trans.fromStep}_to_${trans.id}`,
      source: trans.fromStep,
      sourceHandle: 'out',
      target: trans.id,
      targetHandle: 'in',
      type: 'sfc',
      style: {
        stroke: debugActive && fromStepActive ? 'var(--color-accent-green)' : 'var(--visual-wire)',
        strokeWidth: debugActive && fromStepActive ? 3 : 2,
      },
      animated: debugActive && fromStepActive,
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
    });
    
    // Edge from transition to target step
    if (trans.toStep) edges.push({
      id: `${trans.id}_to_${trans.toStep}`,
      source: trans.id,
      sourceHandle: 'out',
      target: trans.toStep,
      targetHandle: 'in',
      type: 'sfc',
      style: {
        stroke: 'var(--visual-wire)',
        strokeWidth: 2,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
    });
  }
  
  return edges;
}

/**
 * Convert ReactFlow nodes back to SFC steps
 */
// =============================================================================
// Inner Editor Component (has access to ReactFlow context)
// =============================================================================

interface SFCEditorInnerProps extends SFCEditorProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  debugActive: boolean;
  stepDebugInfo: Map<string, DebugStepInfo>;
  transitionDebugInfo: Map<string, DebugTransitionInfo>;
  activeSteps: Set<string>;
}

function SFCEditorInner({ 
  model, 
  onChange, 
  readOnly = false, 
  initialNodes, 
  initialEdges,
  debugActive,
  stepDebugInfo,
  transitionDebugInfo,
  activeSteps,
}: SFCEditorInnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const updateNodeDataRef = useRef<((nodeId: string, data: Record<string, unknown>) => void) | undefined>(undefined);
  const [nodes, replaceNodes] = useReducer((_current: Node[], next: Node[]) => next, initialNodes.map((node) => ({
    ...node,
    data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
  })));
  const [edges, replaceEdges] = useReducer((_current: Edge[], next: Edge[]) => next, initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const clipboardRef = useRef<SFCClipboardFragment | undefined>(undefined);

  const commitGraph = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    if (!readOnly && onChange) {
      onChange({ ...model, steps: nodesToSteps(nextNodes), transitions: nodesToTransitions(nextNodes, nextEdges) });
    }
  }, [model, onChange, readOnly]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    if (readOnly) return;
    commitGraph(nodesRef.current.map((node) => node.id === nodeId
      ? { ...node, data: { ...node.data, ...data } }
      : node), edgesRef.current);
  }, [commitGraph, readOnly]);
  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  useEffect(() => {
    const nextNodes = initialNodes.map((node) => ({ ...node, data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) } }));
    nodesRef.current = nextNodes;
    edgesRef.current = initialEdges;
    replaceNodes(nextNodes);
    replaceEdges(initialEdges);
  }, [initialNodes, initialEdges, readOnly]);

  // Update nodes when debug info changes
  useEffect(() => {
    if (!debugActive) return;
    
    const nextNodes = nodesRef.current.map((node) => {
        if (node.type === 'step') {
          const data = node.data as Record<string, unknown>;
          const stepName = data.name as string;
          const debugInfo = stepDebugInfo.get(stepName) || stepDebugInfo.get(node.id);
          
          return {
            ...node,
            data: {
              ...node.data,
              debugActive,
              isActive: debugInfo?.isActive || false,
              timeInStep: debugInfo?.timeInStep,
              activationCount: debugInfo?.activationCount,
            },
          };
        }
        if (node.type === 'transition') {
          const debugInfo = transitionDebugInfo.get(node.id);
          
          return {
            ...node,
            data: {
              ...node.data,
              debugActive,
              conditionResult: debugInfo?.conditionResult,
              isArmed: debugInfo?.isArmed || false,
              wasFired: debugInfo?.wasFired || false,
            },
          };
        }
        return node;
      });
    nodesRef.current = nextNodes;
    replaceNodes(nextNodes);
  }, [debugActive, stepDebugInfo, transitionDebugInfo]);

  // Update edges when active steps change
  useEffect(() => {
    if (!debugActive) return;
    
    const nextEdges = edgesRef.current.map((edge) => {
        // Check if this edge is from an active step
        const fromStepActive = activeSteps.has(edge.source);
        const sourceNode = nodesRef.current.find((node) => node.id === edge.source);
        const isFromStepToTransition = sourceNode?.type === 'step';
        
        if (isFromStepToTransition && debugActive) {
          return {
            ...edge,
            style: {
              stroke: fromStepActive ? 'var(--color-accent-green)' : 'var(--visual-wire)',
              strokeWidth: fromStepActive ? 3 : 2,
            },
            animated: fromStepActive,
          };
        }
        return edge;
      });
    edgesRef.current = nextEdges;
    replaceEdges(nextEdges);
  }, [debugActive, activeSteps]);

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      
      if (!isCanonicalSFCConnection(params, nodesRef.current)) return;
      const source = nodesRef.current.find((node) => node.id === params.source);
      const target = nodesRef.current.find((node) => node.id === params.target);
      if (!source || !target) return;
      const nextEdges = edgesRef.current.filter((edge) => {
        if (target.type === 'transition') return edge.target !== target.id;
        return edge.source !== source.id;
      });
      commitGraph(nodesRef.current, addEdge({
        ...params,
        type: 'sfc',
        style: { stroke: 'var(--visual-wire)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      }, nextEdges));
    },
    [commitGraph, readOnly]
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => isCanonicalSFCConnection(connection, nodesRef.current), []);

  // Notify parent of changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      if (readOnly) return;
      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      if (hasCanonicalNodeChanges(changes)) commitGraph(nextNodes, edgesRef.current);
      else {
        nodesRef.current = nextNodes;
        replaceNodes(nextNodes);
      }
    },
    [commitGraph, readOnly]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      if (readOnly) return;
      const nextEdges = applyEdgeChanges(changes, edgesRef.current);
      if (hasCanonicalEdgeChanges(changes)) commitGraph(nodesRef.current, nextEdges);
      else {
        edgesRef.current = nextEdges;
        replaceEdges(nextEdges);
      }
    },
    [commitGraph, readOnly]
  );

  // Handle drop from toolbox
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;

      const elementType = event.dataTransfer.getData('application/zplc-sfc');
      if (!elementType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const id = uniqueNodeId(`${elementType}_${Date.now()}`, nodesRef.current);

      let newNode: Node;

      switch (elementType) {
        case 'step':
          newNode = {
            id,
            type: 'step',
            position,
            data: {
              readOnly,
              onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data),
              name: `Step_${id}`,
              isInitial: false,
              actions: [],
              debugActive: false,
            },
          };
          break;
          
        case 'initial_step':
          newNode = {
            id,
            type: 'step',
            position,
            data: {
              readOnly,
              onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data),
              name: `Init_${id}`,
              isInitial: true,
              actions: [],
              debugActive: false,
            },
          };
          break;
          
        case 'transition':
          newNode = {
            id,
            type: 'transition',
            position,
            data: {
              readOnly,
              onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data),
              condition: 'TRUE',
              fromStep: '',
              toStep: '',
              debugActive: false,
            },
          };
          break;
          
        default:
          return;
      }

      commitGraph([...nodesRef.current, newNode], edgesRef.current);
    },
    [commitGraph, readOnly, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (readOnly || event.altKey || event.shiftKey || event.ctrlKey === event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'c') {
      const fragment = copySFCFragment(nodesRef.current, edgesRef.current);
      if (!fragment) return;
      clipboardRef.current = fragment;
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() !== 'v' || !clipboardRef.current) return;
    const currentModel = { ...model, steps: nodesToSteps(nodesRef.current), transitions: nodesToTransitions(nodesRef.current, edgesRef.current) };
    const pasted = pasteSFCFragment(currentModel, clipboardRef.current);
    if (!pasted) return;
    const addedSteps = pasted.model.steps.slice(currentModel.steps.length);
    const addedTransitions = pasted.model.transitions.slice(currentModel.transitions.length);
    const nextNodes = [
      ...nodesRef.current.map((node) => ({ ...node, selected: false })),
      ...stepsToNodes(addedSteps, debugActive, stepDebugInfo).map((node) => ({ ...node, selected: true, data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) } })),
      ...transitionsToNodes(addedTransitions, debugActive, transitionDebugInfo).map((node) => ({ ...node, selected: true, data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) } })),
    ];
    const nextEdges = [...edgesRef.current.map((edge) => ({ ...edge, selected: false })), ...pasted.edges.map((edge) => ({ ...edge, selected: false, style: { stroke: 'var(--visual-wire)', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 } }))];
    event.preventDefault();
    commitGraph(nextNodes, nextEdges);
  }, [commitGraph, debugActive, model, readOnly, stepDebugInfo, transitionDebugInfo]);

  return (
    <div 
      ref={reactFlowWrapper}
      className="flex-1 h-full"
      tabIndex={0}
      role="region"
      aria-label="Sequential function chart canvas"
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        edgesFocusable={!readOnly}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes as EdgeTypes}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Strict}
        defaultViewport={{ x: 50, y: 50, zoom: 1 }}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.5}
        maxZoom={1.5}
        style={{ backgroundColor: 'var(--color-surface-900)' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-surface-500)"
        />
        <Controls
          className="!bg-[var(--color-surface-800)] !border-[var(--color-surface-600)] !rounded-lg"
          showZoom
          showFitView
          showInteractive={!readOnly}
        />
        <MiniMap
          className="!bg-[var(--color-surface-800)] !border-[var(--color-surface-600)] !rounded-lg"
          nodeColor={(n) => {
            if (n.type === 'step') {
              const data = n.data as Record<string, unknown>;
              if (debugActive && data.isActive) return '#22c55e'; // Green for active
              return 'var(--color-accent-blue)';
            }
            if (n.type === 'transition') {
              const data = n.data as Record<string, unknown>;
              if (debugActive && data.isArmed) return '#f59e0b'; // Amber for armed
              return 'var(--visual-wire)';
            }
            return 'var(--visual-wire)';
          }}
          maskColor="var(--color-surface-600)"
        />
        
        {/* Debug mode indicator */}
        {debugActive && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 
                          bg-green-900/90 border border-green-600 rounded-lg text-sm text-green-200">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Debug Mode Active</span>
            <span className="text-green-400 font-mono text-xs ml-2">
              {activeSteps.size} step{activeSteps.size !== 1 ? 's' : ''} active
            </span>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

// =============================================================================
// Main Component (with Provider)
// =============================================================================

export default function SFCEditor({ model, onChange, readOnly = false }: SFCEditorProps) {
  // Debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugActive = debugMode !== 'none';
  
  // Build list of variable paths to watch for SFC state
  // SFC runtime typically exposes: _SFC_<stepName>_X (step active flag)
  // and _SFC_<stepName>_T (time in step)
  const variablePaths = useMemo(() => {
    const paths: string[] = [];
    
    for (const step of model.steps) {
      // Step active flag (common SFC runtime convention)
      paths.push(`${step.name}.X`);
      paths.push(`${step.name}_X`);
      paths.push(`_SFC_${step.name}_X`);
      
      // Time in step
      paths.push(`${step.name}.T`);
      paths.push(`${step.name}_T`);
      paths.push(`_SFC_${step.name}_T`);
    }
    
    // Also watch transition condition variables
    for (const trans of model.transitions) {
      // Extract variable names from condition
      const varMatches = trans.condition.match(/[A-Za-z_][A-Za-z0-9_]*/g);
      if (varMatches) {
        for (const varName of varMatches) {
          if (!['TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'XOR'].includes(varName.toUpperCase())) {
            paths.push(varName);
          }
        }
      }
    }
    
    return [...new Set(paths)]; // Deduplicate
  }, [model.steps, model.transitions]);
  
  // Get live values
  const liveValues = useDebugValues(debugActive ? variablePaths : []);
  
  // Build step debug info from live values
  const stepDebugInfo = useMemo(() => {
    const info = new Map<string, DebugStepInfo>();
    
    for (const step of model.steps) {
      // Check various naming conventions for step active flag
      const activeFlag = 
        liveValues.get(`${step.name}.X`) ||
        liveValues.get(`${step.name}_X`) ||
        liveValues.get(`_SFC_${step.name}_X`);
      
      const timeValue = 
        liveValues.get(`${step.name}.T`) ||
        liveValues.get(`${step.name}_T`) ||
        liveValues.get(`_SFC_${step.name}_T`);
      
      const isActive = activeFlag?.exists && 
        (activeFlag.value === true || activeFlag.value === 1 || activeFlag.value === 'TRUE');
      
      const timeInStep = timeValue?.exists && typeof timeValue.value === 'number' 
        ? timeValue.value 
        : undefined;
      
      info.set(step.name, {
        isActive: isActive || false,
        timeInStep,
      });
      
      // Also set by ID for lookup
      info.set(step.id, {
        isActive: isActive || false,
        timeInStep,
      });
    }
    
    return info;
  }, [model.steps, liveValues]);
  
  // Build set of active step IDs
  const activeSteps = useMemo(() => {
    const active = new Set<string>();
    
    for (const step of model.steps) {
      const debugInfo = stepDebugInfo.get(step.name);
      if (debugInfo?.isActive) {
        active.add(step.id);
        active.add(step.name); // Also add by name for edge matching
      }
    }
    
    return active;
  }, [model.steps, stepDebugInfo]);
  
  // Build transition debug info
  const transitionDebugInfo = useMemo(() => {
    const info = new Map<string, DebugTransitionInfo>();
    
    for (const trans of model.transitions) {
      // Check if preceding step is active
      const isArmed = activeSteps.has(trans.fromStep);
      
      // Try to evaluate condition from live values
      // This is a simplified check - just look for the condition variable
      let conditionResult: boolean | undefined;
      
      // Simple variable condition (e.g., "StartButton" or "Timer1.Q")
      const conditionTrimmed = trans.condition.trim();
      if (conditionTrimmed.toUpperCase() === 'TRUE') {
        conditionResult = true;
      } else if (conditionTrimmed.toUpperCase() === 'FALSE') {
        conditionResult = false;
      } else {
        const conditionValue = liveValues.get(conditionTrimmed);
        if (conditionValue?.exists) {
          conditionResult = conditionValue.value === true || 
            conditionValue.value === 1 || 
            conditionValue.value === 'TRUE';
        }
      }
      
      info.set(trans.id, {
        conditionResult,
        isArmed,
        wasFired: false, // Would need runtime event to detect this
      });
    }
    
    return info;
  }, [model.transitions, activeSteps, liveValues]);

  // Convert model to ReactFlow format with debug data
  const initialNodes = useMemo(() => [
    ...stepsToNodes(model.steps, false, new Map()),
    ...transitionsToNodes(model.transitions, false, new Map()),
  ], [model.steps, model.transitions]);
  
  const initialEdges = useMemo(
    () => transitionsToEdges(model.transitions, false, new Set()),
    [model.transitions]
  );

  return (
    <div className="zplc-visual-editor w-full h-full flex">
      {/* Toolbox sidebar */}
      {!readOnly && !debugActive && <SFCToolbox />}

      {/* Main canvas - wrapped in provider */}
      <ReactFlowProvider>
        <SFCEditorInner
          model={model}
          onChange={onChange}
          readOnly={readOnly || debugActive}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          debugActive={debugActive}
          stepDebugInfo={stepDebugInfo}
          transitionDebugInfo={transitionDebugInfo}
          activeSteps={activeSteps}
        />
      </ReactFlowProvider>
    </div>
  );
}
