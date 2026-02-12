"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { Plus, Pencil, Loader2, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ScraperConfigRow {
  id: string;
  name: string;
  base_url: string;
  updated_at: string | null;
  created_at: string;
}

export default function ConfigList() {
  const [configs, setConfigs] = useState<ScraperConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchConfigs() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("scraper_configs")
          .select("id, name, base_url, updated_at, created_at")
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        setConfigs(data || []);
      } catch (err: any) {
        console.error("Error fetching scraper configs:", err);
        setError(err.message || "Failed to load scraper configurations.");
      } finally {
        setLoading(false);
      }
    }

    fetchConfigs();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-bold">Scraper Configurations</CardTitle>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Create New
        </Button>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
            <p>No scraper configurations found.</p>
            <Button variant="link" className="mt-2">
              Create your first scraper
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">{config.name}</TableCell>
                  <TableCell>{config.base_url}</TableCell>
                  <TableCell>
                    {config.updated_at
                      ? format(new Date(config.updated_at), "MMM d, yyyy HH:mm")
                      : config.created_at
                      ? format(new Date(config.created_at), "MMM d, yyyy HH:mm")
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
