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

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
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

import { type FBDModel, type FBDBlock, type FBDConnection } from '../../models/fbd';
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
      stroke: '#64748b',
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
function nodesToBlocks(nodes: Node[]): FBDBlock[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    return {
      id: node.id,
      type: data.type as string,
      position: node.position,
      instanceName: data.instanceName as string | undefined,
      variableName: data.variableName as string | undefined,
      dataType: data.dataType as string | undefined,
      value: data.value,
      comment: data.comment as string | undefined,
      inputs: data.inputs as FBDBlock['inputs'],
      outputs: data.outputs as FBDBlock['outputs'],
    };
  });
}

/**
 * Convert ReactFlow edges back to FBD connections
 */
function edgesToConnections(edges: Edge[]): FBDConnection[] {
  return edges.map((edge) => ({
    id: edge.id,
    from: {
      block: edge.source,
      port: edge.sourceHandle || 'OUT',
    },
    to: {
      block: edge.target,
      port: edge.targetHandle || 'IN',
    },
  }));
}

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

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when debug state changes
  useMemo(() => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        debugActive,
        liveValues,
        onOpenMonitor,
      },
    })));
  }, [debugActive, liveValues, onOpenMonitor, setNodes]);

  useMemo(() => {
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      type: debugActive ? 'debug' : 'smoothstep',
      style: debugActive ? undefined : { stroke: '#64748b', strokeWidth: 2 },
      data: debugActive ? {
        liveValue: liveValues.get(`${edge.source}.${edge.sourceHandle}`),
        debugActive: true,
      } : undefined,
    })));
  }, [debugActive, liveValues, setEdges]);

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        style: { stroke: '#64748b', strokeWidth: 2 },
      }, eds));
    },
    [setEdges, readOnly]
  );

  // Notify parent of changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      if (onChange && !readOnly) {
        // Debounce this in production
        const updatedModel: FBDModel = {
          ...model,
          blocks: nodesToBlocks(nodes),
          connections: edgesToConnections(edges),
        };
        onChange(updatedModel);
      }
    },
    [onNodesChange, onChange, model, nodes, edges, readOnly]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (onChange && !readOnly) {
        const updatedModel: FBDModel = {
          ...model,
          blocks: nodesToBlocks(nodes),
          connections: edgesToConnections(edges),
        };
        onChange(updatedModel);
      }
    },
    [onEdgesChange, onChange, model, nodes, edges, readOnly]
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
      const id = `${blockType.toLowerCase()}_${Date.now()}`;

      const newNode: Node = {
        id,
        type: getNodeType(blockType),
        position,
        data: {
          type: blockType,
          instanceName: blockType.match(/^(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)$/)
            ? `${blockType}_${Date.now().toString(36)}`
            : undefined,
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, readOnly, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div
      className="flex-1 h-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
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
            return '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
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
    () => blocksToNodes(model.blocks, debugActive, liveValues, handleOpenMonitor),
    [model.blocks, debugActive, liveValues, handleOpenMonitor]
  );
  const initialEdges = useMemo(
    () => connectionsToEdges(model.connections, debugActive, liveValues),
    [model.connections, debugActive, liveValues]
  );

  return (
    <div className="w-full h-full flex">
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
