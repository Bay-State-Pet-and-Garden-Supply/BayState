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
  } catch (e) {
    return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80);
  }
}

export class AgentBrowserPageAcquisition implements PageAcquisitionProvider {
  private runCommand(args: string[]): Promise<any> {
    return new Promise((resolve) => {
      const proc = spawn("agent-browser", args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      proc.on("close", (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
          return;
        }
        try {
          const start = stdout.indexOf("{");
          const end = stdout.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            const parsed = JSON.parse(stdout.substring(start, end + 1));
            resolve(parsed);
          } else {
            resolve({ success: false, error: "No JSON found in stdout" });
          }
        } catch (e: any) {
          resolve({ success: false, error: `JSON Parse error: ${e.message}` });
        }
      });
    });
  }

  async acquirePage(
    url: string,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<AcquiredPage> {
    const fetchedAt = new Date().toISOString();

    // Open URL
    const openRes = await this.runCommand(["open", url, "--json"]);
    if (openRes.success === false) {
      return {
        url,
        finalUrl: url,
        fetchedAt,
        metadata: { error: `Failed to open URL: ${openRes.error}` },
      };
    }

    // Wait a brief moment for dynamic content
    await this.runCommand(["wait", "1500", "--json"]);

    // Get final URL
    const urlRes = await this.runCommand(["get", "url", "--json"]);
    const finalUrl = urlRes.success && urlRes.data?.url ? urlRes.data.url : url;

    // Get Title
    const titleRes = await this.runCommand(["get", "title", "--json"]);
    const title = titleRes.success && titleRes.data?.title ? titleRes.data.title : undefined;

    // Get HTML
    const htmlRes = await this.runCommand(["get", "html", "html", "--json"]);
    const html = htmlRes.success && htmlRes.data?.html ? htmlRes.data.html : undefined;

    // Get Text
    const textRes = await this.runCommand(["get", "text", "body", "--json"]);
    const text = textRes.success && textRes.data?.text ? textRes.data.text : undefined;

    // Get accessibility tree snapshot
    const snapRes = await this.runCommand(["snapshot", "--json"]);
    const accessibilitySnapshot = snapRes.success && snapRes.data?.snapshot ? snapRes.data.snapshot : undefined;

    // Capture screenshot if we have an artifact root
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
      statusCode: 200,
      fetchedAt,
      title,
      html,
      text,
      screenshotPath,
      accessibilitySnapshot,
      metadata: {
        engine: "agent-browser",
      },
    };

    // Save page artifacts under the artifact directory
    if (context.artifactRoot) {
      try {
        await savePageArtifacts(acquired, context.artifactRoot);
      } catch (err) {
        // Ignore/suppress artifact write failures
      }
    }

    return acquired;
  }
}
