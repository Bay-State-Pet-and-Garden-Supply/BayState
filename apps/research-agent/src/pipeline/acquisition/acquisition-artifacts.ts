import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AcquiredPage } from "../types";

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

export async function savePageArtifacts(
  page: AcquiredPage,
  artifactRoot: string
): Promise<{ artifactDir: string }> {
  const slug = slugifyUrl(page.url);
  const pageDir = path.join(artifactRoot, "pages", slug);

  await mkdir(pageDir, { recursive: true });

  if (page.html) {
    await writeFile(path.join(pageDir, "page.html"), page.html, "utf8");
  }
  if (page.text) {
    await writeFile(path.join(pageDir, "page.txt"), page.text, "utf8");
  }
  if (page.accessibilitySnapshot) {
    await writeFile(path.join(pageDir, "snapshot.txt"), page.accessibilitySnapshot, "utf8");
  }
  
  const metadata = {
    url: page.url,
    finalUrl: page.finalUrl,
    statusCode: page.statusCode,
    fetchedAt: page.fetchedAt,
    title: page.title,
    screenshotPath: page.screenshotPath,
    ...page.metadata,
  };
  await writeFile(
    path.join(pageDir, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8"
  );

  return { artifactDir: pageDir };
}
