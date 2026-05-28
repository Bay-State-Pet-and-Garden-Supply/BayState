import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { getResearchAgentPaths } from "../pi/paths";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

function extractJsonPayload(output: string) {
  const firstArray = output.indexOf("[");
  const firstObject = output.indexOf("{");
  const starts = [firstArray, firstObject].filter((value) => value >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(output.lastIndexOf("]"), output.lastIndexOf("}"));

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Unable to find JSON payload in Supabase CLI output:\n${output}`);
  }

  return output.slice(start, end + 1);
}

async function ensureProjectRef(workdir: string, projectRef: string | undefined) {
  const projectRefPath = path.join(workdir, "supabase", ".temp", "project-ref");

  try {
    const existing = (await readFile(projectRefPath, "utf8")).trim();
    if (existing) {
      return projectRefPath;
    }
  } catch {
    // File missing is fine; create it below when projectRef is available.
  }

  if (!projectRef) {
    return projectRefPath;
  }

  await mkdir(path.dirname(projectRefPath), { recursive: true });
  await writeFile(projectRefPath, `${projectRef.trim()}\n`, "utf8");
  return projectRefPath;
}

export interface QueryLinkedSupabaseOptions {
  workdir?: string;
  projectRef?: string;
  timeoutMs?: number;
}

export function resolveSupabaseWorkdir(workdir?: string) {
  return path.resolve(
    workdir
      ?? process.env.RESEARCH_AGENT_SUPABASE_WORKDIR
      ?? path.join(getResearchAgentPaths().appRoot, "..", "web"),
  );
}

export async function queryLinkedSupabase(
  sql: string,
  options: QueryLinkedSupabaseOptions = {},
): Promise<unknown[]> {
  const workdir = resolveSupabaseWorkdir(options.workdir);
  await ensureProjectRef(
    workdir,
    options.projectRef ?? process.env.RESEARCH_AGENT_SUPABASE_PROJECT_REF,
  );

  const timeoutMs = options.timeoutMs ?? 120_000;

  const normalizedSql = sql.replace(/\s+/g, " ").trim();

  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn(
      "bunx",
      ["supabase", "db", "query", "--linked", "-o", "json", normalizedSql],
      {
        cwd: workdir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Supabase query timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });

  const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();

  if (result.exitCode !== 0) {
    throw new Error(`Supabase query failed:\n${combinedOutput}`);
  }

  const payload = JSON.parse(extractJsonPayload(combinedOutput));
  const rows = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && "rows" in payload && Array.isArray(payload.rows)
      ? payload.rows
      : payload);
  return z.array(jsonValueSchema).parse(rows);
}
