export type AgentDocument = {
  id: string;
  url: string;
  title: string;
  siteName?: string;
  byline?: string;
  excerpt?: string;
  lang?: string;
  publishedTime?: string;
  capturedAt: string;
  wordCount: number;
  markdown: string;
  text: string;
};

export type AgentContext = {
  id: string;
  title: string;
  createdAt: string;
  markdown: string;
};

export type CreateContextRequest = {
  title?: string;
  sources: AgentDocument[];
  gDrive?: boolean;
};

export type CreateContextResponse = {
  url: string;
};

export function createAgentContext(input: CreateContextRequest, id: string, createdAt = new Date().toISOString()): AgentContext {
  const sources = input.sources.map(normalizeDocument);
  const title = input.title?.trim() || defaultBundleTitle(sources);

  return {
    id,
    title,
    createdAt,
    markdown: serializeBundleMarkdown(title, sources, createdAt)
  };
}

export function normalizeDocument(document: AgentDocument): AgentDocument {
  const markdown = normalizeWhitespace(document.markdown);
  const text = normalizeWhitespace(document.text || markdown);

  return {
    ...document,
    title: document.title.trim() || document.url,
    markdown,
    text,
    wordCount: document.wordCount || countWords(text)
  };
}

export function serializeDocumentMarkdown(document: AgentDocument): string {
  const parts = [
    `# ${document.title}`,
    `Source: ${document.url}`,
    document.siteName ? `Site: ${document.siteName}` : undefined,
    document.byline ? `Byline: ${document.byline}` : undefined,
    document.publishedTime ? `Published: ${document.publishedTime}` : undefined,
    `Captured: ${document.capturedAt}`,
    document.excerpt ? `Summary: ${document.excerpt}` : undefined,
    "## Content",
    document.markdown || document.text
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function serializeBundleMarkdown(title: string, sources: AgentDocument[], createdAt: string): string {
  const header = [
    `# ${title}`,
    `Created: ${createdAt}`,
    `Sources: ${sources.length}`,
    "## Source Index",
    ...sources.map((source, index) => `${index + 1}. ${source.title} (${source.url})`)
  ];

  const body = sources.map((source, index) => [
    `## Source ${index + 1}: ${source.title}`,
    `URL: ${source.url}`,
    source.siteName ? `Site: ${source.siteName}` : undefined,
    source.byline ? `Byline: ${source.byline}` : undefined,
    source.excerpt ? `Excerpt: ${source.excerpt}` : undefined,
    "",
    source.markdown || source.text
  ].filter((part) => part !== undefined).join("\n"));

  return [...header, "", ...body].join("\n");
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function defaultBundleTitle(sources: AgentDocument[]): string {
  if (sources.length === 0) return "Untitled Context";
  if (sources.length === 1) return sources[0].title;
  return `${sources.length} Source Context`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
