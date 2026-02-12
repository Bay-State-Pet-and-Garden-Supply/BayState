"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { RunnerPresence } from "@/lib/realtime/types";
import { useRunnerPresence } from "@/lib/realtime/useRunnerPresence";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  CheckCircle2,
  AlertCircle,
  XCircle,
  Settings,
  Plus,
  Copy,
  Key,
} from "lucide-react";

interface NetworkStats {
  totalRunners: number;
  online: number;
  busy: number;
  idle: number;
  offline: number;
}

export function ScraperNetworkDashboard() {
  const {
    runners,
    isConnected: isRealtimeConnected,
    error,
    connect,
    disconnect,
  } = useRunnerPresence({
    autoConnect: true,
  });

  const [stats, setStats] = useState<NetworkStats>({
    totalRunners: 0,
    online: 0,
    busy: 0,
    idle: 0,
    offline: 0,
  });

  // Add Runner Modal State
  const [showAddRunnerModal, setShowAddRunnerModal] = useState(false);
  const [newRunnerName, setNewRunnerName] = useState("");
  const [newRunnerDescription, setNewRunnerDescription] = useState("");
  const [isCreatingRunner, setIsCreatingRunner] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [createdRunnerName, setCreatedRunnerName] = useState<string | null>(null);

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

  useEffect(() => {
    const runnersArray = Object.values(runners);
    const online = runnersArray.filter((r) => r.status === "online").length;
    const busy = runnersArray.filter((r) => r.status === "busy").length;
    const idle = runnersArray.filter((r) => r.status === "idle").length;
    const offline = runnersArray.filter(
      (r) => r.status === "offline"
    ).length;

    setStats({
      totalRunners: runnersArray.length,
      online,
      busy,
      idle,
      offline,
    });
  }, [runners]);

  const runnersArray = Object.values(runners);

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Realtime Connection:</span>
          {isRealtimeConnected ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Disconnected
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddRunnerModal(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Runner
          </Button>
          {!isRealtimeConnected && (
            <Button variant="outline" size="sm" onClick={connect}>
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Network Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runners</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRunners}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.online}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Busy</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.busy}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">{stats.offline}</div>
          </CardContent>
        </Card>
      </div>

      {/* Runner Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Network Status</CardTitle>
          <CardDescription>
            Distribution of runners by current status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.totalRunners > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Online
                  </span>
                  <span>
                    {stats.online} / {stats.totalRunners}
                  </span>
                </div>
                <Progress
                  value={(stats.online / stats.totalRunners) * 100}
                  className="h-2"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-yellow-500" />
                    Busy
                  </span>
                  <span>
                    {stats.busy} / {stats.totalRunners}
                  </span>
                </div>
                <Progress
                  value={(stats.busy / stats.totalRunners) * 100}
                  className="h-2"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    Idle
                  </span>
                  <span>
                    {stats.idle} / {stats.totalRunners}
                  </span>
                </div>
                <Progress
                  value={(stats.idle / stats.totalRunners) * 100}
                  className="h-2"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    Offline
                  </span>
                  <span>
                    {stats.offline} / {stats.totalRunners}
                  </span>
                </div>
                <Progress
                  value={(stats.offline / stats.totalRunners) * 100}
                  className="h-2"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No runners registered. Start scraper runner instances to see network
              status.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Runner List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Runners</CardTitle>
          <CardDescription>
            Real-time status of all connected scraper runners
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runnersArray.length > 0 ? (
            <div className="space-y-4">
              {runnersArray.map((runner) => (
                <Link
                  key={runner.runner_id}
                  href={`/admin/scrapers/network/${runner.runner_id}`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        runner.status === "online"
                          ? "bg-green-500"
                          : runner.status === "busy"
                            ? "bg-yellow-500"
                            : runner.status === "idle"
                              ? "bg-gray-400"
                              : "bg-red-400"
                      }`}
                    />
                    <div>
                      <p className="font-medium">{runner.runner_name}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {runner.runner_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge
                      variant={
                        runner.status === "online"
                          ? "default"
                          : runner.status === "busy"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {runner.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {runner.active_jobs} active jobs
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Last seen:{" "}
                      {new Date(runner.last_seen).toLocaleTimeString()}
                    </span>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No runners currently connected. Start scraper runner instances to
              see them here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Runner Modal */}
      <Dialog open={showAddRunnerModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {createdApiKey ? "Runner Created" : "Add New Runner"}
            </DialogTitle>
            <DialogDescription>
              {createdApiKey
                ? "Save this API key now. It cannot be retrieved again."
                : "Create a new scraper runner and generate an API key."}
            </DialogDescription>
          </DialogHeader>

          {createdApiKey ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Runner Name</Label>
                  <p className="font-medium">{createdRunnerName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">API Key</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 rounded bg-background px-2 py-1 text-xs font-mono break-all">
                      {createdApiKey}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyApiKey}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Use this API key to authenticate your runner. Store it securely.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="runner-name">Runner Name</Label>
                <Input
                  id="runner-name"
                  placeholder="e.g., macbook-air, server-us-east"
                  value={newRunnerName}
                  onChange={(e) => setNewRunnerName(e.target.value)}
                  disabled={isCreatingRunner}
                />
                <p className="text-xs text-muted-foreground">
                  3-50 characters, lowercase letters, numbers, and hyphens only
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="runner-description">Description (Optional)</Label>
                <Input
                  id="runner-description"
                  placeholder="e.g., Production runner on MacBook Air"
                  value={newRunnerDescription}
                  onChange={(e) => setNewRunnerDescription(e.target.value)}
                  disabled={isCreatingRunner}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {createdApiKey ? (
              <Button onClick={handleCloseModal}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseModal} disabled={isCreatingRunner}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRunner} disabled={isCreatingRunner || !newRunnerName.trim()}>
                  {isCreatingRunner ? "Creating..." : "Create Runner"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
