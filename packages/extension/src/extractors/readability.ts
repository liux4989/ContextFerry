import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { countWords, type AgentDocument } from "@context-ferry/shared";
import type { PageExtractor } from "./types";

export const readabilityExtractor: PageExtractor = {
  id: "readability",
  matches: () => true,
  extract: extractReadableDocument
};

function extractReadableDocument(): AgentDocument {
  const documentClone = document.cloneNode(true) as Document;
  const article = new Readability(documentClone, {
    keepClasses: false
  }).parse();

  if (!article) {
    throw new Error("Readability could not extract this page.");
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });

  const markdown = turndown.turndown(article.content || article.textContent || "");
  const text = article.textContent || document.body?.innerText || markdown;
  const metadata = readMetadata();

  return {
    id: crypto.randomUUID(),
    url: location.href,
    title: article.title || document.title || location.href,
    siteName: article.siteName || metadata.siteName,
    byline: article.byline || metadata.author,
    excerpt: article.excerpt || metadata.description,
    lang: document.documentElement.lang || undefined,
    publishedTime: metadata.publishedTime,
    capturedAt: new Date().toISOString(),
    wordCount: countWords(text),
    markdown,
    text
  };
}

function readMetadata(): { siteName?: string; author?: string; description?: string; publishedTime?: string } {
  return {
    siteName: meta("og:site_name"),
    author: meta("author") || meta("article:author"),
    description: meta("description") || meta("og:description"),
    publishedTime: meta("article:published_time") || meta("date")
  };
}

function meta(name: string): string | undefined {
  const selector = `meta[name="${cssEscape(name)}"], meta[property="${cssEscape(name)}"]`;
  const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim();
  return value || undefined;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
