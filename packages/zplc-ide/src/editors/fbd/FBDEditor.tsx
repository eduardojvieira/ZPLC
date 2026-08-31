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
  addEdge,
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type FBDModel, type FBDBlock, type FBDConnection, getDefaultPorts } from '../../models/fbd';
import { copyFBDFragment, edgesToConnections, hasCanonicalEdgeChanges, hasCanonicalNodeChanges, nodesToBlocks, pasteFBDFragment, uniqueNodeId, type FBDClipboardFragment } from './graphModel';
import { nodeTypes, getNodeType } from './nodes';
import { edgeTypes } from './edges';
import FBDToolbox from './FBDToolbox';
import InstanceMonitor from './InstanceMonitor';
import { useDebugValues } from '../../hooks/useDebugValue';
import { useIDEStore } from '../../store/useIDEStore';

// =============================================================================
// Props
// =============================================================================

interface FBDEditorProps {
  model: FBDModel;
  onChange?: (model: FBDModel) => void;
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
      type: block.type,
      instanceName: block.instanceName,
      variableName: block.variableName,
      address: block.address,
      dataType: block.dataType,
      value: block.value,
      comment: block.comment,
      inputs: block.inputs,
      outputs: block.outputs,
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
  const { screenToFlowPosition } = useReactFlow();

  const updateNodeDataRef = useRef<((nodeId: string, data: Record<string, unknown>) => void) | undefined>(undefined);
  const [nodes, replaceNodes] = useReducer((_current: Node[], next: Node[]) => next, initialNodes.map((node) => ({
    ...node,
    data: { ...node.data, readOnly, onChangeData: (nodeId: string, data: Record<string, unknown>) => updateNodeDataRef.current?.(nodeId, data) },
  })));
  const [edges, replaceEdges] = useReducer((_current: Edge[], next: Edge[]) => next, initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const clipboardRef = useRef<FBDClipboardFragment | undefined>(undefined);

  const commitGraph = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    replaceNodes(nextNodes);
    replaceEdges(nextEdges);
    if (!readOnly && onChange) {
      onChange({
        ...model,
        blocks: nodesToBlocks(nextNodes),
        connections: edgesToConnections(nextEdges),
      });
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

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      commitGraph(nodesRef.current, addEdge({
        ...params,
        type: 'smoothstep',
        style: { stroke: 'var(--visual-wire)', strokeWidth: 2 },
      }, edgesRef.current));
    },
    [commitGraph, readOnly]
  );

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
          inputs: getDefaultPorts(blockType).inputs,
          outputs: getDefaultPorts(blockType).outputs,
          variableName: blockType.startsWith('COMM_') ? `${blockType}_TAG` : undefined,
          instanceName: blockType.match(/^(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)$/)
            ? `${blockType}_${id}`
            : undefined,
        },
      };

      commitGraph([...nodesRef.current, newNode], edgesRef.current);
    },
    [commitGraph, debugActive, liveValues, onOpenMonitor, readOnly, screenToFlowPosition]
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
  }, [commitGraph, debugActive, liveValues, model, onOpenMonitor, readOnly]);

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
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
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
