'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  useReactFlow,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { ActionNode } from './ActionNode';
import { ActionToolbox } from './ActionToolbox';
import { ActionType, ActionNodeData } from '@/lib/admin/scrapers/types';

// Register custom node types
const nodeTypes = {
  actionNode: ActionNode,
};

// Convert workflow steps to React Flow nodes
function workflowToNodes(workflows: { action: string; name?: string; params?: Record<string, unknown> }[]): Node<ActionNodeData>[] {
  const VERTICAL_SPACING = 120;
  const START_Y = 50;
  const CENTER_X = 400;

  return workflows.map((step, index) => ({
    id: `step-${index}`,
    type: 'actionNode',
    position: { x: CENTER_X, y: START_Y + index * VERTICAL_SPACING },
    data: {
      step: { ...step, params: step.params || {} },
      label: step.name || `Step ${index + 1}`,
      actionType: step.action,
      index,
    },
  }));
}

// Convert workflow steps to React Flow edges
function workflowToEdges(workflows: { action: string }[]): Edge[] {
  if (workflows.length < 2) return [];
  
  return workflows.slice(0, -1).map((_, index) => ({
    id: `edge-${index}-${index + 1}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#348C41', strokeWidth: 2 },
  }));
}

function WorkflowCanvas() {
  const { config, addWorkflowStep, moveWorkflowStep } = useScraperEditorStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const workflows = config.workflows ?? [];

  // Convert store workflows to nodes/edges
  const initialNodes = useMemo(() => workflowToNodes(workflows), [workflows]);
  const initialEdges = useMemo(() => workflowToEdges(workflows), [workflows]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes when store changes
  React.useEffect(() => {
    setNodes(workflowToNodes(workflows));
    setEdges(workflowToEdges(workflows));
  }, [workflows, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Only allow connecting sequential nodes for now
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds));
    },
    [setEdges]
  );

  // Handle drop from toolbox
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const actionType = event.dataTransfer.getData('application/reactflow-action') as ActionType;
      if (!actionType) return;

      // Get drop position on canvas
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Find the best insertion index based on Y position
      let insertIndex = workflows.length;
      const existingNodes = workflowToNodes(workflows);
      
      for (let i = 0; i < existingNodes.length; i++) {
        if (position.y < existingNodes[i].position.y) {
          insertIndex = i;
          break;
        }
      }

      addWorkflowStep(actionType, insertIndex);
    },
    [screenToFlowPosition, addWorkflowStep, workflows]
  );

  // Handle node drag end to reorder
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const currentIndex = parseInt(node.id.replace('step-', ''), 10);
      const allNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);
      const newIndex = allNodes.findIndex((n) => n.id === node.id);

      if (currentIndex !== newIndex && newIndex !== -1) {
        moveWorkflowStep(currentIndex, newIndex);
      }
    },
    [nodes, moveWorkflowStep]
  );

  return (
    <div className="flex h-full">
      <ActionToolbox />
      
      <div ref={reactFlowWrapper} className="flex-1 bg-muted/5">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#348C41', strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <Controls 
            className="!bg-background !border !shadow-md"
            showInteractive={false}
          />
          <MiniMap 
            nodeColor={(node) => {
              const actionType = (node.data as ActionNodeData)?.actionType;
              switch (actionType) {
                case 'navigate': return '#348C41';
                case 'click': return '#3B82F6';
                case 'wait': return '#F59E0B';
                case 'extract_and_transform': return '#14B8A6';
                default: return '#6B7280';
              }
            }}
            maskColor="rgb(0, 0, 0, 0.1)"
            className="!bg-background !border !shadow-md"
          />
          
          {/* Empty state */}
          {workflows.length === 0 && (
            <Panel position="top-center" className="mt-20">
              <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground bg-background/80 backdrop-blur">
                <p className="text-lg font-medium mb-2">Drag actions here to build your workflow</p>
                <p className="text-sm">Drop action cards from the left panel onto this canvas</p>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
