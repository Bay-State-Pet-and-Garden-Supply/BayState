import { WorkflowStep, ActionNodeData } from './types';
import { Node, Edge } from '@xyflow/react';

export interface WorkflowNode extends Node {
  data: ActionNodeData;
}

export function workflowToNodes(workflows: WorkflowStep[]): { nodes: WorkflowNode[]; edges: Edge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: Edge[] = [];

  workflows.forEach((step, index) => {
    const nodeId = `step-${index}`;
    
    nodes.push({
      id: nodeId,
      type: 'actionNode',
      position: { x: 250, y: index * 120 },
      data: {
        step,
        label: step.action,
        actionType: step.action,
        index,
      },
    });

    if (index > 0) {
      edges.push({
        id: `edge-${index - 1}-${index}`,
        source: `step-${index - 1}`,
        target: nodeId,
        type: 'smoothstep',
        animated: false,
      });
    }
  });

  return { nodes, edges };
}

export function nodesToWorkflow(nodes: WorkflowNode[]): WorkflowStep[] {
  const sortedNodes = [...nodes].sort((a, b) => a.data.index - b.data.index);
  return sortedNodes.map((node) => node.data.step);
}

export function createNewStep(actionType: string, index: number): WorkflowStep {
  const baseStep: WorkflowStep = {
    action: actionType,
    params: {},
  };

  switch (actionType) {
    case 'navigate':
      baseStep.params = { url: '', wait_after: 2 };
      break;
    case 'wait':
      baseStep.params = { seconds: 2 };
      break;
    case 'wait_for':
      baseStep.params = { selector: '', timeout: 10 };
      break;
    case 'click':
      baseStep.params = { selector: '', index: 0 };
      break;
    case 'extract':
      baseStep.params = { fields: [] };
      break;
    case 'extract_and_transform':
      baseStep.params = { fields: [] };
      break;
    case 'check_no_results':
      baseStep.params = {};
      break;
    case 'conditional_skip':
      baseStep.params = { if_flag: 'no_results_found' };
      break;
    default:
      break;
  }

  return baseStep;
}
