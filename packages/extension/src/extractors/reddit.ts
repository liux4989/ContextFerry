import { countWords, type AgentDocument } from "@context-ferry/shared";
import TurndownService from "turndown";
import type { PageExtractor } from "./types";

type RedditComment = {
  id: string;
  author: string;
  score?: string;
  depth: number;
  permalink?: string;
  created?: string;
  markdown: string;
  text: string;
};

const MAX_COMMENTS = 40;

export const redditExtractor: PageExtractor = {
  id: "reddit",
  matches: (currentLocation) => isRedditPostUrl(currentLocation),
  extract: extractRedditDocument
};

async function extractRedditDocument(): Promise<AgentDocument> {
  await waitFor(() => Boolean(getPostElement()), 4000, 200);

  const post = getPostElement();
  if (!post) {
    throw new Error("Open a Reddit post detail page first.");
  }

  const title = attr(post, "post-title") || document.title || location.href;
  const subreddit = attr(post, "subreddit-prefixed-name") || attr(post, "subreddit-name");
  const author = attr(post, "author");
  const postMarkdown = markdownFromPost(post);
  const postText = textFromPost(post);
  const comments = extractVisibleComments();
  const markdown = formatRedditThread({
    title,
    subreddit,
    author,
    score: attr(post, "score"),
    commentCount: attr(post, "comment-count"),
    created: attr(post, "created-timestamp"),
    postMarkdown,
    comments
  });
  const text = [
    title,
    postText,
    comments.map((comment) => comment.text).join("\n\n")
  ].filter(Boolean).join("\n\n");

  return {
    id: crypto.randomUUID(),
    url: canonicalRedditUrl(post),
    title: `${subreddit ? `${subreddit}: ` : "Reddit: "}${title}`,
    siteName: "Reddit",
    byline: author ? `u/${author}` : undefined,
    excerpt: summarizeText(postText || comments[0]?.text || title, 180),
    lang: attr(post, "post-language") || document.documentElement.lang || undefined,
    publishedTime: normalizeRedditTimestamp(attr(post, "created-timestamp")),
    capturedAt: new Date().toISOString(),
    wordCount: countWords(text),
    markdown,
    text
  };
}

function formatRedditThread(input: {
  title: string;
  subreddit?: string;
  author?: string;
  score?: string;
  commentCount?: string;
  created?: string;
  postMarkdown: string;
  comments: RedditComment[];
}): string {
  const metadata = [
    input.subreddit ? `Subreddit: ${input.subreddit}` : undefined,
    input.author ? `Author: u/${input.author}` : undefined,
    input.score ? `Score: ${input.score}` : undefined,
    input.commentCount ? `Comments: ${input.commentCount}` : undefined,
    input.created ? `Posted: ${normalizeRedditTimestamp(input.created)}` : undefined
  ].filter(Boolean);
  const parts = [
    `# ${input.title}`,
    ...metadata,
    "## Post",
    input.postMarkdown || "_No visible post body._"
  ];

  if (input.comments.length > 0) {
    parts.push("## Visible Comments");
    for (const comment of input.comments) {
      const commentMeta = [
        `u/${comment.author || "unknown"}`,
        comment.score ? `${comment.score} points` : undefined,
        comment.created ? normalizeRedditTimestamp(comment.created) : undefined,
        comment.depth > 0 ? `depth ${comment.depth}` : undefined
      ].filter(Boolean).join(" - ");
      parts.push(`### ${commentMeta || comment.id}`);
      parts.push(comment.markdown);
      if (comment.permalink) {
        parts.push(`[Permalink](${absoluteUrl(comment.permalink)})`);
      }
    }
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

function markdownFromPost(post: Element): string {
  const body = post.querySelector<HTMLElement>('[slot="text-body"] [property="schema:articleBody"]')
    || post.querySelector<HTMLElement>('[slot="text-body"]');
  if (body) return markdownFromElement(body);

  const contentHref = attr(post, "content-href");
  if (contentHref && contentHref !== location.href) {
    return `[${contentHref}](${contentHref})`;
  }

  return "";
}

function textFromPost(post: Element): string {
  const body = post.querySelector<HTMLElement>('[slot="text-body"] [property="schema:articleBody"]')
    || post.querySelector<HTMLElement>('[slot="text-body"]');
  return normalizeWhitespace(body?.innerText || body?.textContent || "");
}

function extractVisibleComments(): RedditComment[] {
  const comments: RedditComment[] = [];
  const seen = new Set<string>();

  for (const comment of Array.from(document.querySelectorAll<HTMLElement>("shreddit-comment"))) {
    if (comment.getAttribute("aria-hidden") === "true") continue;

    const body = comment.querySelector<HTMLElement>('[slot="comment"]');
    if (!body) continue;

    const text = normalizeWhitespace(body.innerText || body.textContent || "");
    if (!text || seen.has(text)) continue;
    seen.add(text);

    comments.push({
      id: attr(comment, "thingid") || `comment-${comments.length + 1}`,
      author: attr(comment, "author") || "unknown",
      score: attr(comment, "score"),
      depth: Number.parseInt(attr(comment, "depth") || "0", 10) || 0,
      permalink: attr(comment, "permalink"),
      created: attr(comment, "created"),
      markdown: markdownFromElement(body),
      text
    });

    if (comments.length >= MAX_COMMENTS) break;
  }

  return comments;
}

function markdownFromElement(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const node of Array.from(clone.querySelectorAll("script, style, faceplate-loader, faceplate-perfmark"))) {
    node.remove();
  }
  for (const anchor of Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    anchor.href = absoluteUrl(anchor.getAttribute("href") || "");
  }

  return normalizeMarkdown(turndown().turndown(clone.innerHTML || clone.textContent || ""));
}

function turndown(): TurndownService {
  return new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
}

function getPostElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>("shreddit-post");
}

function canonicalRedditUrl(post: Element): string {
  const permalink = attr(post, "permalink");
  return permalink ? absoluteUrl(permalink) : location.href;
}

function attr(element: Element, name: string): string | undefined {
  return element.getAttribute(name)?.trim() || undefined;
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.origin).href;
  } catch {
    return value;
  }
}

function normalizeRedditTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function summarizeText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value).replace(/\n/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
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

function isRedditPostUrl(currentLocation: Location): boolean {
  return /(^|\.)reddit\.com$/i.test(currentLocation.hostname)
    && /\/r\/[^/]+\/comments\/[^/]+/i.test(currentLocation.pathname);
}
