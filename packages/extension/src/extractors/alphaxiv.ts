import TurndownService from "turndown";
import { countWords, type AgentDocument } from "@context-ferry/shared";
import type { PageExtractor } from "./types";

const OVERVIEW_SECTION_TITLES = new Set([
  "summary",
  "problem",
  "method",
  "results",
  "takeaways",
  "abstract",
  "relevant citations"
]);

type JsonLdAuthor = {
  name?: string;
};

type JsonLdPaper = {
  headline?: string;
  abstract?: string;
  author?: JsonLdAuthor[];
  datePublished?: string;
  url?: string;
};

export const alphaxivExtractor: PageExtractor = {
  id: "alphaxiv",
  matches: (currentLocation) => isAlphaXivOverviewUrl(currentLocation),
  extract: extractAlphaXivDocument
};

async function extractAlphaXivDocument(): Promise<AgentDocument> {
  await waitFor(() => Boolean(findOverviewRoot()) || Boolean(readJsonLdPaper()), 4000, 200);

  const paper = readJsonLdPaper();
  const overviewRoot = findOverviewRoot();
  if (!overviewRoot) {
    throw new Error("AlphaXiv overview content is not available on this page.");
  }

  const markdown = markdownFromOverview(overviewRoot);
  const text = normalizeWhitespace(overviewRoot.innerText || overviewRoot.textContent || markdown);
  const title = paper?.headline || readTitle();
  const byline = authorLine(paper?.author);

  return {
    id: crypto.randomUUID(),
    url: readCanonicalUrl() || location.href,
    title,
    siteName: "alphaXiv",
    byline,
    excerpt: paper?.abstract || meta("description"),
    lang: document.documentElement.lang || undefined,
    publishedTime: normalizeTimestamp(paper?.datePublished),
    capturedAt: new Date().toISOString(),
    wordCount: countWords(text),
    markdown,
    text
  };
}

function isAlphaXivOverviewUrl(currentLocation: Location): boolean {
  return /(^|\.)alphaxiv\.org$/i.test(currentLocation.hostname)
    && /^\/overview\/[^/]+/i.test(currentLocation.pathname);
}

function readJsonLdPaper(): JsonLdPaper | undefined {
  const node = document.querySelector<HTMLScriptElement>('script[data-alphaxiv-id="json-ld-paper-detail-view"]');
  const raw = node?.textContent?.trim();
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as JsonLdPaper;
  } catch {
    return undefined;
  }
}

function readTitle(): string {
  return document.title.replace(/\s*\|\s*alphaXiv\s*$/i, "").trim() || location.href;
}

function authorLine(authors: JsonLdAuthor[] | undefined): string | undefined {
  const names = (authors || []).map((author) => author.name?.trim()).filter(Boolean) as string[];
  return names.length > 0 ? names.join(", ") : undefined;
}

function readCanonicalUrl(): string | undefined {
  return document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || undefined;
}

function findOverviewRoot(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .filter((heading) => OVERVIEW_SECTION_TITLES.has(normalizeWhitespace(heading.textContent || "").toLowerCase()));

  let best: { element: HTMLElement; score: number } | undefined;

  for (const heading of headings) {
    for (const candidate of candidateContainers(heading)) {
      const score = scoreOverviewContainer(candidate);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { element: candidate, score };
      }
    }
  }

  if (best) return best.element;

  const articleLike = document.querySelector<HTMLElement>("main, article, [role='main']");
  if (articleLike && scoreOverviewContainer(articleLike) > 0) {
    return articleLike;
  }

  return null;
}

function candidateContainers(start: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  let current = start.parentElement;
  while (current && current !== document.body) {
    result.push(current);
    current = current.parentElement;
  }
  return result;
}

function scoreOverviewContainer(element: HTMLElement): number {
  const text = normalizeWhitespace(element.innerText || element.textContent || "");
  if (text.length < 400) return -1;

  const headingMatches = new Set(
    Array.from(element.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
      .map((node) => normalizeWhitespace(node.textContent || "").toLowerCase())
      .filter((value) => OVERVIEW_SECTION_TITLES.has(value))
  );

  if (headingMatches.size === 0) return -1;

  const hasNoise = /(we're hiring|feedback|browser extension|upgrade to pro|dark mode)/i.test(text);
  const textScore = Math.min(6, Math.floor(text.length / 1200));

  return headingMatches.size * 4 + textScore - (hasNoise ? 6 : 0);
}

function markdownFromOverview(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const node of Array.from(clone.querySelectorAll("script, style, button, input, textarea, form, nav, footer, aside"))) {
    node.remove();
  }

  for (const node of Array.from(clone.querySelectorAll<HTMLElement>("[aria-hidden='true'], [data-state='closed']"))) {
    node.remove();
  }

  for (const anchor of Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    anchor.href = absoluteUrl(anchor.getAttribute("href") || "");
  }

  const markdown = turndown().turndown(clone.innerHTML || clone.textContent || "");
  return normalizeMarkdown(markdown);
}

function turndown(): TurndownService {
  return new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
}

function meta(name: string): string | undefined {
  const selector = `meta[name="${cssEscape(name)}"], meta[property="${cssEscape(name)}"]`;
  const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim();
  return value || undefined;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.origin).href;
  } catch {
    return value;
  }
}

function normalizeTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function waitFor(predicate: () => boolean, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return predicate();
}
