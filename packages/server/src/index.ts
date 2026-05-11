import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import cors from "cors";
import express from "express";
import { createAgentContext, type AgentContext, type CreateContextRequest, type CreateContextResponse } from "@context-ferry/shared";

const execFileAsync = promisify(execFile);

const port = Number(process.env.PORT || 8787);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data", "contexts");
const publishMode = process.env.PUBLISH_MODE || "local";
const publishRepoDir = process.env.PUBLISH_REPO_DIR || process.cwd();
const publishContextDir = process.env.PUBLISH_CONTEXT_DIR || "contexts";
const publishGitRemote = process.env.PUBLISH_GIT_REMOTE || "origin";
const publishCommitPrefix = process.env.PUBLISH_COMMIT_PREFIX || "Publish context";
const githubPagesBaseUrl = process.env.GITHUB_PAGES_BASE_URL?.replace(/\/+$/, "");

const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/contexts", async (req, res) => {
  const body = req.body as CreateContextRequest;
  if (!body || !Array.isArray(body.sources) || body.sources.length === 0) {
    res.status(400).json({ error: "sources must contain at least one extracted document" });
    return;
  }

  const id = randomUUID();
  const context = createAgentContext(body, id);
  await saveContext(context);
  const url = await publishContext(context);
  const response: CreateContextResponse = { url };

  res.status(201).json(response);
});

app.get("/api/contexts/:id", async (req, res) => {
  const context = await loadContext(req.params.id);
  if (!context) {
    res.status(404).send("context not found");
    return;
  }

  res.type("text/markdown").send(context.markdown);
});

app.get("/c/:id", async (req, res) => {
  const context = await loadContext(req.params.id);
  if (!context) {
    res.status(404).send(renderPage("Context not found", "<main><h1>Context not found</h1></main>"));
    return;
  }

  res.send(renderContext(context));
});

await mkdir(dataDir, { recursive: true });

app.listen(port, () => {
  console.log(`Context Ferry server listening on ${publicBaseUrl} (${publishMode} publish mode)`);
});

async function saveContext(context: AgentContext): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(contextPath(context.id), JSON.stringify(context, null, 2), "utf8");
}

async function loadContext(id: string): Promise<AgentContext | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;

  try {
    const raw = await readFile(contextPath(id), "utf8");
    return JSON.parse(raw) as AgentContext;
  } catch {
    return null;
  }
}

function contextPath(id: string): string {
  return path.join(dataDir, `${id}.json`);
}

async function publishContext(context: AgentContext): Promise<string> {
  if (publishMode === "local") {
    return `${publicBaseUrl}/c/${context.id}`;
  }

  if (publishMode === "github-pages") {
    return publishToGitHubPages(context);
  }

  throw new Error(`Unsupported PUBLISH_MODE: ${publishMode}`);
}

async function publishToGitHubPages(context: AgentContext): Promise<string> {
  if (!githubPagesBaseUrl) {
    throw new Error("GITHUB_PAGES_BASE_URL is required when PUBLISH_MODE=github-pages");
  }

  const relativeDir = path.join(publishContextDir, context.id);
  const outputDir = path.join(publishRepoDir, relativeDir);
  const htmlPath = path.join(outputDir, "index.html");
  const markdownPath = path.join(outputDir, "context.md");

  await mkdir(outputDir, { recursive: true });
  await writeFile(htmlPath, renderStaticContext(context), "utf8");
  await writeFile(markdownPath, context.markdown, "utf8");
  await runGit(["add", path.relative(publishRepoDir, htmlPath), path.relative(publishRepoDir, markdownPath)]);
  await runGit(["commit", "-m", `${publishCommitPrefix}: ${context.title}`]);
  await runGit(["push", publishGitRemote, "HEAD"]);

  return `${githubPagesBaseUrl}/${toUrlPath(relativeDir)}/index.html`;
}

async function runGit(args: string[]): Promise<void> {
  try {
    await execFileAsync("git", args, { cwd: publishRepoDir });
  } catch (error) {
    if (isExecError(error)) {
      const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
      throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
    }
    throw error;
  }
}

function renderContext(context: AgentContext): string {
  const body = `
    <main>
      <header>
        <p class="eyebrow">Agent context</p>
        <h1>${escapeHtml(context.title)}</h1>
        <p>Captured ${escapeHtml(context.createdAt)}</p>
        <nav>
          <a href="/api/contexts/${context.id}">Raw Markdown</a>
        </nav>
      </header>
      <section>
        <h2>Agent-Friendly Context</h2>
        <pre>${escapeHtml(context.markdown)}</pre>
      </section>
    </main>
  `;

  return renderPage(context.title, body);
}

function renderStaticContext(context: AgentContext): string {
  const body = `
    <main>
      <header>
        <p class="eyebrow">Agent context</p>
        <h1>${escapeHtml(context.title)}</h1>
        <p>Captured ${escapeHtml(context.createdAt)}</p>
        <nav>
          <a href="./context.md">Raw Markdown</a>
        </nav>
      </header>
      <section>
        <h2>Agent-Friendly Context</h2>
        <pre>${escapeHtml(context.markdown)}</pre>
      </section>
    </main>
  `;

  return renderPage(context.title, body);
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f7f4; color: #1f2328; }
    main { width: min(960px, calc(100vw - 32px)); margin: 0 auto; padding: 40px 0 64px; }
    header { border-bottom: 1px solid #d7d9d2; padding-bottom: 24px; }
    .eyebrow { margin: 0 0 8px; color: #5f6b5a; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 48px); line-height: 1.05; letter-spacing: 0; }
    h2 { margin-top: 32px; }
    a { color: #245c8c; }
    nav { display: flex; gap: 14px; margin-top: 18px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #ffffff; border: 1px solid #d7d9d2; border-radius: 8px; padding: 18px; line-height: 1.5; }
    @media (prefers-color-scheme: dark) {
      body { background: #161716; color: #eceee8; }
      header, pre { border-color: #3b4039; }
      pre { background: #20231f; }
      a { color: #8ec7ff; }
      .eyebrow { color: #abb5a3; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function toUrlPath(value: string): string {
  return value.split(path.sep).map(encodeURIComponent).join("/");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function isExecError(error: unknown): error is Error & { stdout?: string; stderr?: string } {
  return error instanceof Error;
}
