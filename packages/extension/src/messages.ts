import type { AgentDocument } from "@agent-context-bridge/shared";

export type ExtractPageMessage = {
  type: "extract-page";
};

export type ExtractPageResponse =
  | { ok: true; document: AgentDocument }
  | { ok: false; error: string };
