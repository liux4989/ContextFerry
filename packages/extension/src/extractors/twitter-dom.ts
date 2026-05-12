import type { ExtractionPayload } from "./twitter-format";

export type TweetExtractionResult = {
  payload: ExtractionPayload;
  markdown: string;
  statusId: string;
  targetText: string;
};

export type FocalTweetContent = {
  tweetContent: string;
  repostedTweet: string;
  media: string[];
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

export async function extractTwitterPayloadFromDom(statusId: string): Promise<ExtractionPayload> {
  const { tweetContent, repostedTweet, media } = await extractFocalTweetContent(statusId);
  if (!tweetContent) {
    throw new Error("The current tweet text is empty or unavailable.");
  }

  const threadTweets = await extractVisibleThreadTweets(statusId);
  const threadMedia = await extractVisibleThreadMedia(statusId);
  const comments = await extractVisibleComments(statusId);
  const allMedia = [...new Set([...threadMedia, ...media])];

  return {
    tweet_type: threadTweets.length > 0 ? "thread" : repostedTweet ? "repost_or_quote" : "single",
    tweet_content: tweetContent,
    thread_tweets: threadTweets.length > 0 ? threadTweets : undefined,
    reposted_tweet: repostedTweet || undefined,
    media: allMedia.length > 0 ? allMedia : undefined,
    comments: comments.length > 0 ? comments : undefined
  };
}

export function titleForTweet(payload: ExtractionPayload, targetText: string, statusId: string): string {
  const handle = getHandleFromUrl(location.href);
  const prefix = payload.tweet_type === "thread" ? "Thread" : "Tweet";
  const author = handle ? ` by @${handle}` : "";
  return `${prefix}${author}: ${summarizeText(targetText, 80) || statusId}`;
}

export function getStatusIdFromUrl(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

export function isTwitterHost(hostname: string): boolean {
  return /(^|\.)x\.com$/i.test(hostname) || /(^|\.)twitter\.com$/i.test(hostname);
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

async function extractFocalTweetContent(statusId: string): Promise<FocalTweetContent> {
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
