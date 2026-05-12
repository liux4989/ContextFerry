import { countWords, type AgentDocument } from "@context-ferry/shared";
import { extractTwitterPayloadFromDom, getStatusIdFromUrl, isTwitterHost, titleForTweet } from "./twitter-dom";
import { formatForPaste } from "./twitter-format";
import type { PageExtractor } from "./types";

export const twitterExtractor: PageExtractor = {
  id: "twitter",
  matches: (currentLocation) => isTwitterHost(currentLocation.hostname),
  extract: extractTwitterDocument
};

async function extractTwitterDocument(): Promise<AgentDocument> {
  const statusId = getStatusIdFromUrl(window.location.href);
  if (!statusId) {
    throw new Error("Open a tweet detail page on x.com or twitter.com first.");
  }

  const payload = await extractTwitterPayloadFromDom(statusId);
  const markdown = formatForPaste(payload);
  const targetText = payload.tweet_content;

  return {
    id: crypto.randomUUID(),
    url: location.href,
    title: titleForTweet(payload, targetText, statusId),
    siteName: "X",
    excerpt: targetText,
    lang: document.documentElement.lang || undefined,
    capturedAt: new Date().toISOString(),
    wordCount: countWords(markdown),
    markdown,
    text: markdown
  };
}
