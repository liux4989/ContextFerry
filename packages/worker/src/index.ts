import { createAgentContext, type AgentContext, type CreateContextRequest, type CreateContextResponse } from "@context-ferry/shared";

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type Env = {
  CONTEXTS: KVNamespaceLike;
  PUBLIC_BASE_URL?: string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return json({ error: message }, 500);
    }
  }
};

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "GET" && pathname === "/health") {
    return json({ ok: true });
  }

  if (request.method === "POST" && pathname === "/api/contexts") {
    return createContext(request, env);
  }

  if (request.method === "GET" && pathname.startsWith("/api/contexts/")) {
    const id = pathname.slice("/api/contexts/".length);
    return getContextMarkdown(id, env);
  }

  if (request.method === "GET" && pathname.startsWith("/c/")) {
    const id = pathname.slice("/c/".length);
    return getContextPage(id, env);
  }

  return new Response("Not found", { status: 404 });
}

async function createContext(request: Request, env: Env): Promise<Response> {
  const body = await parseCreateContextRequest(request);
  if (!body || !Array.isArray(body.sources) || body.sources.length === 0) {
    return json({ error: "sources must contain at least one extracted document" }, 400);
  }

  const id = crypto.randomUUID();
  const context = createAgentContext(body, id);
  await saveContext(context, env);

  const response: CreateContextResponse = {
    url: buildPublicUrl(`/c/${context.id}`, request, env)
  };

  return json(response, 201);
}

async function getContextMarkdown(id: string, env: Env): Promise<Response> {
  const context = await loadContext(id, env);
  if (!context) {
    return new Response("context not found", { status: 404, headers: corsHeaders });
  }

  return new Response(context.markdown, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/markdown; charset=utf-8"
    }
  });
}

async function getContextPage(id: string, env: Env): Promise<Response> {
  const context = await loadContext(id, env);
  if (!context) {
    return new Response(renderPage("Context not found", "<main><h1>Context not found</h1></main>"), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  return new Response(renderContext(context), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function saveContext(context: AgentContext, env: Env): Promise<void> {
  await env.CONTEXTS.put(contextKey(context.id), JSON.stringify(context));
}

async function loadContext(id: string, env: Env): Promise<AgentContext | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;

  const raw = await env.CONTEXTS.get(contextKey(id));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AgentContext;
  } catch {
    return null;
  }
}

async function parseCreateContextRequest(request: Request): Promise<CreateContextRequest | null> {
  try {
    return await request.json() as CreateContextRequest;
  } catch {
    return null;
  }
}

function contextKey(id: string): string {
  return `context:${id}`;
}

function buildPublicUrl(pathname: string, request: Request, env: Env): string {
  const base = (env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}${pathname}`;
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

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
