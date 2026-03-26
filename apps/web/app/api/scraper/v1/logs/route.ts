import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { validateRunnerAuth } from "@/lib/scraper-auth";
import { toScrapeJobLogRow } from "@/lib/scraper-logs";

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(url, key);
}

interface LogEntry {
  event_id?: string;
  level: string;
  message: string;
  timestamp?: string;
  details?: Record<string, unknown>;
  runner_id?: string;
  runner_name?: string;
  source?: string;
  scraper_name?: string;
  sku?: string;
  phase?: string;
  sequence?: number;
}

interface LogIngestRequest {
  job_id: string;
  logs: LogEntry[];
}

const ALLOWED_LEVELS = new Set([
  "debug",
  "info",
  "warning",
  "error",
  "critical",
]);

function normalizeLevel(level: string | undefined): string {
  const normalized = (level || "info").toLowerCase();
  if (normalized === "warn") {
    return "warning";
  }
  if (!ALLOWED_LEVELS.has(normalized)) {
    return "info";
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const runner = await validateRunnerAuth({
      apiKey: request.headers.get("X-API-Key"),
      authorization: request.headers.get("Authorization"),
    });

    if (!runner) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: LogIngestRequest = await request.json();
    const { job_id, logs } = body;

    if (!job_id || !Array.isArray(logs)) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, logs" },
        { status: 400 },
      );
    }

    if (logs.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const supabase = getSupabaseAdmin();

    const logsToInsert = logs.map((log) =>
      toScrapeJobLogRow({
        ...log,
        job_id,
        level: normalizeLevel(log.level),
        runner_name: log.runner_name ?? runner.runnerName,
      }),
    );

    const { error } = await supabase
      .from("scrape_job_logs")
      .upsert(logsToInsert, { onConflict: "job_id,event_id", ignoreDuplicates: true });

    if (error) {
      console.error("[Logs API] Insert failed:", error);
      return NextResponse.json(
        { error: "Failed to insert logs" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      count: logs.length,
    });
  } catch (error) {
    console.error("[Logs API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
