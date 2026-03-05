import { useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';

interface HistoryState<T> {
  nodes: T[];
  edges: Edge[];
}

interface UseUndoRedoReturn<T> {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  takeSnapshot: () => void;
}

const MAX_HISTORY = 50;

export function useUndoRedo<T extends Node>(
  nodes: T[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<T[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
): UseUndoRedoReturn<T> {
  const [past, setPast] = useState<HistoryState<T>[]>([]);
  const [future, setFuture] = useState<HistoryState<T>[]>([]);

  const takeSnapshot = useCallback(() => {
    setPast((prev) => {
      const newPast = [...prev, { nodes: [...nodes], edges: [...edges] }];
      if (newPast.length > MAX_HISTORY) {
        return newPast.slice(-MAX_HISTORY);
      }
      return newPast;
    });
    setFuture([]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);

    setFuture((prev) => [{ nodes: [...nodes], edges: [...edges] }, ...prev]);
    setPast(newPast);
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past, nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast((prev) => [...prev, { nodes: [...nodes], edges: [...edges] }]);
    setFuture(newFuture);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, nodes, edges, setNodes, setEdges]);

  return {
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    takeSnapshot,
  };
}
