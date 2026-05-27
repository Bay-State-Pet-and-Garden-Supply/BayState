import { spawn } from "node:child_process";
import path from "node:path";
import type { PageAcquisitionProvider } from "../ports";
import type { AcquiredPage, ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { savePageArtifacts } from "./acquisition-artifacts";

function slugifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    const pathname = parsed.pathname.replace(/[^a-z0-9]+/gi, "-");
    return `${host}${pathname}`.toLowerCase().replace(/^-+|-+$/g, "").slice(0, 80);
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80);
  }
}

export interface AgentBrowserPageAcquisitionOptions {
  commandTimeoutMs?: number;
  renderWaitMs?: number;
}

export class AgentBrowserPageAcquisition implements PageAcquisitionProvider {
  constructor(private readonly options: AgentBrowserPageAcquisitionOptions = {}) {}

  private runCommand(args: string[]): Promise<any> {
    const timeoutMs = this.options.commandTimeoutMs ?? 12_000;

    return new Promise((resolve) => {
      const proc = spawn("agent-browser", args);
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (result: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore kill errors
        }
        finish({ success: false, error: `agent-browser command timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      proc.on("error", (error) => finish({ success: false, error: error.message }));
      proc.on("close", (code) => {
        if (code !== 0) {
          finish({ success: false, error: stderr.trim() || `Exit code ${code}` });
          return;
        }
        try {
          const start = stdout.indexOf("{");
          const end = stdout.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            const parsed = JSON.parse(stdout.substring(start, end + 1));
            finish(parsed);
          } else {
            finish({ success: false, error: "No JSON found in stdout" });
          }
        } catch (e: any) {
          finish({ success: false, error: `JSON Parse error: ${e.message}` });
        }
      });
    });
  }

  async acquirePage(
    url: string,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<AcquiredPage> {
    const fetchedAt = new Date().toISOString();
    const renderWaitMs = this.options.renderWaitMs ?? 1500;

    const openRes = await this.runCommand(["open", url, "--json"]);
    if (openRes.success === false) {
      return {
        url,
        finalUrl: url,
        statusCode: 599,
        fetchedAt,
        metadata: { error: `Failed to open URL: ${openRes.error}`, engine: "agent-browser" },
      };
    }

    await this.runCommand(["wait", String(renderWaitMs), "--json"]);

    const urlRes = await this.runCommand(["get", "url", "--json"]);
    const finalUrl = urlRes.success && urlRes.data?.url ? urlRes.data.url : url;

    const titleRes = await this.runCommand(["get", "title", "--json"]);
    const title = titleRes.success && urlRes.data !== false && titleRes.data?.title ? titleRes.data.title : undefined;

    const htmlRes = await this.runCommand(["get", "html", "html", "--json"]);
    const html = htmlRes.success && htmlRes.data?.html ? htmlRes.data.html : undefined;

    const textRes = await this.runCommand(["get", "text", "body", "--json"]);
    const text = textRes.success && textRes.data?.text ? textRes.data.text : undefined;

    const snapRes = await this.runCommand(["snapshot", "--json"]);
    const accessibilitySnapshot = snapRes.success && snapRes.data?.snapshot ? snapRes.data.snapshot : undefined;

    let screenshotPath: string | undefined;
    if (context.artifactRoot) {
      const slug = slugifyUrl(url);
      const targetPath = path.join(context.artifactRoot, "pages", slug, "screenshot.png");

      const fs = await import("node:fs/promises");
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      const shotRes = await this.runCommand(["screenshot", "--full", targetPath, "--json"]);
      if (shotRes.success) {
        screenshotPath = targetPath;
      }
    }

    const acquired: AcquiredPage = {
      url,
      finalUrl,
      statusCode: html || text ? 200 : 599,
      fetchedAt,
      title,
      html,
      text,
      screenshotPath,
      accessibilitySnapshot,
      metadata: {
        engine: "agent-browser",
        ...(html || text ? {} : { error: "agent-browser returned no HTML or text" }),
      },
    };

    if (context.artifactRoot) {
      try {
        await savePageArtifacts(acquired, context.artifactRoot);
      } catch {
        // Ignore/suppress artifact write failures
      }
    }

    return acquired;
  }
}
