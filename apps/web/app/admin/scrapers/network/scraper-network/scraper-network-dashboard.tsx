"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRunnerPresence } from "@/lib/realtime/useRunnerPresence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Server,
  Clock,
  AlertCircle,
  Plus,
  Copy,
  Key,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { RunnerCard } from "@/components/admin/scraper-network/runner-card";
import { RunnerDetailDrawer } from "@/components/admin/scraper-network/runner-detail-drawer";
import type { RunnerDetail, RunnerStatus } from "@/components/admin/scraper-network/types";
import { 
  enableRunner, 
  disableRunner, 
  rotateRunnerKey, 
  renameRunner, 
  deleteRunner 
} from "@/app/admin/scrapers/network/actions";

interface NetworkStats {
  totalRunners: number;
  online: number;
  busy: number;
  idle: number;
  offline: number;
  disabled: number;
}

export function ScraperNetworkDashboard() {
  const {
    runners,
    isConnected: isRealtimeConnected,
    connect,
  } = useRunnerPresence({
    autoConnect: true,
  });

  const [stats, setStats] = useState<NetworkStats>({
    totalRunners: 0,
    online: 0,
    busy: 0,
    idle: 0,
    offline: 0,
    disabled: 0,
  });

  // Drawer State
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Add Runner Modal State
  const [showAddRunnerModal, setShowAddRunnerModal] = useState(false);
  const [newRunnerName, setNewRunnerName] = useState("");
  const [newRunnerDescription, setNewRunnerDescription] = useState("");
  const [isCreatingRunner, setIsCreatingRunner] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [createdRunnerName, setCreatedRunnerName] = useState<string | null>(null);
  const installCommand =
    "curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash";

  const handleOpenDrawer = (runnerId: string) => {
    setSelectedRunnerId(runnerId);
    setIsDrawerOpen(true);
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const action = enabled ? enableRunner : disableRunner;
    const result = await action(id);
    if (!result.success) {
      toast.error(result.error || `Failed to ${enabled ? 'enable' : 'disable'} runner`);
      throw new Error(result.error);
    }
    toast.success(`Runner ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleRotateApiKey = async (id: string) => {
    if (!confirm("Are you sure you want to rotate the API key? The old key will stop working immediately.")) {
      return;
    }
    const result = await rotateRunnerKey(id);
    if (result.success && result.key) {
      // Show the new key in a toast or modal
      // For now, we'll use a toast but a modal would be better for security
      navigator.clipboard.writeText(result.key);
      toast.success("API key rotated and copied to clipboard");
    } else {
      toast.error(result.error || "Failed to rotate API key");
    }
  };

  const handleRename = async (id: string) => {
    const newName = prompt("Enter new name for the runner:", id);
    if (!newName || newName === id) return;
    
    const result = await renameRunner(id, newName);
    if (result.success) {
      toast.success("Runner renamed successfully");
    } else {
      toast.error(result.error || "Failed to rename runner");
    }
  };

  const handleUpdate = (id: string) => {
    // Open drawer to show update options/status
    handleOpenDrawer(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete runner "${id}"? This action cannot be undone.`)) {
      return;
    }
    
    const result = await deleteRunner(id);
    if (result.success) {
      toast.success("Runner deleted successfully");
    } else {
      toast.error(result.error || "Failed to delete runner");
    }
  };

  const handleCreateRunner = async () => {
    if (!newRunnerName.trim()) {
      toast.error("Runner name is required");
      return;
    }

    setIsCreatingRunner(true);
    try {
      const response = await fetch("/api/admin/runners/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runner_name: newRunnerName.trim(),
          description: newRunnerDescription.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create runner");
      }

      const data = await response.json();
      setCreatedApiKey(data.api_key);
      setCreatedRunnerName(data.runner_name);
      toast.success(`Runner "${data.runner_name}" created successfully`);
      setNewRunnerName("");
      setNewRunnerDescription("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create runner");
    } finally {
      setIsCreatingRunner(false);
    }
  };

  const handleCloseModal = () => {
    setShowAddRunnerModal(false);
    setCreatedApiKey(null);
    setCreatedRunnerName(null);
    setNewRunnerName("");
    setNewRunnerDescription("");
  };

  const copyApiKey = () => {
    if (createdApiKey) {
      navigator.clipboard.writeText(createdApiKey);
      toast.success("API key copied to clipboard");
    }
  };

  const copyInstallCommand = () => {
    navigator.clipboard.writeText(installCommand);
    toast.success("Installer command copied to clipboard");
  };

  useEffect(() => {
    const runnersArray = Object.values(runners);
    const online = runnersArray.filter((r) => r.status === "online").length;
    const busy = runnersArray.filter((r) => r.status === "busy").length;
    const idle = runnersArray.filter((r) => r.status === "idle").length;
    const offline = runnersArray.filter(
      (r) => r.status === "offline"
    ).length;
    const disabled = runnersArray.filter((r) => r.enabled === false).length;

    setStats({
      totalRunners: runnersArray.length,
      online,
      busy,
      idle,
      offline,
      disabled,
    });
  }, [runners]);

  const runnersArray = Object.values(runners).map((r): RunnerDetail => ({
    id: r.runner_id,
    name: r.runner_name,
    status: r.status as RunnerStatus,
    enabled: r.enabled ?? true,
    last_seen_at: r.last_seen,
    active_jobs: r.active_jobs,
    region: (r.metadata?.region as string) || null,
    version: r.version || null,
    build_check_reason: r.build_check_reason || null,
    metadata: r.metadata || null,
  }));

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-4 border-zinc-900 pb-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2">
            Scraper Network
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-100 border-2 border-zinc-900 px-2 py-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Realtime:</span>
              {isRealtimeConnected ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-brand-forest-green border border-zinc-900" />
                  <span className="text-[10px] font-black uppercase tracking-tight text-brand-forest-green">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-brand-burgundy border border-zinc-900 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-tight text-brand-burgundy">Disconnected</span>
                </div>
              )}
            </div>
            {!isRealtimeConnected && (
              <Button 
                variant="outline" 
                size="icon-sm" 
                onClick={connect}
                className="h-7 w-7 border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:bg-brand-gold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <Button 
          onClick={() => setShowAddRunnerModal(true)} 
          className="bg-brand-burgundy text-white border-4 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all rounded-none font-black uppercase tracking-tighter h-12 px-6"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Runner
        </Button>
      </div>

      {/* Network Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white border-4 border-zinc-900 p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Total Runners</p>
            <Server className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="text-3xl font-black leading-none">{stats.totalRunners}</p>
        </div>
        <div className="bg-white border-4 border-zinc-900 p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Online</p>
            <Activity className="h-4 w-4 text-brand-forest-green" />
          </div>
          <p className="text-3xl font-black leading-none text-brand-forest-green">{stats.online}</p>
        </div>
        <div className="bg-white border-4 border-zinc-900 p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Busy</p>
            <Clock className="h-4 w-4 text-brand-gold" />
          </div>
          <p className="text-3xl font-black leading-none text-brand-gold">{stats.busy}</p>
        </div>
        <div className="bg-white border-4 border-zinc-900 p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Disabled</p>
            <ShieldAlert className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-3xl font-black leading-none text-orange-600">{stats.disabled}</p>
        </div>
        <div className="bg-white border-4 border-zinc-900 p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Offline</p>
            <AlertCircle className="h-4 w-4 text-brand-burgundy" />
          </div>
          <p className="text-3xl font-black leading-none text-brand-burgundy">{stats.offline}</p>
        </div>
      </div>

      {/* Network Health (Distribution) */}
      <div className="bg-white border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <div className="p-4 border-b-4 border-zinc-900 bg-zinc-50">
          <h3 className="text-lg font-black uppercase tracking-tighter">Network Health</h3>
          <p className="text-[10px] font-black uppercase tracking-tight text-zinc-500">
            Distribution of runners by current status
          </p>
        </div>
        <div className="p-6 space-y-6">
          {stats.totalRunners > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tight flex items-center gap-2">
                    <div className="h-2 w-2 bg-brand-forest-green border border-zinc-900" />
                    Online
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    {stats.online} / {stats.totalRunners}
                  </span>
                </div>
                <div className="h-4 border-2 border-zinc-900 bg-zinc-100 p-0.5">
                  <div 
                    className="h-full bg-brand-forest-green transition-all" 
                    style={{ width: `${(stats.online / stats.totalRunners) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tight flex items-center gap-2">
                    <div className="h-2 w-2 bg-brand-gold border border-zinc-900" />
                    Busy
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    {stats.busy} / {stats.totalRunners}
                  </span>
                </div>
                <div className="h-4 border-2 border-zinc-900 bg-zinc-100 p-0.5">
                  <div 
                    className="h-full bg-brand-gold transition-all" 
                    style={{ width: `${(stats.busy / stats.totalRunners) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tight flex items-center gap-2">
                    <div className="h-2 w-2 bg-orange-500 border border-zinc-900" />
                    Disabled
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    {stats.disabled} / {stats.totalRunners}
                  </span>
                </div>
                <div className="h-4 border-2 border-zinc-900 bg-zinc-100 p-0.5">
                  <div 
                    className="h-full bg-orange-500 transition-all" 
                    style={{ width: `${(stats.disabled / stats.totalRunners) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tight flex items-center gap-2">
                    <div className="h-2 w-2 bg-brand-burgundy border border-zinc-900" />
                    Offline
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    {stats.offline} / {stats.totalRunners}
                  </span>
                </div>
                <div className="h-4 border-2 border-zinc-900 bg-zinc-100 p-0.5">
                  <div 
                    className="h-full bg-brand-burgundy transition-all" 
                    style={{ width: `${(stats.offline / stats.totalRunners) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">
              No runners registered. Start scraper runner instances to see network status.
            </p>
          )}
        </div>
      </div>

      {/* Runner Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Active Runners</h2>
          <Badge variant="outline" className="border-2 border-zinc-900 font-black uppercase tracking-tight">
            {runnersArray.length} Total
          </Badge>
        </div>
        
        {runnersArray.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {runnersArray.map((runner) => (
              <div 
                key={runner.id} 
                onClick={() => handleOpenDrawer(runner.id)}
                className="cursor-pointer transition-transform hover:scale-[1.02]"
              >
                <RunnerCard
                  runner={runner}
                  onToggleEnabled={handleToggleEnabled}
                  onUpdate={handleUpdate}
                  onRotateApiKey={handleRotateApiKey}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-zinc-50 border-4 border-dashed border-zinc-200 p-12 text-center">
            <p className="font-black uppercase tracking-tighter text-zinc-400">
              No runners currently connected. Start scraper runner instances to see them here.
            </p>
          </div>
        )}
      </div>

      {/* Add Runner Modal */}
      <Dialog open={showAddRunnerModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-lg border-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="flex items-center gap-2 text-2xl font-black uppercase tracking-tighter">
              <Key className="h-6 w-6" />
              {createdApiKey ? "Runner Created" : "Add New Runner"}
            </DialogTitle>
            <DialogDescription className="font-bold text-zinc-500 uppercase tracking-tight text-xs">
              {createdApiKey
                ? "Save this API key now. Then run the installer and paste this key into the setup wizard."
                : "Create a new scraper runner and generate an API key."}
            </DialogDescription>
          </DialogHeader>

          {createdApiKey ? (
            <div className="space-y-4">
              <div className="border-2 border-zinc-900 bg-zinc-50 p-4 space-y-3 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-tight text-zinc-500">Runner Name</Label>
                  <p className="font-black uppercase tracking-tight">{createdRunnerName}</p>
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-tight text-zinc-500">API Key</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 border-2 border-zinc-900 bg-white px-2 py-1 text-xs font-mono break-all">
                      {createdApiKey}
                    </code>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={copyApiKey}
                      className="border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:bg-brand-gold"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs font-bold text-brand-burgundy uppercase tracking-tight">
                Use this API key to authenticate your runner. Store it securely.
              </p>
              <div className="border-2 border-zinc-900 bg-zinc-50 p-4 space-y-2 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                <Label className="text-[10px] font-black uppercase tracking-tight text-zinc-500">One-line installer</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 border-2 border-zinc-900 bg-white px-2 py-1 text-xs font-mono break-all">
                    {installCommand}
                  </code>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={copyInstallCommand}
                    className="border-2 border-zinc-900 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:bg-brand-gold"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="runner-name" className="font-black uppercase text-xs">Runner Name</Label>
                <Input
                  id="runner-name"
                  placeholder="e.g., macbook-air, server-us-east"
                  value={newRunnerName}
                  onChange={(e) => setNewRunnerName(e.target.value)}
                  disabled={isCreatingRunner}
                  className="border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-brand-gold"
                />
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                  3-50 characters, lowercase letters, numbers, and hyphens only
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="runner-description" className="font-black uppercase text-xs">Description (Optional)</Label>
                <Input
                  id="runner-description"
                  placeholder="e.g., Production runner on MacBook Air"
                  value={newRunnerDescription}
                  onChange={(e) => setNewRunnerDescription(e.target.value)}
                  disabled={isCreatingRunner}
                  className="border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-brand-gold"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {createdApiKey ? (
              <Button 
                onClick={handleCloseModal}
                className="bg-zinc-900 text-white border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none font-black uppercase tracking-tight"
              >
                Done
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleCloseModal} 
                  disabled={isCreatingRunner}
                  className="border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none font-black uppercase tracking-tight"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateRunner} 
                  disabled={isCreatingRunner || !newRunnerName.trim()}
                  className="bg-brand-forest-green text-white border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none font-black uppercase tracking-tight"
                >
                  {isCreatingRunner ? "Creating..." : "Create Runner"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Runner Detail Drawer */}
      <RunnerDetailDrawer
        runner={selectedRunnerId ? runnersArray.find(r => r.id === selectedRunnerId) : null}
        runnerId={selectedRunnerId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
}

