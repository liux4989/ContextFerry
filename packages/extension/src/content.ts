import type { AgentDocument } from "@context-ferry/shared";
import type { ExtractPageMessage, ExtractPageResponse } from "./messages";
import { extractors } from "./extractors";

chrome.runtime.onMessage.addListener((message: ExtractPageMessage, _sender, sendResponse) => {
  if (message?.type !== "extract-page") return false;

  void extractCurrentPage()
    .then((document) => {
      sendResponse({ ok: true, document } satisfies ExtractPageResponse);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extraction error"
      } satisfies ExtractPageResponse);
    });

  return true;
});

async function extractCurrentPage(): Promise<AgentDocument> {
  const extractor = extractors.find((candidate) => candidate.matches(window.location, document));
  if (!extractor) {
    throw new Error("No extractor is available for this page.");
  }

  return extractor.extract();
}
