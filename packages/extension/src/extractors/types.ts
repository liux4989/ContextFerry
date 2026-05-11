import type { AgentDocument } from "@context-ferry/shared";

export type PageExtractor = {
  id: string;
  matches(location: Location, document: Document): boolean;
  extract(): AgentDocument | Promise<AgentDocument>;
};
