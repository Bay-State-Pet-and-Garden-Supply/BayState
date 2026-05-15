"use client";

import { useState } from "react";
import { RunnerDetail, RunnerStatus } from "./types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  RefreshCw, 
  Key, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  Cpu 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RunnerCardProps {
  runner: RunnerDetail;
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>;
  onUpdate: (id: string) => void;
  onRotateApiKey: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}

const statusConfig: Record<RunnerStatus, { color: string; label: string; badgeVariant: "success" | "warning" | "outline" | "destructive" | "default" | "secondary" }> = {
  online: { color: "bg-brand-forest-green", label: "Online", badgeVariant: "success" },
  busy: { color: "bg-brand-gold", label: "Busy", badgeVariant: "warning" },
  idle: { color: "bg-blue-500", label: "Idle", badgeVariant: "outline" },
  offline: { color: "bg-brand-burgundy", label: "Offline", badgeVariant: "destructive" },
  polling: { color: "bg-blue-400", label: "Polling", badgeVariant: "outline" },
  paused: { color: "bg-zinc-400", label: "Paused", badgeVariant: "secondary" },
};

export function RunnerCard({
  runner,
  onToggleEnabled,
  onUpdate,
  onRotateApiKey,
  onRename,
  onDelete,
}: RunnerCardProps) {
  const [isEnabled, setIsEnabled] = useState(runner.enabled);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    const previousState = isEnabled;
    setIsEnabled(checked);
    setIsToggling(true);
    try {
      await onToggleEnabled(runner.id, checked);
    } catch {
      setIsEnabled(previousState);
    } finally {
      setIsToggling(false);
    }
  };

  const currentStatus = statusConfig[runner.status] || statusConfig.offline;

  return (
    <Card className="border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] p-4 flex flex-col gap-4 bg-white rounded-none">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div 
            className={cn(
              "w-3 h-3 rounded-full shadow-[1px_1px_0px_rgba(0,0,0,1)] border border-zinc-900", 
              currentStatus.color
            )} 
            title={currentStatus.label}
          />
          <div className="min-w-0">
            <h3 className="font-black uppercase tracking-tighter text-lg leading-none truncate" title={runner.name}>
              {runner.name}
            </h3>
            <p className="font-mono text-[10px] text-zinc-500 mt-1 truncate">
              {runner.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={currentStatus.badgeVariant}>
            {currentStatus.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-7 w-7 border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none p-1">
              <DropdownMenuItem 
                onClick={() => onUpdate(runner.id)} 
                className="font-black uppercase tracking-tight text-xs focus:bg-brand-gold focus:text-brand-burgundy cursor-pointer"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Update
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onRotateApiKey(runner.id)} 
                className="font-black uppercase tracking-tight text-xs focus:bg-brand-gold focus:text-brand-burgundy cursor-pointer"
              >
                <Key className="mr-2 h-3.5 w-3.5" /> Rotate API Key
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onRename(runner.id)} 
                className="font-black uppercase tracking-tight text-xs focus:bg-brand-gold focus:text-brand-burgundy cursor-pointer"
              >
                <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(runner.id)} 
                className="font-black uppercase tracking-tight text-xs focus:bg-brand-burgundy focus:text-white text-brand-burgundy cursor-pointer"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-50 border-2 border-zinc-900 p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          <p className="text-[9px] font-black uppercase text-zinc-500 leading-none mb-1">Active Jobs</p>
          <p className="font-black text-xl leading-none">{runner.active_jobs}</p>
        </div>
        <div className="bg-zinc-50 border-2 border-zinc-900 p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] overflow-hidden">
          <p className="text-[9px] font-black uppercase text-zinc-500 leading-none mb-1">Version</p>
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3 shrink-0" />
            <p className="font-black text-xs leading-none truncate">{runner.version || "?.?.?"}</p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center mt-auto pt-3 border-t-2 border-zinc-900/10">
        <div className="flex items-center gap-2">
          <Switch 
            id={`runner-enabled-${runner.id}`} 
            checked={isEnabled} 
            onCheckedChange={handleToggle}
            disabled={isToggling}
            className="data-[state=checked]:bg-brand-forest-green border-2 border-zinc-900"
          />
          <Label 
            htmlFor={`runner-enabled-${runner.id}`} 
            className="font-black uppercase text-[10px] cursor-pointer select-none"
          >
            {isEnabled ? "Enabled" : "Disabled"}
          </Label>
        </div>
        
        {(runner.build_check_reason === "outdated" || runner.build_check_reason === "missing") && (
          <Badge variant="warning" className="animate-pulse border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <AlertCircle className="mr-1 h-3 w-3" /> Update Required
          </Badge>
        )}
      </div>
    </Card>
  );
}
