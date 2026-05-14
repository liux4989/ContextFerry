import type { AgentDocument, CreateContextResponse } from "@context-ferry/shared";
import type { ExtractPageResponse } from "./messages";

const publishTimeoutMs = 8_000;

const storageKeys = {
  workerUrl: "workerUrl",
  batch: "batch"
} as const;

let currentDocument: AgentDocument | null = null;
let batch: AgentDocument[] = [];

const els = {
  addCurrent: byId<HTMLButtonElement>("addCurrent"),
  publish: byId<HTMLButtonElement>("publish"),
  result: byId<HTMLElement>("result"),
  contextLink: byId<HTMLInputElement>("contextLink"),
  sourceList: byId<HTMLUListElement>("sourceList"),
  workerUrl: byId<HTMLInputElement>("workerUrl")
};

void init();

async function init(): Promise<void> {
  const stored = await chrome.storage.local.get([
    storageKeys.workerUrl,
    storageKeys.batch
  ]);
  const storedWorkerUrl = stored[storageKeys.workerUrl];
  els.workerUrl.value = typeof storedWorkerUrl === "string" ? storedWorkerUrl : "";

  const storedBatch = stored[storageKeys.batch];
  batch = isAgentDocumentArray(storedBatch) ? storedBatch : [];
  renderSources();

  els.addCurrent.addEventListener("click", () => void runAction(addCurrentSource));
  els.publish.addEventListener("click", () => void runAction(publishSelectedSources));
}

async function extractCurrentPage(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab is available.");

  const response = await chrome.tabs.sendMessage(tab.id, { type: "extract-page" }) as ExtractPageResponse;
  if (!response.ok) throw new Error(response.error);

  const document = response.document;
  currentDocument = document;
}

async function addCurrentSource(): Promise<void> {
  if (!currentDocument) {
    await extractCurrentPage();
  }

  const document = currentDocument;
  if (!document) return;

  batch = [...batch.filter((item) => item.url !== document.url), document];
  await chrome.storage.local.set({ [storageKeys.batch]: batch });
  renderSources();
}

async function publishSelectedSources(): Promise<void> {
  let sources = batch;
  if (batch.length === 0) {
    if (!currentDocument) {
      await extractCurrentPage();
    }
    if (!currentDocument) return;
    sources = [currentDocument];
  }

  const title = sources.length === 1 ? sources[0].title : `${sources.length} Source Context`;
  const response = await createContext(sources, title);
  renderPublishedLink(response.url);
}

async function createContext(sources: AgentDocument[], title: string): Promise<CreateContextResponse> {
  const workerUrl = normalizedWorkerUrl();
  await chrome.storage.local.set({
    [storageKeys.workerUrl]: workerUrl
  });

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), publishTimeoutMs);
  try {
    response = await fetch(`${workerUrl}/api/contexts`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({ title, sources })
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Worker timed out after ${publishTimeoutMs / 1000}s at ${workerUrl}`);
    }
    throw new Error(`Could not reach Worker at ${workerUrl}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Worker returned ${response.status}`);
  }

  return response.json() as Promise<CreateContextResponse>;
}

async function runAction(action: () => Promise<void>): Promise<void> {
  setButtonsDisabled(true);
  try {
    await action();
  } catch (error) {
    renderPublishedLink(error instanceof Error ? error.message : "Action failed.");
  } finally {
    setButtonsDisabled(false);
  }
}

function renderPublishedLink(url: string): void {
  els.result.hidden = false;
  els.contextLink.value = url;
  els.contextLink.select();
}

async function removeSource(url: string): Promise<void> {
  batch = batch.filter((source) => source.url !== url);
  await chrome.storage.local.set({ [storageKeys.batch]: batch });
  renderSources();
}

function renderSources(): void {
  els.sourceList.replaceChildren();
  if (batch.length === 0) {
    els.sourceList.append(createCurrentPlaceholder());
    return;
  }

  for (const source of batch) {
    els.sourceList.append(createSourceItem(source));
  }

  els.sourceList.append(createCurrentPlaceholder());
}

function createCurrentPlaceholder(): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const content = document.createElement("span");
  const title = document.createElement("span");
  const meta = document.createElement("span");

  item.className = "sourceItem placeholder";
  button.className = "iconButton";
  button.type = "button";
  button.setAttribute("aria-label", "Add current page");
  button.textContent = "+";
  button.addEventListener("click", () => void runAction(addCurrentSource));

  title.className = "sourceTitle";
  meta.className = "sourceMeta";
  title.textContent = "Current page";
  meta.textContent = "Add this page as a selected source";
  content.append(title, meta);
  item.append(button, content);
  return item;
}

function createSourceItem(source: AgentDocument): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const content = document.createElement("span");
    const title = document.createElement("span");
    const meta = document.createElement("span");

  item.className = "sourceItem";
  button.className = "iconButton removeButton";
  button.type = "button";
  button.setAttribute("aria-label", `Remove ${source.title}`);
  button.textContent = "x";
  button.addEventListener("click", () => void removeSource(source.url));

  title.className = "sourceTitle";
  meta.className = "sourceMeta";
  title.textContent = source.title;
  meta.textContent = source.url;
  content.append(title, meta);
  item.append(button, content);
  return item;
}

function normalizedWorkerUrl(): string {
  return normalizeWorkerUrl(els.workerUrl.value);
}

function normalizeWorkerUrl(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new Error("Worker URL is required.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Worker URL must be a full https URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Worker URL must use https.");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function setButtonsDisabled(disabled: boolean): void {
  const listButtons = Array.from(els.sourceList.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of [els.addCurrent, els.publish, ...listButtons]) {
    button.disabled = disabled;
  }
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function isAgentDocumentArray(value: unknown): value is AgentDocument[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<AgentDocument>;
    return typeof candidate.id === "string"
      && typeof candidate.url === "string"
      && typeof candidate.title === "string"
      && typeof candidate.markdown === "string"
      && typeof candidate.text === "string";
  });
}
