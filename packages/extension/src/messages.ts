import type { AgentDocument } from "@context-ferry/shared";

export type ExtractPageMessage = {
  type: "extract-page";
};

export type ExtractPageResponse =
  | { ok: true; document: AgentDocument }
  | { ok: false; error: string };
