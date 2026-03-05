'use client';

import { useCallback, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Save,
  Plus,
  FileCode,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

import { ScraperRecord, WorkflowStep } from '@/lib/admin/scrapers/types';
import { workflowToNodes, nodesToWorkflow, createNewStep, WorkflowNode } from '@/lib/admin/scrapers/workflow-utils';
import { actionDefinitions, actionCategories } from '@/lib/admin/scrapers/action-definitions';
import { updateScraper } from '@/app/admin/scrapers/actions';
import { useUndoRedo } from '@/lib/admin/scrapers/use-undo-redo';
import { ScraperStatusBadge, ScraperHealthBadge } from './ScraperStatusBadge';
import { ActionNode } from './workflow/ActionNode';
import { StepEditorPanel } from './workflow/StepEditorPanel';

const nodeTypes = {
  actionNode: ActionNode,
};

interface WorkflowBuilderClientProps {
  scraper: ScraperRecord;
}

export function WorkflowBuilderClient({ scraper }: WorkflowBuilderClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const initialData = workflowToNodes(scraper.config?.workflows || []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo(
    nodes as WorkflowNode[],
    edges,
    setNodes as React.Dispatch<React.SetStateAction<WorkflowNode[]>>,
    setEdges
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds));
      setHasChanges(true);
    },
    [setEdges]
  );

  const handleAddStep = (actionType: string) => {
    takeSnapshot();
    const newIndex = nodes.length;
    const newStep = createNewStep(actionType, newIndex);
    const nodeId = `step-${newIndex}`;

    const newNode: WorkflowNode = {
      id: nodeId,
      type: 'actionNode',
      position: { x: 250, y: newIndex * 120 },
      data: {
        step: newStep,
        label: actionType,
        actionType,
        index: newIndex,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    if (newIndex > 0) {
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${newIndex - 1}-${newIndex}`,
          source: `step-${newIndex - 1}`,
          target: nodeId,
          type: 'smoothstep',
        },
      ]);
    }

    setHasChanges(true);
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    takeSnapshot();
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
    setSelectedNode(null);
    setHasChanges(true);
  };

  const handleSave = () => {
    const workflows = nodesToWorkflow(nodes as WorkflowNode[]);
    
    startTransition(async () => {
      const config = { ...scraper.config, workflows };
      const result = await updateScraper(scraper.id, { config });

      if (result.success) {
        toast.success('Workflow saved');
        setHasChanges(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to save');
      }
    });
  };

  const handleNodeClick = useCallback((_: React.MouseEvent, node: WorkflowNode) => {
    setSelectedNode(node.id);
  }, []);

  const handleUpdateNodeData = useCallback((nodeId: string, newStep: WorkflowStep) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              step: newStep,
            },
          };
        }
        return node;
      })
    );
    setHasChanges(true);
  }, [setNodes, takeSnapshot]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/scrapers/${scraper.id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Editor
            </Link>
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-3">
            <FileCode className="h-5 w-5 text-purple-600" />
            <div>
              <h1 className="text-lg font-semibold">
                Workflow Builder: {scraper.display_name || scraper.name}
              </h1>
              <p className="text-xs text-gray-600">{nodes.length} steps</p>
            </div>
          </div>
          <ScraperStatusBadge status={scraper.status} />
          <ScraperHealthBadge health={scraper.health_status} score={scraper.health_score} />
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-sm text-amber-600">Unsaved changes</span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add Step
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {Object.entries(actionCategories).map(([key, category]) => (
                <div key={key}>
                  <DropdownMenuLabel>{category.label}</DropdownMenuLabel>
                  {category.actions.map((actionType) => {
                    const def = actionDefinitions[actionType as keyof typeof actionDefinitions];
                    if (!def) return null;
                    return (
                      <DropdownMenuItem
                        key={actionType}
                        onClick={() => handleAddStep(actionType)}
                      >
                        {def.label}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedNode && (
            <Button variant="outline" size="sm" onClick={handleDeleteNode}>
              <Trash2 className="mr-1 h-4 w-4 text-red-500" />
              Delete
            </Button>
          )}

          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isPending}>
            <Save className="mr-1 h-4 w-4" />
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Flow Canvas + Editor Panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <MiniMap />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            <Panel position="bottom-left" className="bg-white p-2 rounded shadow text-xs text-gray-600">
              Drag to reorder. Click node to select. Use + Add Step to add actions.
            </Panel>
          </ReactFlow>
        </div>

        {selectedNode && (() => {
          const node = nodes.find((n) => n.id === selectedNode) as WorkflowNode | undefined;
          if (!node?.data?.step) return null;
          return (
            <StepEditorPanel
              step={node.data.step}
              nodeId={selectedNode}
              onUpdate={handleUpdateNodeData}
              onClose={() => setSelectedNode(null)}
            />
          );
        })()}
      </div>
    </div>
  );
}
