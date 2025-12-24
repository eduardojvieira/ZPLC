/**
 * SFCEditor - Main ReactFlow-based Sequential Function Chart Editor
 * 
 * Visual editor for IEC 61131-3 SFC programs.
 * Converts SFCModel <-> ReactFlow nodes/edges.
 */

import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { type SFCModel, type SFCStep, type SFCTransition } from '../../models/sfc';
import { nodeTypes } from './nodes';
import SFCToolbox from './SFCToolbox';

// =============================================================================
// Props
// =============================================================================

interface SFCEditorProps {
  model: SFCModel;
  onChange?: (model: SFCModel) => void;
  readOnly?: boolean;
}

// =============================================================================
// Model <-> ReactFlow Conversion
// =============================================================================

/**
 * Convert SFC steps to ReactFlow nodes
 */
function stepsToNodes(steps: SFCStep[]): Node[] {
  return steps.map((step) => ({
    id: step.id,
    type: 'step',
    position: step.position,
    data: {
      name: step.name,
      isInitial: step.isInitial,
      actions: step.actions,
      comment: step.comment,
    },
  }));
}

/**
 * Convert SFC transitions to ReactFlow nodes
 * Note: In SFC, transitions are nodes, not edges!
 */
function transitionsToNodes(transitions: SFCTransition[]): Node[] {
  return transitions.map((trans) => ({
    id: trans.id,
    type: 'transition',
    position: trans.position || { x: 200, y: 150 },
    data: {
      condition: trans.condition,
      fromStep: trans.fromStep,
      toStep: trans.toStep,
      comment: trans.comment,
    },
  }));
}

/**
 * Create edges from SFC transitions (step -> transition -> step)
 */
function transitionsToEdges(transitions: SFCTransition[]): Edge[] {
  const edges: Edge[] = [];
  
  for (const trans of transitions) {
    // Edge from source step to transition
    edges.push({
      id: `${trans.fromStep}_to_${trans.id}`,
      source: trans.fromStep,
      sourceHandle: 'out',
      target: trans.id,
      targetHandle: 'in',
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    });
    
    // Edge from transition to target step
    edges.push({
      id: `${trans.id}_to_${trans.toStep}`,
      source: trans.id,
      sourceHandle: 'out',
      target: trans.toStep,
      targetHandle: 'in',
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    });
  }
  
  return edges;
}

/**
 * Convert ReactFlow nodes back to SFC steps
 */
function nodesToSteps(nodes: Node[]): SFCStep[] {
  return nodes
    .filter((node) => node.type === 'step')
    .map((node) => {
      const data = node.data as Record<string, unknown>;
      return {
        id: node.id,
        name: data.name as string,
        isInitial: data.isInitial as boolean || false,
        position: node.position,
        actions: data.actions as SFCStep['actions'],
        comment: data.comment as string | undefined,
      };
    });
}

/**
 * Convert ReactFlow nodes back to SFC transitions
 */
function nodesToTransitions(nodes: Node[], edges: Edge[]): SFCTransition[] {
  return nodes
    .filter((node) => node.type === 'transition')
    .map((node) => {
      const data = node.data as Record<string, unknown>;
      
      // Find connected steps from edges
      const incomingEdge = edges.find((e) => e.target === node.id);
      const outgoingEdge = edges.find((e) => e.source === node.id);
      
      return {
        id: node.id,
        fromStep: incomingEdge?.source || (data.fromStep as string) || '',
        toStep: outgoingEdge?.target || (data.toStep as string) || '',
        condition: data.condition as string || 'TRUE',
        position: node.position,
        comment: data.comment as string | undefined,
      };
    });
}

// =============================================================================
// Inner Editor Component (has access to ReactFlow context)
// =============================================================================

interface SFCEditorInnerProps extends SFCEditorProps {
  initialNodes: Node[];
  initialEdges: Edge[];
}

function SFCEditorInner({ model, onChange, readOnly = false, initialNodes, initialEdges }: SFCEditorInnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (readOnly) return;
      
      // SFC has strict topology: Step -> Transition -> Step
      // For now, allow any connection and validate later
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      }, eds));
    },
    [setEdges, readOnly]
  );

  // Notify parent of changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      if (onChange && !readOnly) {
        // Update model with current state (after React state update)
        setTimeout(() => {
          setNodes((currentNodes) => {
            setEdges((currentEdges) => {
              const updatedModel: SFCModel = {
                ...model,
                steps: nodesToSteps(currentNodes),
                transitions: nodesToTransitions(currentNodes, currentEdges),
              };
              onChange(updatedModel);
              return currentEdges;
            });
            return currentNodes;
          });
        }, 0);
      }
    },
    [onNodesChange, onChange, model, readOnly, setNodes, setEdges]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (onChange && !readOnly) {
        setTimeout(() => {
          setNodes((currentNodes) => {
            setEdges((currentEdges) => {
              const updatedModel: SFCModel = {
                ...model,
                steps: nodesToSteps(currentNodes),
                transitions: nodesToTransitions(currentNodes, currentEdges),
              };
              onChange(updatedModel);
              return currentEdges;
            });
            return currentNodes;
          });
        }, 0);
      }
    },
    [onEdgesChange, onChange, model, readOnly, setNodes, setEdges]
  );

  // Handle drop from toolbox
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;

      const elementType = event.dataTransfer.getData('application/zplc-sfc');
      if (!elementType) return;

      // Convert screen coordinates to flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Generate unique ID
      const id = `${elementType}_${Date.now()}`;
      const timestamp = Date.now().toString(36);

      let newNode: Node;

      switch (elementType) {
        case 'step':
          newNode = {
            id,
            type: 'step',
            position,
            data: {
              name: `Step_${timestamp}`,
              isInitial: false,
              actions: [],
            },
          };
          break;
          
        case 'initial_step':
          newNode = {
            id,
            type: 'step',
            position,
            data: {
              name: `Init_${timestamp}`,
              isInitial: true,
              actions: [],
            },
          };
          break;
          
        case 'transition':
          newNode = {
            id,
            type: 'transition',
            position,
            data: {
              condition: 'TRUE',
              fromStep: '',
              toStep: '',
            },
          };
          break;
          
        default:
          // TODO: Handle branch elements
          return;
      }

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
      ref={reactFlowWrapper}
      className="flex-1 h-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes as NodeTypes}
        connectionMode={ConnectionMode.Loose}
        defaultViewport={{ x: 50, y: 50, zoom: 1 }}
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
              return data.isInitial ? '#d97706' : '#64748b';
            }
            if (n.type === 'transition') return '#22c55e';
            return '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}

// =============================================================================
// Main Component (with Provider)
// =============================================================================

export default function SFCEditor({ model, onChange, readOnly = false }: SFCEditorProps) {
  // Convert model to ReactFlow format
  const initialNodes = useMemo(() => [
    ...stepsToNodes(model.steps),
    ...transitionsToNodes(model.transitions),
  ], [model.steps, model.transitions]);
  
  const initialEdges = useMemo(() => transitionsToEdges(model.transitions), [model.transitions]);

  return (
    <div className="w-full h-full flex">
      {/* Toolbox sidebar */}
      {!readOnly && <SFCToolbox />}

      {/* Main canvas - wrapped in provider */}
      <ReactFlowProvider>
        <SFCEditorInner
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
