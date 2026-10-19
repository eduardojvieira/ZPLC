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

import { useCallback, useMemo, useRef, useEffect, useReducer } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
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
import { applySFCSelection, connectSFC, copySFCFragment, sfcSelection, stepNodeData, transitionNodeData, isCanonicalSFCConnection, nodesToSteps, nodesToTransitions, pasteSFCFragment, type SFCClipboardFragment } from './graphModel';
import { sfcCanvasCommands } from './keyboard';
import { stepDebugData, stepDebugInfoOf, transitionDebugData, transitionDebugInfoOf, type DebugStepInfo, type DebugTransitionInfo } from './debugInfo';
import { useCanvasKeyboard } from '../useCanvasKeyboard';
import { edgeChangesCommit, nodeChangesCommit } from '../gesture';
import { useGestureCommit } from '../useGestureCommit';
import { getVisualSelection, setVisualSelection, useVisualFileKey } from '../visualSelection';
import type { VisualGesture } from '../visualHistory';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import SFCToolbox from './SFCToolbox';
import { useIDEStore } from '../../store/useIDEStore';
import { SignalValue } from '../../ui';
import { animationMs } from '../../theme/motion';
import { useMonitor } from '../../monitoring/useMonitor';
import { announce } from '../../utils/announce';
import { ContextMenu } from '../../ui';
import { useCanvasContextMenu } from '../useCanvasContextMenu';
import { FIT_VIEW_OPTIONS, ZOOM_MAX, ZOOM_MIN } from '../viewBounds';
import { useElementSelection } from '../elementSelection';
import { useElementBreakpoints } from '../elementBreakpoints';
import { markBreakpointNodes } from '../breakpointMarks';
import { parseElement, stepElement, transitionElement, type SourceElementId } from '../../models/sourceElements';
import { t } from '../../i18n';

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
      ariaLabel: t('a11y.sfc.step', { name: step.name }),
      position: step.position,
      data: {
        ...stepNodeData(step),
        // Debug properties
        debugActive,
        ...stepDebugData(debugInfo),
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
      ariaLabel: t('a11y.sfc.transition', { condition: String(trans.condition ?? trans.id) }),
      position: trans.position || { x: 200, y: 150 },
      data: {
        ...transitionNodeData(trans),
        // Debug properties
        debugActive,
        ...transitionDebugData(debugInfo),
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
          stroke: debugActive && fromStepActive ? 'var(--signal-true-border)' : 'var(--visual-wire)',
          strokeWidth: debugActive && fromStepActive ? 3 : 2,
        },
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
              ...stepDebugData(debugInfo),
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
              ...transitionDebugData(debugInfo),
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
              stroke: fromStepActive ? 'var(--signal-true-border)' : 'var(--visual-wire)',
              strokeWidth: fromStepActive ? 3 : 2,
            },
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
    void fitView({ nodes: [{ id: target }], maxZoom: 1, duration: animationMs(200) });
  }, [fitView, model.actions]);
  useElementSelection(selectElement);

  // Handle new connections: a step to a transition and a transition to a step, by the rule the keyboard draws wires by
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      const nextEdges = connectSFC(nodesRef.current, edgesRef.current, params);
      if (nextEdges) commitGraph(nodesRef.current, nextEdges);
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

  // What a command of the keyboard adds to the canvas: the nodes it makes carry what every node of the canvas carries
  const decorate = useCallback((node: Node): Node => ({
    ...node,
    data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
  }), [readOnly]);

  // The cursor moved, or the selection changed: the canvas shows it and the document does not change
  const showGraph = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    setVisualSelection(fileKeyRef.current, sfcSelection(nextNodes, nextEdges));
  }, []);

  // The clipboard, and the breakpoints of the selected steps and transitions
  const editorCommand = useCallback((command: string) => {
    if (command === 'fitView') {
      void fitView({ ...FIT_VIEW_OPTIONS, duration: animationMs(200) });
      announce(t('editor.fit.diagram'));
      return;
    }
    if (command === 'toggleBreakpoint') {
      const elements = nodesRef.current.filter((node) => node.selected).map(elementOfNode).filter((element): element is SourceElementId => element !== undefined);
      for (const element of elements) breakpoints.toggle(element);
      return;
    }
    if (readOnly) return;
    if (command === 'copySelection') {
      const fragment = copySFCFragment(nodesRef.current, edgesRef.current);
      if (fragment) clipboardRef.current = fragment;
      return;
    }
    if (command !== 'pasteSelection' || !clipboardRef.current) return;
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
    commitGraph(nextNodes, nextEdges);
  }, [breakpoints, commitGraph, debugActive, elementOfNode, fitView, model, readOnly, stepDebugInfo, transitionDebugInfo]);

  const commands = useMemo(() => sfcCanvasCommands(model), [model]);
  const keyboard = useCanvasKeyboard({
    commands, nodesRef, edgesRef, readOnly, wrapperRef: reactFlowWrapper, commit: commitGraph, show: showGraph, decorate, editorCommand,
    commentOf: (node) => (typeof (node.data as Record<string, unknown>).comment === 'string' ? ((node.data as Record<string, unknown>).comment as string) : undefined),
  });

  // The context menu of the canvas, of a step or transition and of a wire: the commands of the key table (UX-033)
  const menu = useCanvasContextMenu({ editor: 'sfc', nodesRef, edgesRef, readOnly, canPaste: () => clipboardRef.current !== undefined, show: showGraph, run: keyboard.run });

  // Handle drop from toolbox: the element is inserted as the keyboard inserts one, at the place of the drop
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;
      const elementType = event.dataTransfer.getData('application/zplc-sfc');
      if (!elementType) return;
      keyboard.run('insertElement', { elementType, position: screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    },
    [keyboard, readOnly, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <>
    {!readOnly && <SFCToolbox onInsert={(type) => keyboard.run('insertElement', { elementType: type })} />}
    <ContextMenu label={t('editor.menu.canvas')} items={menu.items} className="flex flex-1 h-full">
    <div 
      ref={reactFlowWrapper}
      className="relative flex-1 h-full"
      tabIndex={0}
      role="region"
      aria-label="Sequential function chart canvas"
      aria-keyshortcuts="F1"
      onKeyDown={keyboard.onKeyDown}
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
        onNodeContextMenu={menu.onNodeContextMenu}
        onEdgeContextMenu={menu.onEdgeContextMenu}
        onPaneContextMenu={menu.onPaneContextMenu}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes as EdgeTypes}
        isValidConnection={isValidConnection}
        // deleting is a command of the keyboard table, one gesture for the elements and the wires on them
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Strict}
        defaultViewport={{ x: 50, y: 50, zoom: 1 }}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
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
              if (debugActive && data.isActive) return 'var(--signal-true-border)'; // an active step is a confirmed TRUE
              return 'var(--color-surface-300)';
            }
            if (n.type === 'transition') {
              return 'var(--visual-wire)';
            }
            return 'var(--visual-wire)';
          }}
          maskColor="color-mix(in srgb, var(--visual-canvas) 70%, transparent)"
        />
        
        {/* Debug mode indicator */}
        {debugActive && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 
                          bg-[var(--color-surface-800)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]">
            <span>Debug Mode Active</span>
            <SignalValue tone={activeSteps.size > 0 ? 'true' : 'false'} className="font-mono text-xs ml-2">
              {activeSteps.size} step{activeSteps.size !== 1 ? 's' : ''} active
            </SignalValue>
          </div>
        )}
      </ReactFlow>
      {keyboard.overlay}
      {keyboard.status}
    </div>
    </ContextMenu>
    </>
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

  const stepDebugInfo = useMemo(() => (monitor.active ? stepDebugInfoOf(model.steps, monitor.states) : new Map<string, DebugStepInfo>()), [model.steps, monitor]);

  const activeSteps = useMemo(
    () => new Set(model.steps.filter((step) => stepDebugInfo.get(step.id)?.isActive).map((step) => step.id)),
    [model.steps, stepDebugInfo],
  );

  const transitionDebugInfo = useMemo(
    () => (monitor.active ? transitionDebugInfoOf(model.transitions, monitor.states, activeSteps, monitor.flagsOf) : new Map<string, DebugTransitionInfo>()),
    [model.transitions, monitor, activeSteps],
  );

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
      {/* Main canvas - wrapped in provider (the toolbox is drawn inside it, beside the canvas) */}
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
