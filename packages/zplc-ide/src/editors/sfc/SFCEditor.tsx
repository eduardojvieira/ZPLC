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
import { applySFCSelection, copySFCFragment, sfcSelection, stepNodeData, transitionNodeData, isCanonicalSFCConnection, nodesToSteps, nodesToTransitions, pasteSFCFragment, uniqueNodeId, type SFCClipboardFragment } from './graphModel';
import { edgeChangesCommit, nodeChangesCommit } from '../gesture';
import { useGestureCommit } from '../useGestureCommit';
import { getVisualSelection, setVisualSelection, useVisualFileKey } from '../visualSelection';
import type { VisualGesture } from '../visualHistory';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import SFCToolbox from './SFCToolbox';
import { useIDEStore } from '../../store/useIDEStore';
import { useMonitor } from '../../monitoring/useMonitor';
import { useElementSelection } from '../elementSelection';
import { useElementBreakpoints } from '../elementBreakpoints';
import { markBreakpointNodes } from '../breakpointMarks';
import { parseElement, stepElement, transitionElement, type SourceElementId } from '../../models/sourceElements';

// =============================================================================
// Props
// =============================================================================

interface SFCEditorProps {
  model: SFCModel;
  /** Called once for each gesture of the user (LNG-010), with what the history needs to know of it. */
  onChange?: (model: SFCModel, gesture?: VisualGesture) => void;
  readOnly?: boolean;
}

// =============================================================================
// Model <-> ReactFlow Conversion with Debug Data
// =============================================================================

interface DebugStepInfo {
  isActive: boolean;
  /** The map gave no state for the step, or it was not read. */
  unavailable?: boolean;
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
        ...stepNodeData(step),
        // Debug properties
        debugActive,
        isActive: debugInfo?.isActive || false,
        stateUnavailable: debugInfo?.unavailable === true,
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
        ...transitionNodeData(trans),
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
    // A simultaneous convergence leaves several steps, a simultaneous divergence enters several
    for (const fromStep of trans.fromSteps ?? [trans.fromStep]) {
      if (!fromStep) continue;
      const fromStepActive = activeSteps.has(fromStep);
      edges.push({
        id: `${fromStep}_to_${trans.id}`,
        source: fromStep,
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
    }
    
    // Edges from the transition to its target steps
    for (const toStep of trans.toSteps ?? [trans.toStep]) {
      if (!toStep) continue;
      edges.push({
        id: `${trans.id}_to_${toStep}`,
        source: trans.id,
        sourceHandle: 'out',
        target: toStep,
        targetHandle: 'in',
        type: 'sfc',
        style: {
          stroke: 'var(--visual-wire)',
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      });
    }
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
  const { screenToFlowPosition, fitView } = useReactFlow();

  const updateNodeDataRef = useRef<((nodeId: string, data: Record<string, unknown>) => void) | undefined>(undefined);
  const [nodes, replaceNodes] = useReducer((_current: Node[], next: Node[]) => next, initialNodes.map((node) => ({
    ...node,
    data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
  })));
  const [edges, replaceEdges] = useReducer((_current: Edge[], next: Edge[]) => next, initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const clipboardRef = useRef<SFCClipboardFragment | undefined>(undefined);

  // One gesture is one commit (LNG-010): the document is committed once, with the selection from before the gesture and after.
  const fileKey = useVisualFileKey();
  const fileKeyRef = useRef(fileKey);
  useEffect(() => {
    fileKeyRef.current = fileKey;
  }, [fileKey]);
  const commitModel = useGestureCommit<SFCModel>(onChange);

  const commitGraph = useCallback((nextNodes: Node[], nextEdges: Edge[], coalesce?: string) => {
    const before = sfcSelection(nodesRef.current, edgesRef.current);
    const after = sfcSelection(nextNodes, nextEdges);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    setVisualSelection(fileKeyRef.current, after);
    if (!readOnly && onChange) {
      commitModel({ ...model, steps: nodesToSteps(nextNodes), transitions: nodesToTransitions(nextNodes, nextEdges) },
        { before, after, ...(coalesce === undefined ? {} : { coalesce }) });
    }
  }, [commitModel, model, onChange, readOnly]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    if (readOnly) return;
    commitGraph(nodesRef.current.map((node) => node.id === nodeId
      ? { ...node, data: { ...node.data, ...data } }
      : node), edgesRef.current, `data:${nodeId}:${Object.keys(data).sort().join(',')}`);
  }, [commitGraph, readOnly]);
  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  // The canvas is rebuilt from the document after every edit, undo and change made outside; the selection is not part of
  // the document, so it is put back from where the editor remembers it (LNG-010).
  useEffect(() => {
    const shown = applySFCSelection(
      initialNodes.map((node) => ({ ...node, data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) } })),
      initialEdges,
      getVisualSelection(fileKeyRef.current),
    );
    nodesRef.current = shown.nodes;
    edgesRef.current = shown.edges;
    replaceNodes(shown.nodes);
    replaceEdges(shown.edges);
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
              stateUnavailable: debugInfo?.unavailable === true,
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

  // Breakpoints on steps and transitions: a step stops where a transition enters it, a transition where it fires (LNG-004)
  const breakpoints = useElementBreakpoints();
  const elementOfNode = useCallback((node: Node): SourceElementId | undefined => (
    node.type === 'step' ? stepElement(node.id) : node.type === 'transition' ? transitionElement(node.id) : undefined
  ), []);
  const markedNodes = useMemo(
    () => markBreakpointNodes(nodes, elementOfNode, breakpoints),
    [nodes, elementOfNode, breakpoints],
  );

  // Activating a problem of this chart selects the step or the transition it is about; an action is shown on the first
  // step that uses it, because the editor draws the actions inside the steps (LNG-003, LNG-026)
  const selectElement = useCallback((element: SourceElementId) => {
    const parsed = parseElement(element);
    if (!parsed) return;
    let target: string | undefined;
    if (parsed.kind === 'step' || parsed.kind === 'transition') {
      target = parsed.id;
    } else if (parsed.kind === 'action') {
      const names = new Set([parsed.id, model.actions?.find((action) => action.id === parsed.id)?.name]);
      target = nodesRef.current.find((node) => node.type === 'step'
        && ((node.data as { actions?: Array<{ actionName: string }> }).actions ?? []).some((action) => names.has(action.actionName)))?.id;
    }
    if (!target || !nodesRef.current.some((node) => node.id === target)) return;
    const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: node.id === target }));
    const nextEdges = edgesRef.current.map((edge) => edge.selected ? { ...edge, selected: false } : edge);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    setVisualSelection(fileKeyRef.current, sfcSelection(nextNodes, nextEdges));
    void fitView({ nodes: [{ id: target }], maxZoom: 1, duration: 200 });
  }, [fitView, model.actions]);
  useElementSelection(selectElement);

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
      // the steps of a drag only move the node on the canvas: the document is committed when the node is put down
      if (nodeChangesCommit(changes)) commitGraph(nextNodes, edgesRef.current);
      else {
        nodesRef.current = nextNodes;
        replaceNodes(nextNodes);
        if (changes.some((change) => change.type === 'select')) setVisualSelection(fileKeyRef.current, sfcSelection(nextNodes, edgesRef.current));
      }
    },
    [commitGraph, readOnly]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      if (readOnly) return;
      const nextEdges = applyEdgeChanges(changes, edgesRef.current);
      if (edgeChangesCommit(changes)) commitGraph(nodesRef.current, nextEdges);
      else {
        edgesRef.current = nextEdges;
        replaceEdges(nextEdges);
        if (changes.some((change) => change.type === 'select')) setVisualSelection(fileKeyRef.current, sfcSelection(nodesRef.current, nextEdges));
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
    if (event.key === 'F9') {
      const selected = nodesRef.current.filter((node) => node.selected);
      const elements = selected.map(elementOfNode).filter((element): element is SourceElementId => element !== undefined);
      if (elements.length === 0) return;
      for (const element of elements) breakpoints.toggle(element);
      event.preventDefault();
      return;
    }
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
  }, [breakpoints, commitGraph, debugActive, elementOfNode, model, readOnly, stepDebugInfo, transitionDebugInfo]);

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
        nodes={markedNodes}
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
  // The chart is not edited while a program runs under Studio; what it shows online is what the debug map of the build
  // says, step by step and transition by transition (LNG-006): there is no name to guess.
  const debugMode = useIDEStore((state) => state.debug.mode);
  const monitor = useMonitor();
  const debugActive = monitor.active;
  const running = debugMode !== 'none';

  const stepDebugInfo = useMemo(() => {
    const info = new Map<string, DebugStepInfo>();
    if (!monitor.active) return info;
    for (const step of model.steps) {
      const state = monitor.states.get(stepElement(step.id));
      info.set(step.id, { isActive: state?.active === true, unavailable: state?.active === undefined, timeInStep: state?.time });
    }
    return info;
  }, [model.steps, monitor]);

  const activeSteps = useMemo(
    () => new Set(model.steps.filter((step) => stepDebugInfo.get(step.id)?.isActive).map((step) => step.id)),
    [model.steps, stepDebugInfo],
  );

  const transitionDebugInfo = useMemo(() => {
    const info = new Map<string, DebugTransitionInfo>();
    if (!monitor.active) return info;
    for (const transition of model.transitions) {
      const state = monitor.states.get(transitionElement(transition.id));
      // armed: every step the transition leaves is active
      const leaves = transition.fromSteps ?? [transition.fromStep];
      info.set(transition.id, {
        conditionResult: state?.condition,
        isArmed: leaves.length > 0 && leaves.every((id) => activeSteps.has(id)),
        wasFired: state?.fired === true,
      });
    }
    return info;
  }, [model.transitions, monitor, activeSteps]);

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
      {!readOnly && !running && <SFCToolbox />}

      {/* Main canvas - wrapped in provider */}
      <ReactFlowProvider>
        <SFCEditorInner
          model={model}
          onChange={onChange}
          readOnly={readOnly || running}
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
