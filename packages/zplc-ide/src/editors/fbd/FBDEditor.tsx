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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { animationMs } from '../../theme/motion';

import { type FBDModel, type FBDBlock, type FBDConnection } from '../../models/fbd';
import { applyFBDSelection, blockNodeData, connectBlocks, copyFBDFragment, type WireEnds, edgesToConnections, fbdSelection, nodesToBlocks, pasteFBDFragment, type FBDClipboardFragment } from './graphModel';
import { edgeChangesCommit, nodeChangesCommit } from '../gesture';
import { useGestureCommit } from '../useGestureCommit';
import { getVisualSelection, setVisualSelection, useVisualFileKey } from '../visualSelection';
import type { VisualGesture } from '../visualHistory';
import { nodeTypes, getNodeType } from './nodes';
import { edgeTypes } from './edges';
import FBDToolbox from './FBDToolbox';
import InstanceMonitor from './InstanceMonitor';
import { useMonitor } from '../../monitoring/useMonitor';
import type { ElementState, Reading } from '../../monitoring/elementStates';
import { useProjectBlocks } from '../useProjectBlocks';
import { fbdCanvasCommands } from './keyboard';
import { useCanvasKeyboard } from '../useCanvasKeyboard';
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
 * Convert FBD blocks to ReactFlow nodes. What a node shows online is not part of it: it is put on the nodes that are
 * drawn (`shownNodes` below), from the monitor of the build, so a rebuilt canvas does not lose it.
 */
function blocksToNodes(
  blocks: FBDBlock[],
  onOpenMonitor: (instanceName: string, blockType: string) => void
): Node[] {
  return blocks.map((block) => ({
    id: block.id,
    type: getNodeType(block.type),
    position: block.position,
    data: {
      ...blockNodeData(block),
      onOpenMonitor,
    },
  }));
}

/**
 * Convert FBD connections to ReactFlow edges
 */
function connectionsToEdges(connections: FBDConnection[]): Edge[] {
  return connections.map((conn) => ({
    id: conn.id,
    source: conn.from.block,
    sourceHandle: conn.from.port,
    target: conn.to.block,
    targetHandle: conn.to.port,
    type: 'smoothstep',
    style: {
      stroke: 'var(--visual-wire)',
      strokeWidth: 2,
    },
  }));
}

/** The value of each pin of each block online, by block id: its outputs, and its inputs as what is wired to them. */
function pinValuesOf(
  blocks: readonly FBDBlock[],
  connections: readonly FBDConnection[],
  states: ReadonlyMap<string, ElementState>,
): Map<string, Record<string, Reading>> {
  const outputs = (blockId: string): Record<string, Reading> => states.get(blockElement(blockId))?.pins ?? {};
  const constants = new Map(blocks.filter((block) => block.type === 'constant').map((block) => [block.id, block.value as Reading] as const));
  const sourceValue = (connection: FBDConnection): Reading =>
    constants.has(connection.from.block) ? constants.get(connection.from.block) : outputs(connection.from.block)[connection.from.port];
  const pins = new Map<string, Record<string, Reading>>(blocks.map((block) => [block.id, { ...outputs(block.id) }]));
  for (const connection of connections) {
    const own = pins.get(connection.to.block);
    if (own && !(connection.to.port in own)) own[connection.to.port] = sourceValue(connection);
  }
  return pins;
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
  /** The value each pin holds online (LNG-006); undefined while the program is not running under Studio. */
  pins: ReadonlyMap<string, Record<string, Reading>> | undefined;
  onOpenMonitor: (instanceName: string, blockType: string) => void;
}

function FBDEditorInner({ 
  model, 
  onChange, 
  readOnly = false, 
  initialNodes, 
  initialEdges,
  pins,
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

  // Breakpoints on blocks: execution stops at the first statement the block generates (LNG-004)
  const breakpoints = useElementBreakpoints();
  const debugActive = pins !== undefined;
  // what the nodes and wires show online: put on the ones that are drawn, so that it follows a rebuilt canvas (LNG-006)
  const markedNodes = useMemo(
    () => markBreakpointNodes(
      debugActive ? nodes.map((node) => ({ ...node, data: { ...node.data, debugActive, pinValues: pins.get(node.id) } })) : nodes,
      (node) => blockElement(node.id),
      breakpoints,
    ),
    [nodes, breakpoints, debugActive, pins],
  );
  const shownEdges = useMemo(
    () => (!debugActive ? edges : edges.map((edge) => ({
      ...edge,
      type: 'debug',
      style: undefined,
      data: { liveValue: pins.get(edge.source)?.[edge.sourceHandle ?? 'OUT'], debugActive: true },
    }))),
    [edges, debugActive, pins],
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
      void fitView({ nodes: [{ id: parsed.id }], maxZoom: 1, duration: animationMs(200) });
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

  // What a command of the keyboard adds to the canvas: the nodes it makes carry what every node of the canvas carries
  const decorate = useCallback((node: Node): Node => ({
    ...node,
    data: {
      ...node.data,
      readOnly,
      onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data),
      onOpenMonitor,
    },
  }), [onOpenMonitor, readOnly]);

  // The cursor moved, or the selection changed: the canvas shows it and the document does not change
  const showGraph = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    setVisualSelection(fileKeyRef.current, fbdSelection(nextNodes, nextEdges));
  }, []);

  // The clipboard, and the breakpoints of the selected blocks
  const editorCommand = useCallback((command: string) => {
    if (command === 'toggleBreakpoint') {
      for (const node of nodesRef.current.filter((candidate) => candidate.selected)) breakpoints.toggle(blockElement(node.id));
      return;
    }
    if (readOnly) return;
    if (command === 'copySelection') {
      const fragment = copyFBDFragment(nodesRef.current, edgesRef.current);
      if (fragment) clipboardRef.current = fragment;
      return;
    }
    if (command !== 'pasteSelection' || !clipboardRef.current) return;
    const currentModel = { ...model, blocks: nodesToBlocks(nodesRef.current), connections: edgesToConnections(edgesRef.current) };
    const pasted = pasteFBDFragment(currentModel, clipboardRef.current);
    if (!pasted) return;
    const added = pasted.blocks.slice(currentModel.blocks.length);
    const addedConnections = pasted.connections.slice(currentModel.connections.length);
    const nextNodes = [
      ...nodesRef.current.map((node) => ({ ...node, selected: false })),
      ...blocksToNodes(added, onOpenMonitor).map((node) => ({
        ...node,
        selected: true,
        data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
      })),
    ];
    const nextEdges = [...edgesRef.current.map((edge) => ({ ...edge, selected: false })), ...connectionsToEdges(addedConnections)];
    commitGraph(nextNodes, nextEdges);
  }, [breakpoints, commitGraph, model, onOpenMonitor, readOnly]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => fbdCanvasCommands(model, projectBlocks), [model, projectBlocks]);
  const keyboard = useCanvasKeyboard({
    commands, nodesRef, edgesRef, readOnly, wrapperRef, commit: commitGraph, show: showGraph, decorate, editorCommand,
    commentOf: (node) => (typeof (node.data as Record<string, unknown>).comment === 'string' ? ((node.data as Record<string, unknown>).comment as string) : undefined),
  });

  // Handle drop from toolbox: the block is inserted as the keyboard inserts one, at the place of the drop
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;
      const blockType = event.dataTransfer.getData('application/zplc-block');
      if (!blockType) return;
      keyboard.run('insertElement', { blockType, position: screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    },
    [keyboard, readOnly, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // A double click on a block asks what it holds, as F2 does
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (readOnly) return;
    const next = nodesRef.current.map((candidate) => ({ ...candidate, selected: candidate.id === node.id }));
    showGraph(next, edgesRef.current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)));
    keyboard.run('bindVariable');
  }, [keyboard, readOnly, showGraph]);

  return (
    <>
    {!readOnly && <FBDToolbox onInsert={(type) => keyboard.run('insertElement', { blockType: type })} />}
    <div
      ref={wrapperRef}
      className="relative flex-1 h-full"
      tabIndex={0}
      role="region"
      aria-label="Function block diagram canvas"
      aria-keyshortcuts="F1"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onKeyDown={keyboard.onKeyDown}
    >
      <ReactFlow
        nodes={markedNodes}
        edges={shownEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeDoubleClick={onNodeDoubleClick}
        // deleting is a command of the keyboard table, one gesture for the blocks and the wires on them
        deleteKeyCode={null}
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
              className="max-w-xl rounded border border-[var(--color-accent-red)] bg-[var(--color-surface-800)] px-3 py-2 text-xs text-[var(--color-surface-100)]"
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
          nodeColor="var(--visual-wire)"
          maskColor="color-mix(in srgb, var(--visual-canvas) 70%, transparent)"
        />
      </ReactFlow>
      {keyboard.overlay}
      {keyboard.status}
    </div>
    </>
  );
}

export default function FBDEditor({ model, onChange, readOnly = false }: FBDEditorProps) {
  // Online values: the debug map of the build says which variable holds each pin (LNG-006)
  const monitor = useMonitor();

  // Instance monitor state
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);

  const pins = useMemo(
    () => (monitor.active ? pinValuesOf(model.blocks, model.connections, monitor.states) : undefined),
    [model.blocks, model.connections, monitor],
  );

  // Handler for opening instance monitor
  const handleOpenMonitor = useCallback((instanceName: string, blockType: string) => {
    setMonitorState({ instanceName, blockType });
  }, []);
  
  // Convert model to ReactFlow format with debug data
  const initialNodes = useMemo(
    () => blocksToNodes(model.blocks, handleOpenMonitor),
    [model.blocks, handleOpenMonitor]
  );
  const initialEdges = useMemo(
    () => connectionsToEdges(model.connections),
    [model.connections]
  );

  return (
    <div className="zplc-visual-editor w-full h-full flex">
      {/* Main canvas - wrapped in provider (the toolbox is drawn inside it, beside the canvas) */}
      <ReactFlowProvider>
        <FBDEditorInner
          model={model}
          onChange={onChange}
          readOnly={readOnly}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          pins={pins}
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
