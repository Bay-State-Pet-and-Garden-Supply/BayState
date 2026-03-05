"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Loader2, History, RotateCcw } from "lucide-react"

interface ConfigVersion {
  id: string
  config_id: string
  version: number
  created_at: string
  created_by?: string
  change_summary?: string
}

interface ConfigHistoryProps {
  configId: string
}

export function ConfigHistory({ configId }: ConfigHistoryProps) {
  const [versions, setVersions] = useState<ConfigVersion[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchVersions() {
      if (!configId) return

      try {
        const { data, error } = await supabase
          .from("scraper_config_versions")
          .select("*")
          .eq("config_id", configId)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching config versions:", error)
        } else {
          setVersions(data || [])
        }
      } catch (err) {
        console.error("Unexpected error fetching versions:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [configId, supabase])

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <History className="h-8 w-8 opacity-50" />
        <p className="text-sm">No version history available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Version History</h3>
        <Badge variant="outline" className="text-xs">
          {versions.length} versions
        </Badge>
      </div>
      
      <ScrollArea className="h-[400px] rounded-md border p-4">
        <div className="space-y-4">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    v{version.version || version.id.slice(0, 8)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(version.created_at), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Restore this version"
                  disabled
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="sr-only">Restore</span>
                </Button>
              </div>
              
              {version.created_by && (
                <div className="text-xs text-muted-foreground">
                  By: {version.created_by}
                </div>
              )}
              
              {version.change_summary && (
                <div className="text-xs text-muted-foreground">
                  {version.change_summary}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
