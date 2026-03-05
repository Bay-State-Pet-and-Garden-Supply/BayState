'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface YamlDiffViewerProps {
  original: string;
  modified: string;
  className?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  const result: DiffLine[] = [];
  const originalSet = new Set(originalLines);
  const modifiedSet = new Set(modifiedLines);
  
  let oi = 0;
  let mi = 0;
  
  while (oi < originalLines.length || mi < modifiedLines.length) {
    const origLine = originalLines[oi];
    const modLine = modifiedLines[mi];
    
    if (oi >= originalLines.length) {
      result.push({ type: 'added', content: modLine });
      mi++;
    } else if (mi >= modifiedLines.length) {
      result.push({ type: 'removed', content: origLine });
      oi++;
    } else if (origLine === modLine) {
      result.push({ type: 'unchanged', content: origLine });
      oi++;
      mi++;
    } else if (!modifiedSet.has(origLine)) {
      result.push({ type: 'removed', content: origLine });
      oi++;
    } else if (!originalSet.has(modLine)) {
      result.push({ type: 'added', content: modLine });
      mi++;
    } else {
      result.push({ type: 'removed', content: origLine });
      result.push({ type: 'added', content: modLine });
      oi++;
      mi++;
    }
  }
  
  return result;
}

export function YamlDiffViewer({ original, modified, className }: YamlDiffViewerProps) {
  const diffLines = useMemo(() => {
    return computeSimpleDiff(original, modified);
  }, [original, modified]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    diffLines.forEach((line) => {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    });
    return { added, removed, hasChanges: added > 0 || removed > 0 };
  }, [diffLines]);

  if (!stats.hasChanges) {
    return (
      <div className={cn('text-sm text-gray-600 text-center py-8', className)}>
        No changes detected
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-4 text-xs">
        <span className="text-green-600">+{stats.added} added</span>
        <span className="text-red-600">-{stats.removed} removed</span>
      </div>
      
      <div className="font-mono text-xs overflow-auto max-h-96 border rounded bg-gray-50">
        {diffLines.map((line, index) => {
          const bgColor = line.type === 'added' 
            ? 'bg-green-50' 
            : line.type === 'removed' 
              ? 'bg-red-50' 
              : 'bg-white';
          
          const textColor = line.type === 'added' 
            ? 'text-green-800' 
            : line.type === 'removed' 
              ? 'text-red-800' 
              : 'text-gray-700';

          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          const prefixColor = line.type === 'added' 
            ? 'text-green-600' 
            : line.type === 'removed' 
              ? 'text-red-600' 
              : 'text-gray-600';

          return (
            <div key={index} className={cn('flex', bgColor)}>
              <span className={cn('w-6 flex-shrink-0 text-center select-none', prefixColor)}>
                {prefix}
              </span>
              <span className={cn('flex-1 pr-4 whitespace-pre', textColor)}>
                {line.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function YamlDiffStats({ original, modified }: { original: string; modified: string }) {
  const diffLines = useMemo(() => computeSimpleDiff(original, modified), [original, modified]);
  
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    diffLines.forEach((line) => {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    });
    return { added, removed, hasChanges: added > 0 || removed > 0 };
  }, [diffLines]);

  if (!stats.hasChanges) return null;

  return (
    <div className="flex gap-2 text-xs">
      {stats.added > 0 && (
        <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
          +{stats.added}
        </span>
      )}
      {stats.removed > 0 && (
        <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
          -{stats.removed}
        </span>
      )}
    </div>
  );
}
