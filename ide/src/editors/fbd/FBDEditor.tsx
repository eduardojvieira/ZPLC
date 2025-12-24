/**
 * FBDEditor - Main ReactFlow-based Function Block Diagram Editor
 * 
 * Visual editor for IEC 61131-3 FBD programs.
 * Converts FBDModel <-> ReactFlow nodes/edges.
 */

import { useCallback, useMemo } from 'react';
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
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type FBDModel, type FBDBlock, type FBDConnection } from '../../models/fbd';
import { nodeTypes, getNodeType } from './nodes';
import FBDToolbox from './FBDToolbox';

// =============================================================================
// Props
// =============================================================================

interface FBDEditorProps {
  model: FBDModel;
  onChange?: (model: FBDModel) => void;
  readOnly?: boolean;
}

// =============================================================================
// Model <-> ReactFlow Conversion
// =============================================================================

/**
 * Convert FBD blocks to ReactFlow nodes
 */
function blocksToNodes(blocks: FBDBlock[]): Node[] {
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
    // Industrial-style edges
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: '#64748b',
      strokeWidth: 2,
    },
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
}

function FBDEditorInner({ model, onChange, readOnly = false, initialNodes, initialEdges }: FBDEditorInnerProps) {
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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
  // Convert model to ReactFlow format
  const initialNodes = useMemo(() => blocksToNodes(model.blocks), [model.blocks]);
  const initialEdges = useMemo(() => connectionsToEdges(model.connections), [model.connections]);

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
        />
      </ReactFlowProvider>
    </div>
  );
}
