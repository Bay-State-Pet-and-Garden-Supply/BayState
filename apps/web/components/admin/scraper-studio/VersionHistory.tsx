'use client';

import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { 
  History, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  User, 
  Upload,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileDiff,
  Loader2,
  Save,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type VersionStatus = 'draft' | 'validated' | 'published' | 'archived';

export interface Version {
  id: string;
  config_id: string;
  version_number: number;
  status: VersionStatus;
  schema_version: string;
  config: Record<string, unknown>;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
  published_at: string | null;
  published_by: string | null;
  validation_result?: {
    valid: boolean;
    validated_at?: string;
    errors?: string[];
  } | null;
}

interface VersionHistoryProps {
  configId: string;
  configName: string;
  versions: Version[];
  currentVersionId: string | null;
  onVersionChange: () => void;
  onCreateVersion: (config: Record<string, unknown>, comment: string) => Promise<{ success: boolean; error?: string }>;
  onPublishVersion: (versionId: string) => Promise<{ success: boolean; error?: string }>;
  onRollback: (targetVersionId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  currentConfig?: Record<string, unknown>;
}

function getStatusBadge(status: VersionStatus) {
  switch (status) {
    case 'published':
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="mr-1 h-3 w-3" />
          Published
        </Badge>
      );
    case 'validated':
      return (
        <Badge variant="secondary">
          <CheckCircle className="mr-1 h-3 w-3" />
          Validated
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline">
          <AlertCircle className="mr-1 h-3 w-3" />
          Draft
        </Badge>
      );
    case 'archived':
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          <XCircle className="mr-1 h-3 w-3" />
          Archived
        </Badge>
      );
    default:
      return <Badge variant="destructive">Unknown</Badge>;
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  try {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  } catch {
    return dateString;
  }
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return format(date, 'MMM d, yyyy');
  } catch {
    return dateString;
  }
}

function createConfigDiff(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>
): { added: string[]; removed: string[]; modified: string[] } {
  const oldKeys = Object.keys(oldConfig);
  const newKeys = Object.keys(newConfig);
  
  const added = newKeys.filter(key => !oldKeys.includes(key));
  const removed = oldKeys.filter(key => !newKeys.includes(key));
  const modified = newKeys.filter(key => {
    if (added.includes(key) || removed.includes(key)) return false;
    return JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key]);
  });

  return { added, removed, modified };
}

export function VersionHistory({
  configId,
  configName,
  versions,
  currentVersionId,
  onVersionChange,
  onCreateVersion,
  onPublishVersion,
  onRollback,
  currentConfig,
}: VersionHistoryProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = { configId, configName };
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [selectedVersions, setSelectedVersions] = useState<[string | null, string | null]>([null, null]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isRollbackDialogOpen, setIsRollbackDialogOpen] = useState(false);
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [newVersionComment, setNewVersionComment] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<Version | null>(null);

  const toggleVersionExpanded = useCallback((versionId: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  }, []);

  const handleCreateVersion = async () => {
    if (!currentConfig) {
      toast.error('No current config to save');
      return;
    }

    setIsLoading(true);
    try {
      const result = await onCreateVersion(currentConfig, newVersionComment);
      if (result.success) {
        toast.success('New version created successfully');
        setIsCreateDialogOpen(false);
        setNewVersionComment('');
        onVersionChange();
      } else {
        toast.error(result.error || 'Failed to create version');
      }
    } catch {
      toast.error('An error occurred while creating version');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedVersion) return;

    setIsLoading(true);
    try {
      const result = await onPublishVersion(selectedVersion.id);
      if (result.success) {
        toast.success(`Version ${selectedVersion.version_number} published successfully`);
        setIsPublishDialogOpen(false);
        setSelectedVersion(null);
        onVersionChange();
      } else {
        toast.error(result.error || 'Failed to publish version');
      }
    } catch {
      toast.error('An error occurred while publishing');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion) return;

    setIsLoading(true);
    try {
      const result = await onRollback(selectedVersion.id, rollbackReason);
      if (result.success) {
        toast.success(`Rolled back to version ${selectedVersion.version_number}`);
        setIsRollbackDialogOpen(false);
        setSelectedVersion(null);
        setRollbackReason('');
        onVersionChange();
      } else {
        toast.error(result.error || 'Failed to rollback');
      }
    } catch {
      toast.error('An error occurred while rolling back');
    } finally {
      setIsLoading(false);
    }
  };

  const openPublishDialog = (version: Version) => {
    setSelectedVersion(version);
    setIsPublishDialogOpen(true);
  };

  const openRollbackDialog = (version: Version) => {
    setSelectedVersion(version);
    setIsRollbackDialogOpen(true);
  };

  const openDiffDialog = (v1: Version | null, v2: Version | null) => {
    setSelectedVersions([v1?.id || null, v2?.id || null]);
    setIsDiffDialogOpen(true);
  };

  const getDiffContent = () => {
    const v1 = versions.find(v => v.id === selectedVersions[0]);
    const v2 = versions.find(v => v.id === selectedVersions[1]);
    
    if (!v1 || !v2) return null;
    
    const diff = createConfigDiff(v1.config, v2.config);
    return { v1, v2, diff };
  };

  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Version History</h3>
          <Badge variant="outline" className="ml-2">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {sortedVersions.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDiffDialog(sortedVersions[0], sortedVersions[1])}
            >
              <FileDiff className="mr-2 h-4 w-4" />
              Compare Latest
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={!currentConfig}
          >
            <Save className="mr-2 h-4 w-4" />
            Create Version
          </Button>
        </div>
      </div>

      {/* Version List */}
      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-3">
          {sortedVersions.map((version, index) => {
            const isCurrent = version.id === currentVersionId;
            const isExpanded = expandedVersions.has(version.id);
            const prevVersion = sortedVersions[index + 1];
            
            return (
              <Card 
                key={version.id} 
                className={cn(
                  "transition-colors",
                  isCurrent && "border-primary border-2"
                )}
              >
                <Collapsible open={isExpanded} onOpenChange={() => toggleVersionExpanded(version.id)}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-mono font-bold text-sm">
                          v{version.version_number}
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Version {version.version_number}</span>
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs border-primary text-primary">
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {getStatusBadge(version.status)}
                            <span>•</span>
                            <span>{formatRelativeTime(version.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {version.status === 'validated' && !isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPublishDialog(version)}
                          >
                            <Upload className="mr-1 h-3 w-3" />
                            Publish
                          </Button>
                        )}
                        
                        {version.status === 'published' && !isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openRollbackDialog(version)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Rollback
                          </Button>
                        )}

                        {prevVersion && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDiffDialog(prevVersion, version)}
                          >
                            <FileDiff className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4">
                      <Separator className="mb-4" />
                      
                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-muted-foreground block text-xs">Created</span>
                          <span className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {formatDate(version.created_at)}
                          </span>
                        </div>
                        
                        {version.published_at && (
                          <div>
                            <span className="text-muted-foreground block text-xs">Published</span>
                            <span className="flex items-center gap-1 mt-1">
                              <Upload className="h-3 w-3 text-muted-foreground" />
                              {formatDate(version.published_at)}
                            </span>
                          </div>
                        )}
                        
                        {version.created_by && (
                          <div>
                            <span className="text-muted-foreground block text-xs">Created By</span>
                            <span className="flex items-center gap-1 mt-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <code className="text-xs">{version.created_by.slice(0, 8)}...</code>
                            </span>
                          </div>
                        )}
                        
                        <div>
                          <span className="text-muted-foreground block text-xs">Schema Version</span>
                          <span className="font-mono text-xs">{version.schema_version}</span>
                        </div>
                      </div>

                      {/* Validation Result */}
                      {version.validation_result && (
                        <div className={cn(
                          "p-3 rounded-lg mb-4 text-sm",
                          version.validation_result.valid 
                            ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900" 
                            : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            {version.validation_result.valid ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className={cn(
                              "font-medium",
                              version.validation_result.valid ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
                            )}>
                              Validation {version.validation_result.valid ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          {version.validation_result.errors && version.validation_result.errors.length > 0 && (
                            <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 ml-6">
                              {version.validation_result.errors.map((error, i) => (
                                <li key={i}>• {error}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Change Summary */}
                      {version.change_summary && (
                        <div className="mb-4">
                          <span className="text-muted-foreground text-xs block mb-1">Change Summary</span>
                          <p className="text-sm bg-muted/50 p-2 rounded">{version.change_summary}</p>
                        </div>
                      )}

                      {/* View Config Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setViewingVersion(version)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Configuration
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>

        {versions.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <History className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No versions yet</h3>
              <p className="text-muted-foreground text-sm">
                Create your first version to start tracking changes.
              </p>
            </CardContent>
          </Card>
        )}
      </ScrollArea>

      {/* Create Version Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>
              Save a snapshot of the current configuration as a new version.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comment">Change Summary (optional)</Label>
              <Textarea
                id="comment"
                placeholder="Describe what changed in this version..."
                value={newVersionComment}
                onChange={(e) => setNewVersionComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVersion} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Create Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Dialog */}
      <AlertDialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Version {selectedVersion?.version_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make version {selectedVersion?.version_number} the current published version.
              The previously published version will be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedVersion(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={isRollbackDialogOpen} onOpenChange={setIsRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback to Version {selectedVersion?.version_number}?</DialogTitle>
            <DialogDescription>
              This will create a new version with the same configuration as version {selectedVersion?.version_number}.
              Please provide a reason for the rollback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Rollback Reason (required)</Label>
              <Textarea
                id="reason"
                placeholder="Why are you rolling back to this version?"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsRollbackDialogOpen(false);
              setRollbackReason('');
              setSelectedVersion(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleRollback} 
              disabled={isLoading || !rollbackReason.trim()}
              variant="destructive"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff Dialog */}
      <Dialog open={isDiffDialogOpen} onOpenChange={setIsDiffDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Version Comparison</DialogTitle>
            <DialogDescription>
              Compare changes between versions
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 my-4">
            {(() => {
              const diffContent = getDiffContent();
              if (!diffContent) return <div className="text-center py-8">Select two versions to compare</div>;
              
              const { v1, v2, diff } = diffContent;
              
              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <Badge variant="outline">v{v1.version_number}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(v1.created_at)}</p>
                    </div>
                    <FileDiff className="h-5 w-5 text-muted-foreground" />
                    <div className="text-center">
                      <Badge variant="outline">v{v2.version_number}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(v2.created_at)}</p>
                    </div>
                  </div>

                  {diff.added.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-green-600 mb-2">Added ({diff.added.length})</h4>
                      <ul className="space-y-1">
                        {diff.added.map(key => (
                          <li key={key} className="text-sm bg-green-50 dark:bg-green-950/20 p-2 rounded border border-green-200 dark:border-green-900">
                            <code className="text-green-800 dark:text-green-200">+ {key}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {diff.removed.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-red-600 mb-2">Removed ({diff.removed.length})</h4>
                      <ul className="space-y-1">
                        {diff.removed.map(key => (
                          <li key={key} className="text-sm bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-200 dark:border-red-900">
                            <code className="text-red-800 dark:text-red-200">- {key}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {diff.modified.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-amber-600 mb-2">Modified ({diff.modified.length})</h4>
                      <ul className="space-y-1">
                        {diff.modified.map(key => (
                          <li key={key} className="text-sm bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-900">
                            <code className="text-amber-800 dark:text-amber-200">~ {key}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No differences found between these versions
                    </div>
                  )}
                </div>
              );
            })()}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setIsDiffDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Config Dialog */}
      <Dialog open={!!viewingVersion} onOpenChange={() => setViewingVersion(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Configuration - Version {viewingVersion?.version_number}</DialogTitle>
            <DialogDescription>
              View the full configuration for this version
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 my-4">
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
              {viewingVersion ? JSON.stringify(viewingVersion.config, null, 2) : ''}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setViewingVersion(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default VersionHistory;
