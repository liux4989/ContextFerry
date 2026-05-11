import { countWords, type AgentDocument } from "@context-ferry/shared";
import {
  extractGraphqlTweets,
  formatForPaste,
  type ExtractionPayload,
  type NormalizedTweet
} from "../../../../../../BrowserPlugins/twitter_pilot/packages/x-extractor/src";
import type { PageExtractor } from "./types";

type TweetExtractionResult = {
  payload: ExtractionPayload;
  markdown: string;
  statusId: string;
  targetText: string;
};

const DROP_LINES = new Set([
  "pinned",
  "discover more",
  "show more",
  "view quotes",
  "show translation",
  "translate post",
  "translate",
  "article",
  "promoted",
  "ad",
  "advertisement"
]);

const COUNT_RE = /^\d[\d,.\s]*[KMBkmb]?$/;
const GRAPHQL_MESSAGE_TYPE = "CONTEXT_FERRY_X_GRAPHQL_RESPONSE";
const graphqlTweetsById = new Map<string, NormalizedTweet>();

export const twitterExtractor: PageExtractor = {
  id: "twitter",
  matches: (currentLocation) => isTwitterHost(currentLocation.hostname),
  extract: extractTwitterDocument
};

installGraphqlCaptureBridge();

async function extractTwitterDocument(): Promise<AgentDocument> {
  const result = await extractCurrentTweetContext();
  const text = result.markdown;
  const title = titleForTweet(result);

  return {
    id: crypto.randomUUID(),
    url: location.href,
    title,
    siteName: "X",
    excerpt: result.targetText,
    lang: document.documentElement.lang || undefined,
    capturedAt: new Date().toISOString(),
    wordCount: countWords(text),
    markdown: result.markdown,
    text
  };
}

async function extractCurrentTweetContext(): Promise<TweetExtractionResult> {
  const statusId = getStatusIdFromUrl(window.location.href);
  if (!statusId) {
    throw new Error("Open a tweet detail page on x.com or twitter.com first.");
  }

  const graphqlResult = extractGraphqlTweetContext(statusId);
  if (graphqlResult) {
    return graphqlResult;
  }

  const { tweetContent, repostedTweet, media } = await extractFocalTweetContent(statusId);
  if (!tweetContent) {
    throw new Error("The current tweet text is empty or unavailable.");
  }

  const threadTweets = await extractVisibleThreadTweets(statusId);
  const threadMedia = await extractVisibleThreadMedia(statusId);
  const comments = await extractVisibleComments(statusId);
  const allMedia = [...new Set([...threadMedia, ...media])];
  const payload: ExtractionPayload = {
    tweet_type: threadTweets.length > 0 ? "thread" : repostedTweet ? "repost_or_quote" : "single",
    tweet_content: tweetContent,
    thread_tweets: threadTweets.length > 0 ? threadTweets : undefined,
    reposted_tweet: repostedTweet || undefined,
    media: allMedia.length > 0 ? allMedia : undefined,
    comments: comments.length > 0 ? comments : undefined
  };

  return {
    payload,
    markdown: formatForPaste(payload),
    statusId,
    targetText: tweetContent
  };
}

function extractGraphqlTweetContext(statusId: string): TweetExtractionResult | null {
  const targetTweet = graphqlTweetsById.get(statusId);
  if (!targetTweet) {
    return null;
  }

  const targetTime = new Date(targetTweet.createdAt).getTime();
  const threadTweets = [...graphqlTweetsById.values()]
    .filter((tweet) => (
      tweet.id !== statusId
      && tweet.conversationId === targetTweet.conversationId
      && tweet.authorHandle === targetTweet.authorHandle
      && new Date(tweet.createdAt).getTime() < targetTime
    ))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const comments = [...graphqlTweetsById.values()]
    .filter((tweet) => (
      tweet.id !== statusId
      && tweet.conversationId === targetTweet.conversationId
      && tweet.authorHandle !== targetTweet.authorHandle
      && new Date(tweet.createdAt).getTime() > targetTime
    ))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(0, 12);
  const media = [...new Set(
    [...threadTweets, targetTweet]
      .flatMap((tweet) => tweet.media || [])
      .map(formatGraphqlMedia)
  )];
  const payload: ExtractionPayload = {
    tweet_type: threadTweets.length > 0 ? "thread" : "single",
    tweet_content: targetTweet.text,
    thread_tweets: threadTweets.length > 0 ? threadTweets.map((tweet) => tweet.text).filter(Boolean) : undefined,
    media: media.length > 0 ? media : undefined,
    comments: comments.length > 0 ? comments.map((tweet) => tweet.text).filter(Boolean) : undefined
  };

  return {
    payload,
    markdown: formatForPaste(payload),
    statusId,
    targetText: targetTweet.text
  };
}

function installGraphqlCaptureBridge(): void {
  if (!isTwitterHost(window.location.hostname)) return;

  const script = document.createElement("script");
  script.textContent = `(() => {
    if (window.__contextFerryXGraphqlCaptureInstalled) return;
    window.__contextFerryXGraphqlCaptureInstalled = true;
    const postGraphqlPayload = (url, payload) => {
      window.postMessage({ type: "${GRAPHQL_MESSAGE_TYPE}", url, payload }, "*");
    };
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = String(args[0]?.url || args[0] || response.url || "");
      if (url.includes("/graphql/")) {
        response.clone().json().then((payload) => postGraphqlPayload(url, payload)).catch(() => {});
      }
      return response;
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__contextFerryXGraphqlUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener("load", function() {
        const url = String(this.__contextFerryXGraphqlUrl || this.responseURL || "");
        if (!url.includes("/graphql/")) return;
        try {
          const payload = JSON.parse(this.responseText);
          postGraphqlPayload(url, payload);
        } catch {}
      });
      return originalSend.apply(this, args);
    };
  })();`;

  const root = document.documentElement || document.head || document.body;
  if (root) {
    root.appendChild(script);
    script.remove();
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    (document.documentElement || document.head || document.body)?.appendChild(script);
    script.remove();
  }, { once: true });
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.data?.type !== GRAPHQL_MESSAGE_TYPE) {
    return;
  }
  rememberGraphqlTweets(event.data.payload);
});

function rememberGraphqlTweets(payload: unknown): void {
  for (const tweet of extractGraphqlTweets(payload as Record<string, unknown>, { tabSource: "live_graphql" })) {
    graphqlTweetsById.set(tweet.id, tweet);
  }
}

function titleForTweet(result: TweetExtractionResult): string {
  const handle = getHandleFromUrl(location.href);
  const prefix = result.payload.tweet_type === "thread" ? "Thread" : "Tweet";
  const author = handle ? ` by @${handle}` : "";
  return `${prefix}${author}: ${summarizeText(result.targetText, 80) || result.statusId}`;
}

function summarizeText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value).replace(/\n/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function cleanTextBlocks(rawText: string): string[] {
  const seen = new Set<string>();
  const blocks: string[] = [];
  const parts = rawText.split(/\n{2,}/);

  for (const part of parts) {
    const lines: string[] = [];
    for (const rawLine of part.split("\n")) {
      const line = normalizeWhitespace(rawLine);
      if (!line) continue;
      const lowered = line.toLowerCase();
      if (DROP_LINES.has(lowered)) continue;
      if (COUNT_RE.test(line)) continue;
      lines.push(line);
    }

    const text = lines.join("\n").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    blocks.push(text);
  }

  return blocks;
}

function cleanTweetText(rawText: string): string {
  return cleanTextBlocks(rawText).join("\n\n").trim();
}

function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return !isTwitterHost(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeAnchorText(anchor: HTMLAnchorElement): string {
  const label = anchor.getAttribute("title") || anchor.getAttribute("aria-label") || anchor.textContent || "";
  return normalizeWhitespace(label);
}

function formatVisibleUrl(label: string): string {
  const trimmed = normalizeWhitespace(label);
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#:]|$)/i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

function extractTweetText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  const anchors = Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"));

  for (const anchor of anchors) {
    const href = normalizeWhitespace(anchor.href);
    const label = formatVisibleUrl(normalizeAnchorText(anchor));
    const replacement = href && isExternalUrl(href) ? label.replace(/\u2026+$/, "").trim() || href : label;
    anchor.replaceWith(document.createTextNode(replacement));
  }

  return cleanTweetText(clone.innerText || clone.textContent || "");
}

function getNestedTweetContainer(node: HTMLElement, article: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current && current !== article) {
    if (
      current.getAttribute("role") === "link"
      && current.querySelector('[data-testid="Tweet-User-Avatar"]')
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function getNestedContextKey(
  node: HTMLElement,
  article: HTMLElement,
  articleStatusId: string | null
): string | null {
  const nestedContainer = getNestedTweetContainer(node, article);
  if (nestedContainer) {
    const nestedTimeLink = nestedContainer.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)');
    const nestedStatusId = nestedTimeLink
      ? extractStatusIdFromHref(nestedTimeLink.getAttribute("href") || "")
      : null;
    if (nestedStatusId && nestedStatusId !== articleStatusId) {
      return `status:${nestedStatusId}`;
    }

    const nestedPreview = normalizeWhitespace(nestedContainer.textContent || "").slice(0, 120);
    if (nestedPreview) {
      return `quote:${nestedPreview}`;
    }
  }

  if (!articleStatusId) return null;

  let current = node.parentElement;
  while (current && current !== article) {
    const timeLink = current.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)');
    if (timeLink) {
      const nestedStatusId = extractStatusIdFromHref(timeLink.getAttribute("href") || "");
      if (nestedStatusId && nestedStatusId !== articleStatusId) {
        return `status:${nestedStatusId}`;
      }
    }
    current = current.parentElement;
  }

  return null;
}

function extractOwnTweetBlocks(article: HTMLElement): string[] {
  const articleStatusId = getArticleStatusId(article);
  return Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))
    .filter((node) => !getNestedContextKey(node, article, articleStatusId))
    .map((node) => extractTweetText(node))
    .filter(Boolean);
}

function extractNestedTweetText(article: HTMLElement): string {
  const articleStatusId = getArticleStatusId(article);
  const grouped = new Map<string, string[]>();

  for (const node of Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))) {
    const nestedContextKey = getNestedContextKey(node, article, articleStatusId);
    if (!nestedContextKey) continue;
    const text = extractTweetText(node);
    if (!text) continue;
    const existing = grouped.get(nestedContextKey) ?? [];
    if (!existing.includes(text)) {
      existing.push(text);
      grouped.set(nestedContextKey, existing);
    }
  }

  return Array.from(grouped.values())
    .map((blocks) => blocks.join("\n\n").trim())
    .filter(Boolean)
    .join("\n\n\n")
    .trim();
}

function extractTweetMedia(article: HTMLElement): string[] {
  const media = new Set<string>();

  for (const image of Array.from(article.querySelectorAll<HTMLImageElement>('img[src]'))) {
    const src = image.currentSrc || image.src;
    if (!src || !/pbs\.twimg\.com\/media\//i.test(src)) continue;
    const alt = normalizeWhitespace(image.alt);
    media.add(alt ? `image: ${src} (${alt})` : `image: ${src}`);
  }

  for (const video of Array.from(article.querySelectorAll<HTMLVideoElement>("video[src]"))) {
    const src = video.currentSrc || video.src;
    if (src) media.add(`video: ${src}`);
  }

  return [...media];
}

function isCommercialRecommendationArticle(article: HTMLElement, text: string): boolean {
  const articleText = normalizeWhitespace(article.innerText || "").toLowerCase();
  const normalizedText = normalizeWhitespace(text).toLowerCase();
  if (!normalizedText) return true;
  if (DROP_LINES.has(normalizedText)) return true;
  if (normalizedText === "discover more" || normalizedText.startsWith("discover more ")) return true;
  return articleText.includes("promoted") || articleText.includes("discover more");
}

async function waitFor(predicate: () => boolean, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return predicate();
}

function getStatusIdFromUrl(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function getHandleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const [handle, segment] = parsed.pathname.split("/").filter(Boolean);
    return segment === "status" ? handle : null;
  } catch {
    return null;
  }
}

function getVisibleTweetArticles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
}

function findTargetArticle(statusId: string): HTMLElement | null {
  return getVisibleTweetArticles().find((article) => getArticleStatusId(article) === statusId) ?? null;
}

function findTargetArticleIndex(articles: HTMLElement[], statusId: string): number {
  return articles.findIndex((article) => getArticleStatusId(article) === statusId);
}

function extractStatusIdFromHref(href: string): string | null {
  const match = href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function getArticleStatusId(article: HTMLElement): string | null {
  const timeLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)');
  if (timeLink) {
    return extractStatusIdFromHref(timeLink.getAttribute("href") || "");
  }

  for (const link of Array.from(article.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const statusId = extractStatusIdFromHref(link.getAttribute("href") || "");
    if (statusId) return statusId;
  }
  return null;
}

function getProfileHandleFromHref(href: string): string | null {
  try {
    const parsed = new URL(href, window.location.origin);
    if (!isTwitterHost(parsed.hostname)) return null;

    const [segment, extra] = parsed.pathname.split("/").filter(Boolean);
    if (!segment || extra || ["home", "i", "explore", "search", "notifications", "messages"].includes(segment)) {
      return null;
    }

    return segment.toLowerCase();
  } catch {
    return null;
  }
}

function getArticleAuthorHandle(article: HTMLElement): string | null {
  for (const link of Array.from(article.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const handle = getProfileHandleFromHref(link.getAttribute("href") || "");
    if (handle) return handle;
  }
  return null;
}

async function expandShowMore(targetArticle: HTMLElement): Promise<void> {
  const showMore = targetArticle.querySelector<HTMLElement>('[data-testid="tweet-text-show-more-link"]');
  if (!showMore) return;

  const beforeText = (
    targetArticle.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText || ""
  ).trim();
  showMore.click();
  await waitFor(() => {
    const currentText = (
      targetArticle.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText || ""
    ).trim();
    return (
      currentText.length > beforeText.length
      || !targetArticle.querySelector('[data-testid="tweet-text-show-more-link"]')
    );
  }, 800, 200);
}

async function extractFocalTweetContent(statusId: string): Promise<{ tweetContent: string; repostedTweet: string; media: string[] }> {
  await waitFor(() => {
    const targetArticle = findTargetArticle(statusId);
    return Boolean(
      targetArticle?.querySelector('[data-testid="tweetText"]')
      || targetArticle?.querySelector('[data-testid="tweet-text-show-more-link"]')
    );
  }, 4000, 200);

  const targetArticle = findTargetArticle(statusId);
  if (!targetArticle) {
    return { tweetContent: "", repostedTweet: "", media: [] };
  }

  await expandShowMore(targetArticle);

  return {
    tweetContent: extractOwnTweetBlocks(targetArticle).join("\n\n"),
    repostedTweet: extractNestedTweetText(targetArticle),
    media: extractTweetMedia(targetArticle)
  };
}

async function extractVisibleThreadTweets(statusId: string): Promise<string[]> {
  await waitFor(() => getVisibleTweetArticles().length > 0, 4000, 200);

  const targetArticle = findTargetArticle(statusId);
  const targetAuthorHandle = targetArticle ? getArticleAuthorHandle(targetArticle) : null;
  if (!targetAuthorHandle) return [];

  const threadTweets: string[] = [];
  const seenTexts = new Set<string>();
  const articles = getVisibleTweetArticles();
  const targetIndex = findTargetArticleIndex(articles, statusId);
  if (targetIndex <= 0) return [];

  for (const article of articles.slice(0, targetIndex)) {
    const articleStatusId = getArticleStatusId(article);
    if (!articleStatusId || articleStatusId === statusId) continue;
    if (getArticleAuthorHandle(article) !== targetAuthorHandle) continue;

    await expandShowMore(article);
    const text = extractOwnTweetBlocks(article).join("\n\n").trim();
    if (!text || isCommercialRecommendationArticle(article, text) || seenTexts.has(text)) continue;

    seenTexts.add(text);
    threadTweets.push(text);
  }

  return threadTweets;
}

async function extractVisibleThreadMedia(statusId: string): Promise<string[]> {
  await waitFor(() => getVisibleTweetArticles().length > 0, 4000, 200);

  const targetArticle = findTargetArticle(statusId);
  const targetAuthorHandle = targetArticle ? getArticleAuthorHandle(targetArticle) : null;
  if (!targetAuthorHandle) return [];

  const media = new Set<string>();
  const articles = getVisibleTweetArticles();
  const targetIndex = findTargetArticleIndex(articles, statusId);
  if (targetIndex <= 0) return [];

  for (const article of articles.slice(0, targetIndex)) {
    const articleStatusId = getArticleStatusId(article);
    if (!articleStatusId || articleStatusId === statusId) continue;
    if (getArticleAuthorHandle(article) !== targetAuthorHandle) continue;

    for (const item of extractTweetMedia(article)) {
      media.add(item);
    }
  }

  return [...media];
}

async function extractVisibleComments(statusId: string): Promise<string[]> {
  await waitFor(() => getVisibleTweetArticles().length > 0, 4000, 200);

  const targetArticle = findTargetArticle(statusId);
  const targetAuthorHandle = targetArticle ? getArticleAuthorHandle(targetArticle) : null;
  const comments: string[] = [];
  const seenTexts = new Set<string>();
  const articles = getVisibleTweetArticles();
  const targetIndex = findTargetArticleIndex(articles, statusId);
  const commentArticles = targetIndex >= 0 ? articles.slice(targetIndex + 1) : articles;

  for (const article of commentArticles) {
    const articleStatusId = getArticleStatusId(article);
    if (!articleStatusId || articleStatusId === statusId) continue;
    if (targetAuthorHandle && getArticleAuthorHandle(article) === targetAuthorHandle) continue;

    await expandShowMore(article);
    const text = extractOwnTweetBlocks(article).join("\n\n").trim();
    if (isCommercialRecommendationArticle(article, text) || seenTexts.has(text)) continue;

    seenTexts.add(text);
    comments.push(text);
    if (comments.length >= 12) break;
  }

  return comments;
}

function formatGraphqlMedia(media: NormalizedTweet["media"][number]): string {
  const type = media.type || "media";
  const url = media.url || media.expandedUrl || media.displayUrl || "";
  const alt = media.altText ? ` (${media.altText})` : "";
  return url ? `${type}: ${url}${alt}` : type;
}

function isTwitterHost(hostname: string): boolean {
  return /(^|\.)x\.com$/i.test(hostname) || /(^|\.)twitter\.com$/i.test(hostname);
}
