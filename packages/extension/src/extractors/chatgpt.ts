import TurndownService from "turndown";
import { countWords, type AgentDocument } from "@context-ferry/shared";
import type { PageExtractor } from "./types";

const WAIT_TIMEOUT_MS = 6000;
const WAIT_INTERVAL_MS = 200;

const NOISE_LINE_PATTERNS = [
  /^This is a copy of a shared ChatGPT conversation$/i,
  /^Report conversation$/i,
  /^Stopped thinking$/i,
  /^Message ChatGPT$/i,
  /^Voice$/i,
  /^Log in$/i,
  /^Sign up for free$/i,
  /^ChatGPT can make mistakes\./i
];

export const chatgptExtractor: PageExtractor = {
  id: "chatgpt",
  matches: (currentLocation) => isChatGptConversationUrl(currentLocation),
  extract: extractChatGptDocument
};

async function extractChatGptDocument(): Promise<AgentDocument> {
  await waitFor(() => {
    const root = findConversationRoot();
    if (!root) return false;
    return readConversationText(root).length >= 120;
  }, WAIT_TIMEOUT_MS, WAIT_INTERVAL_MS);

  const root = findConversationRoot();
  if (!root) {
    throw new Error("Open a ChatGPT conversation page first.");
  }

  const markdown = markdownFromConversation(root);
  const text = normalizeWhitespace(readConversationText(root));
  if (!markdown || text.length < 40) {
    throw new Error("ChatGPT conversation content is not available on this page.");
  }

  return {
    id: crypto.randomUUID(),
    url: location.href,
    title: readConversationTitle(markdown),
    siteName: "ChatGPT",
    excerpt: summarizeText(text, 220),
    lang: document.documentElement.lang || undefined,
    capturedAt: new Date().toISOString(),
    wordCount: countWords(text),
    markdown,
    text
  };
}

function isChatGptConversationUrl(currentLocation: Location): boolean {
  if (!/(^|\.)chatgpt\.com$/i.test(currentLocation.hostname)) return false;

  return /^\/share\/[^/]+/i.test(currentLocation.pathname)
    || /^\/c\/[^/]+/i.test(currentLocation.pathname)
    || /^\/g\/[^/]+\/c\/[^/]+/i.test(currentLocation.pathname);
}

function findConversationRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#thread")
    || document.querySelector<HTMLElement>("main#main")
    || document.querySelector<HTMLElement>("main");
}

function readConversationTitle(markdown: string): string {
  const cleaned = document.title.replace(/^ChatGPT\s*-\s*/i, "").trim();
  if (cleaned) return cleaned;

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || location.href;
}

function markdownFromConversation(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const node of Array.from(clone.querySelectorAll([
    "#thread-bottom-container",
    "header",
    "nav",
    "aside",
    "footer",
    "form",
    "textarea",
    "input",
    "button",
    "svg",
    "script",
    "style",
    "[role='navigation']",
    "[role='dialog']",
    "[role='tooltip']",
    "[aria-hidden='true']",
    "[inert]"
  ].join(",")))) {
    node.remove();
  }

  for (const anchor of Array.from(clone.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    anchor.href = absoluteUrl(anchor.getAttribute("href") || "");
  }

  removeNoiseByText(clone);

  const markdown = turndown().turndown(clone.innerHTML || clone.textContent || "");
  return cleanMarkdown(markdown);
}

function removeNoiseByText(root: HTMLElement): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("div, span, p, a"));
  for (const element of elements) {
    const text = normalizeWhitespace(element.textContent || "");
    if (!text) continue;
    if (!NOISE_LINE_PATTERNS.some((pattern) => pattern.test(text))) continue;
    if (element.querySelector("img, video, pre, code")) continue;
    element.remove();
  }
}

function readConversationText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const node of Array.from(clone.querySelectorAll([
    "#thread-bottom-container",
    "header",
    "nav",
    "aside",
    "footer",
    "form",
    "textarea",
    "input",
    "button",
    "svg",
    "script",
    "style",
    "[role='navigation']",
    "[role='dialog']",
    "[role='tooltip']",
    "[aria-hidden='true']",
    "[inert]"
  ].join(",")))) {
    node.remove();
  }
  removeNoiseByText(clone);

  const lines = (clone.innerText || clone.textContent || "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

  return lines.join("\n\n");
}

function cleanMarkdown(value: string): string {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(normalizeWhitespace(line))));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function turndown(): TurndownService {
  return new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.origin).href;
  } catch {
    return value;
  }
}

function summarizeText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
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
