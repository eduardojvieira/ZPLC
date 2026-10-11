/**
 * FBDEditor - Main ReactFlow-based Function Block Diagram Editor
 * 
 * Visual editor for IEC 61131-3 FBD programs.
 * Converts FBDModel <-> ReactFlow nodes/edges.
 * 
 * Supports:
 * - Live value display on edges and nodes during debugging
 * - Instance Monitor popup for Function Block inspection
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  type Connection,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type FBDModel, type FBDBlock, type FBDConnection, getDefaultPorts } from '../../models/fbd';
import { applyFBDSelection, blockNodeData, connectBlocks, copyFBDFragment, type WireEnds, edgesToConnections, fbdSelection, nodesToBlocks, pasteFBDFragment, uniqueNodeId, type FBDClipboardFragment } from './graphModel';
import { edgeChangesCommit, nodeChangesCommit } from '../gesture';
import { useGestureCommit } from '../useGestureCommit';
import { getVisualSelection, setVisualSelection, useVisualFileKey } from '../visualSelection';
import type { VisualGesture } from '../visualHistory';
import { nodeTypes, getNodeType } from './nodes';
import { edgeTypes } from './edges';
import FBDToolbox from './FBDToolbox';
import InstanceMonitor from './InstanceMonitor';
import { useDebugValues } from '../../hooks/useDebugValue';
import { useIDEStore } from '../../store/useIDEStore';
import { findProjectBlock } from '../../models/projectBlocks';
import { useProjectBlocks } from '../useProjectBlocks';
import { useElementSelection } from '../elementSelection';
import { useElementBreakpoints } from '../elementBreakpoints';
import { markBreakpointNodes } from '../breakpointMarks';
import { blockElement, parseElement, type SourceElementId } from '../../models/sourceElements';

// =============================================================================
// Props
// =============================================================================

interface FBDEditorProps {
  model: FBDModel;
  /** Called once for each gesture of the user (LNG-010), with what the history needs to know of it. */
  onChange?: (model: FBDModel, gesture?: VisualGesture) => void;
  readOnly?: boolean;
}

// =============================================================================
// Instance Monitor State
// =============================================================================

interface MonitorState {
  instanceName: string;
  blockType: string;
}

// =============================================================================
// Model <-> ReactFlow Conversion
// =============================================================================

/**
 * Convert FBD blocks to ReactFlow nodes
 */
function blocksToNodes(
  blocks: FBDBlock[],
  debugActive: boolean,
  liveValues: Map<string, unknown>,
  onOpenMonitor: (instanceName: string, blockType: string) => void
): Node[] {
  return blocks.map((block) => ({
    id: block.id,
    type: getNodeType(block.type),
    position: block.position,
    data: {
      ...blockNodeData(block),
      // Debug props
      debugActive,
      liveValues,
      onOpenMonitor,
    },
  }));
}

/**
 * Convert FBD connections to ReactFlow edges
 */
function connectionsToEdges(
  connections: FBDConnection[],
  debugActive: boolean,
  liveValues: Map<string, unknown>
): Edge[] {
  return connections.map((conn) => ({
    id: conn.id,
    source: conn.from.block,
    sourceHandle: conn.from.port,
    target: conn.to.block,
    targetHandle: conn.to.port,
    // Use debug edge when debugging, otherwise smoothstep
    type: debugActive ? 'debug' : 'smoothstep',
    animated: false,
    style: debugActive ? undefined : {
      stroke: 'var(--visual-wire)',
      strokeWidth: 2,
    },
    data: debugActive ? {
      liveValue: liveValues.get(`${conn.from.block}.${conn.from.port}`),
      debugActive: true,
    } : undefined,
  }));
}

/**
 * Convert ReactFlow nodes back to FBD blocks
 */
// =============================================================================
// Component
// =============================================================================

interface FBDEditorInnerProps extends FBDEditorProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  debugActive: boolean;
  liveValues: Map<string, unknown>;
  onOpenMonitor: (instanceName: string, blockType: string) => void;
}

function FBDEditorInner({ 
  model, 
  onChange, 
  readOnly = false, 
  initialNodes, 
  initialEdges,
  debugActive,
  liveValues,
  onOpenMonitor,
}: FBDEditorInnerProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const projectBlocks = useProjectBlocks();

  const updateNodeDataRef = useRef<((nodeId: string, data: Record<string, unknown>) => void) | undefined>(undefined);
  const [nodes, replaceNodes] = useReducer((_current: Node[], next: Node[]) => next, initialNodes.map((node) => ({
    ...node,
    data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
  })));
  const [edges, replaceEdges] = useReducer((_current: Edge[], next: Edge[]) => next, initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const clipboardRef = useRef<FBDClipboardFragment | undefined>(undefined);

  // One gesture is one commit (LNG-010): a delete reaches the canvas as the removal of the nodes and then of their
  // wires in one task, and the document is committed once, with the selection from before the gesture and after it.
  const fileKey = useVisualFileKey();
  const fileKeyRef = useRef(fileKey);
  useEffect(() => {
    fileKeyRef.current = fileKey;
  }, [fileKey]);
  const commitModel = useGestureCommit<FBDModel>(onChange);

  const commitGraph = useCallback((nextNodes: Node[], nextEdges: Edge[], coalesce?: string) => {
    const before = fbdSelection(nodesRef.current, edgesRef.current);
    const after = fbdSelection(nextNodes, nextEdges);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    setVisualSelection(fileKeyRef.current, after);
    if (!readOnly && onChange) {
      commitModel({
        ...model,
        blocks: nodesToBlocks(nextNodes),
        connections: edgesToConnections(nextEdges),
      }, { before, after, ...(coalesce === undefined ? {} : { coalesce }) });
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
    const shown = applyFBDSelection(
      initialNodes.map((node) => ({ ...node, data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) } })),
      initialEdges,
      getVisualSelection(fileKeyRef.current),
    );
    nodesRef.current = shown.nodes;
    edgesRef.current = shown.edges;
    replaceNodes(shown.nodes);
    replaceEdges(shown.edges);
  }, [initialNodes, initialEdges, readOnly]);

  // Update nodes/edges when debug state changes
  useEffect(() => {
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      data: {
        ...node.data,
        debugActive,
        liveValues,
        onOpenMonitor,
      },
    }));
    nodesRef.current = nextNodes;
    replaceNodes(nextNodes);
  }, [debugActive, liveValues, onOpenMonitor]);

  useEffect(() => {
    const nextEdges = edgesRef.current.map((edge) => ({
      ...edge,
      type: debugActive ? 'debug' : 'smoothstep',
      style: debugActive ? undefined : { stroke: 'var(--visual-wire)', strokeWidth: 2 },
      data: debugActive ? {
        liveValue: liveValues.get(`${edge.source}.${edge.sourceHandle}`),
        debugActive: true,
      } : undefined,
    }));
    edgesRef.current = nextEdges;
    replaceEdges(nextEdges);
  }, [debugActive, liveValues]);

  // Breakpoints on blocks: execution stops at the first statement the block generates (LNG-004)
  const breakpoints = useElementBreakpoints();
  const markedNodes = useMemo(
    () => markBreakpointNodes(nodes, (node) => blockElement(node.id), breakpoints),
    [nodes, breakpoints],
  );

  // Activating a problem of this diagram selects the block or the wire it is about, and brings it into view (LNG-003)
  const selectElement = useCallback((element: SourceElementId) => {
    const parsed = parseElement(element);
    if (parsed?.kind === 'block' && nodesRef.current.some((node) => node.id === parsed.id)) {
      const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: node.id === parsed.id }));
      const nextEdges = edgesRef.current.map((edge) => edge.selected ? { ...edge, selected: false } : edge);
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      replaceNodes(nextNodes);
      replaceEdges(nextEdges);
      setVisualSelection(fileKeyRef.current, fbdSelection(nextNodes, nextEdges));
      void fitView({ nodes: [{ id: parsed.id }], maxZoom: 1, duration: 200 });
    } else if (parsed?.kind === 'connection' && edgesRef.current.some((edge) => edge.id === parsed.id)) {
      const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: edge.id === parsed.id }));
      const nextNodes = nodesRef.current.map((node) => node.selected ? { ...node, selected: false } : node);
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      replaceNodes(nextNodes);
      replaceEdges(nextEdges);
      setVisualSelection(fileKeyRef.current, fbdSelection(nextNodes, nextEdges));
    }
  }, [fitView]);
  useElementSelection(selectElement);

  // A wire between pins of types that do not match is refused, and the reason is shown (LNG-013)
  const [refusal, setRefusal] = useState<string | null>(null);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  const drawWire = useCallback(
    (params: WireEnds) =>
      connectBlocks(modelRef.current, nodesRef.current, edgesRef.current, params, projectBlocks),
    [projectBlocks]
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      const wire = drawWire(params);
      setRefusal(wire.refusal ?? null);
      if (wire.refusal === undefined) commitGraph(nodesRef.current, wire.edges);
    },
    [commitGraph, drawWire, readOnly]
  );

  // The canvas does not call onConnect for a wire that isValidConnection refuses: the reason is read when the drag ends
  const isValidConnection = useCallback(
    (wire: Edge | Connection) => drawWire(wire).refusal === undefined,
    [drawWire]
  );
  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid !== false || !state.fromNode || !state.toNode || !state.fromHandle?.id || !state.toHandle?.id) return;
      const wire = drawWire({ source: state.fromNode.id, sourceHandle: state.fromHandle.id, target: state.toNode.id, targetHandle: state.toHandle.id });
      if (wire.refusal !== undefined) setRefusal(wire.refusal);
    },
    [drawWire]
  );

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
        if (changes.some((change) => change.type === 'select')) setVisualSelection(fileKeyRef.current, fbdSelection(nextNodes, edgesRef.current));
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
        if (changes.some((change) => change.type === 'select')) setVisualSelection(fileKeyRef.current, fbdSelection(nodesRef.current, nextEdges));
      }
    },
    [commitGraph, readOnly]
  );

  // Handle drop from toolbox
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;

      const blockType = event.dataTransfer.getData('application/zplc-block');
      if (!blockType) return;

      // Convert screen coordinates to flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Generate unique ID
      const id = uniqueNodeId(`${blockType.toLowerCase()}_${Date.now()}`, nodesRef.current);

      const newNode: Node = {
        id,
        type: getNodeType(blockType),
        position,
        data: {
          type: blockType,
          readOnly,
          onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data),
          debugActive,
          liveValues,
          onOpenMonitor,
          // a block the project declares has the ports of its declaration (LNG-008)
          inputs: getDefaultPorts(blockType, projectBlocks).inputs,
          outputs: getDefaultPorts(blockType, projectBlocks).outputs,
          variableName: blockType.startsWith('COMM_') ? `${blockType}_TAG` : undefined,
          instanceName: blockType.match(/^(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)$/)
            || findProjectBlock(projectBlocks, blockType)?.kind === 'FUNCTION_BLOCK'
            ? `${blockType}_${id}`
            : undefined,
        },
      };

      commitGraph([...nodesRef.current, newNode], edgesRef.current);
    },
    [commitGraph, debugActive, liveValues, onOpenMonitor, projectBlocks, readOnly, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'F9') {
      const selected = nodesRef.current.filter((node) => node.selected);
      if (selected.length === 0) return;
      for (const node of selected) breakpoints.toggle(blockElement(node.id));
      event.preventDefault();
      return;
    }
    if (readOnly || event.altKey || event.shiftKey || event.ctrlKey === event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'c') {
      const fragment = copyFBDFragment(nodesRef.current, edgesRef.current);
      if (!fragment) return;
      clipboardRef.current = fragment;
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() !== 'v' || !clipboardRef.current) return;
    const currentModel = { ...model, blocks: nodesToBlocks(nodesRef.current), connections: edgesToConnections(edgesRef.current) };
    const pasted = pasteFBDFragment(currentModel, clipboardRef.current);
    if (!pasted) return;
    const added = pasted.blocks.slice(currentModel.blocks.length);
    const addedConnections = pasted.connections.slice(currentModel.connections.length);
    const nextNodes = [
      ...nodesRef.current.map((node) => ({ ...node, selected: false })),
      ...blocksToNodes(added, debugActive, liveValues, onOpenMonitor).map((node) => ({
        ...node,
        selected: true,
        data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
      })),
    ];
    const nextEdges = [...edgesRef.current.map((edge) => ({ ...edge, selected: false })), ...connectionsToEdges(addedConnections, debugActive, liveValues)];
    event.preventDefault();
    commitGraph(nextNodes, nextEdges);
  }, [breakpoints, commitGraph, debugActive, liveValues, model, onOpenMonitor, readOnly]);

  return (
    <div
      className="flex-1 h-full"
      tabIndex={0}
      role="region"
      aria-label="Function block diagram canvas"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={markedNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        edgesFocusable={!readOnly}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes as EdgeTypes}
        connectionMode={ConnectionMode.Loose}
        defaultViewport={{ x: 50, y: 50, zoom: 1 }}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.5}
        maxZoom={1.5}
        // Use CSS variable for background
        style={{ backgroundColor: 'var(--color-surface-900)' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-surface-500)"
        />
        {refusal && (
          <Panel position="top-center">
            <div
              role="alert"
              data-wire-refused
              className="max-w-xl rounded border border-[var(--color-accent-red)] bg-[var(--color-surface-800)] px-3 py-2 text-xs text-[var(--color-surface-100)] shadow"
            >
              <span className="font-semibold">Wire refused. </span>{refusal}
              <button type="button" className="ml-2 underline" onClick={() => setRefusal(null)}>Dismiss</button>
            </div>
          </Panel>
        )}
        <Controls
          className="!bg-[var(--color-surface-800)] !border-[var(--color-surface-600)] !rounded-lg"
          showZoom
          showFitView
          showInteractive={!readOnly}
        />
        <MiniMap
          className="!bg-[var(--color-surface-800)] !border-[var(--color-surface-600)] !rounded-lg"
          nodeColor={(n) => {
            if (n.type === 'functionBlock') return '#d97706';
            if (n.type === 'logicGate') return '#6366f1';
            if (n.type === 'constant') return '#8b5cf6';
            if (n.type === 'variable') return '#eab308';
            return 'var(--visual-wire)';
          }}
          maskColor="var(--color-surface-600)"
        />
      </ReactFlow>
    </div>
  );
}

export default function FBDEditor({ model, onChange, readOnly = false }: FBDEditorProps) {
  // Debug state
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugActive = debugMode !== 'none';
  
  // Instance monitor state
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  
  // Collect all variable paths for live value subscription
  const variablePaths = useMemo(() => {
    const paths: string[] = [];
    for (const block of model.blocks) {
      if (block.instanceName) {
        // Add all port paths for function blocks
        const { inputs, outputs } = block;
        if (inputs) {
          for (const inp of inputs) {
            paths.push(`${block.instanceName}.${inp.name}`);
          }
        }
        if (outputs) {
          for (const out of outputs) {
            paths.push(`${block.instanceName}.${out.name}`);
          }
        }
      }
      if (block.variableName) {
        paths.push(block.variableName);
      }
    }
    return paths;
  }, [model.blocks]);
  
  // Subscribe to live values
  const liveValues = useDebugValues(variablePaths);
  
  // Handler for opening instance monitor
  const handleOpenMonitor = useCallback((instanceName: string, blockType: string) => {
    setMonitorState({ instanceName, blockType });
  }, []);
  
  // Convert model to ReactFlow format with debug data
  const initialNodes = useMemo(
    () => blocksToNodes(model.blocks, false, new Map(), handleOpenMonitor),
    [model.blocks, handleOpenMonitor]
  );
  const initialEdges = useMemo(
    () => connectionsToEdges(model.connections, false, new Map()),
    [model.connections]
  );

  return (
    <div className="zplc-visual-editor w-full h-full flex">
      {/* Toolbox sidebar */}
      {!readOnly && <FBDToolbox />}

      {/* Main canvas - wrapped in provider */}
      <ReactFlowProvider>
        <FBDEditorInner
          model={model}
          onChange={onChange}
          readOnly={readOnly}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          debugActive={debugActive}
          liveValues={liveValues}
          onOpenMonitor={handleOpenMonitor}
        />
      </ReactFlowProvider>
      
      {/* Instance Monitor Modal */}
      {monitorState && (
        <InstanceMonitor
          instanceName={monitorState.instanceName}
          blockType={monitorState.blockType}
          onClose={() => setMonitorState(null)}
        />
      )}
    </div>
  );
}
